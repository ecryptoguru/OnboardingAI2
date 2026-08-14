"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { withRetry, toNum, extractDemographicsFromText, truncateAtNewline } from "../lib/utils";
import {
  callGeminiWithUsage,
  createLlmUsageEntry,
  getGoogleAI,
  LlmUsageEntry,
  LlmUsageSummary,
  MODELS,
  summarizeLlmUsage,
} from "../lib/llm";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../lib/serperBudget";
import {
  GOVERNMENT_DATA_SCHEMA,
  GOVERNMENT_DATA_SYSTEM_PROMPT,
  OFFICER_EXTRACTION_SCHEMA,
  OFFICER_EXTRACTION_SYSTEM_PROMPT,
} from "../lib/prompts";
import { TEMP } from "../lib/models";
import {
  downloadPdfBuffer,
  extractPdfTables,
  extractPdfText,
} from "../lib/scrapers";
import * as Sentry from "@sentry/node";

interface SerperResult {
  organic?: Array<{ link: string; title?: string; snippet?: string }>;
}

const MAX_PDF_CONTEXT_CHARS = 50_000;
const MAX_SOURCE_CONTEXT_CHARS = 30_000;

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(
      raw.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim(),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasHtmlWrapper(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("<html") || lower.includes("<body") || lower.includes("<head");
}

function hasAnyDemographicData(
  demo: Record<string, unknown>,
  fields = [
    "total_students",
    "total_students_male",
    "total_students_female",
    "day_scholars",
    "hostelites",
    "nirf_total",
  ],
): boolean {
  return fields.some(
    (field) =>
      typeof demo[field] === "number" && Number(demo[field]) > 0,
  );
}

function isNirfProgramComplete(programs: Array<Record<string, unknown>>): boolean {
  if (programs.length < 2) return false;
  const names = programs.map((p) => String(p.name || "").toLowerCase());
  const hasUg4 = names.some((n) => /ug.*?4/.test(n));
  const hasUg5 = names.some((n) => /ug.*?5/.test(n));
  const hasPg = names.some((n) => /pg/.test(n));
  const hasPhd = names.some((n) => /phd|doctoral|research/.test(n));
  // A complete institutional view should include UG 4-year, 5-year, PG, PhD or multiple PG rows.
  const distinctCategories = [hasUg4, hasUg5, hasPg, hasPhd].filter(Boolean).length;
  return distinctCategories >= 3 || (hasUg4 && hasPg) || (hasUg5 && hasPg && programs.length >= 3);
}

function sumProgramGender(programs: Array<Record<string, unknown>>): {
  total: number;
  male: number;
  female: number;
} {
  let total = 0;
  let male = 0;
  let female = 0;
  for (const program of programs) {
    const totalVal = typeof program.total === "number" ? (program.total as number) : 0;
    const maleVal = typeof program.male === "number" ? (program.male as number) : 0;
    const femaleVal = typeof program.female === "number" ? (program.female as number) : 0;
    if (totalVal > 0) {
      total += totalVal;
      male += maleVal;
      female += femaleVal;
    } else if (maleVal > 0 || femaleVal > 0) {
      const rowTotal = maleVal + femaleVal;
      total += rowTotal;
      male += maleVal;
      female += femaleVal;
    }
  }
  return { total, male, female };
}

function applyDemographicSanity(
  demo: Record<string, unknown>,
  uniName: string,
): void {
  const hostelitesMale =
    typeof demo.hostelites_male === "number"
      ? (demo.hostelites_male as number)
      : undefined;
  const hostelitesFemale =
    typeof demo.hostelites_female === "number"
      ? (demo.hostelites_female as number)
      : undefined;
  const dayScholarsMale =
    typeof demo.day_scholars_male === "number"
      ? (demo.day_scholars_male as number)
      : undefined;
  const dayScholarsFemale =
    typeof demo.day_scholars_female === "number"
      ? (demo.day_scholars_female as number)
      : undefined;
  let total =
    typeof demo.total_students === "number"
      ? (demo.total_students as number)
      : undefined;
  const male =
    typeof demo.total_students_male === "number"
      ? (demo.total_students_male as number)
      : undefined;
  const female =
    typeof demo.total_students_female === "number"
      ? (demo.total_students_female as number)
      : undefined;
  const hostelites =
    typeof demo.hostelites === "number" ? (demo.hostelites as number) : undefined;
  const dayScholars =
    typeof demo.day_scholars === "number"
      ? (demo.day_scholars as number)
      : undefined;
  const nirfPrograms = Array.isArray(demo.nirf_programs)
    ? (demo.nirf_programs as Array<Record<string, unknown>>)
    : [];

  if (!total && male && female) {
    total = male + female;
    demo.total_students = total;
  }
  if (male && female && total && Math.abs(male + female - total) > 100) {
    console.warn(
      `[GovData] Rejecting inconsistent total_students for ${uniName}: male+female=${male + female}, total=${total}`,
    );
    delete demo.total_students;
    delete demo.total_students_male;
    delete demo.total_students_female;
    total = undefined;
  }

  if (total && hostelites && dayScholars && Math.abs(hostelites + dayScholars - total) > 100) {
    console.warn(
      `[GovData] Rejecting inconsistent total_students for ${uniName}: hostelites+day_scholars=${hostelites + dayScholars}, total=${total}`,
    );
    delete demo.total_students;
    delete demo.total_students_male;
    delete demo.total_students_female;
    total = undefined;
  }

  // ── Reconcile NIRF program rows with nirf_total / nirf_male / nirf_female ─
  if (nirfPrograms.length > 0) {
    const { total: programTotal, male: programMale, female: programFemale } =
      sumProgramGender(nirfPrograms);
    const declaredTotal = typeof demo.nirf_total === "number" ? (demo.nirf_total as number) : 0;

    if (programTotal > 0) {
      if (!declaredTotal || Math.abs(programTotal - declaredTotal) > 50) {
        console.warn(
          `[GovData] Aligning nirf_total for ${uniName}: declared=${declaredTotal}, derived=${programTotal}`,
        );
      }
      demo.nirf_total = programTotal;
      demo.nirf_male = programMale;
      demo.nirf_female = programFemale;
    }

    const nirfComplete = isNirfProgramComplete(nirfPrograms);
    if (!nirfComplete && programTotal > 0 && programTotal < 1000) {
      console.warn(
        `[GovData] NIRF data for ${uniName} looks like a partial category (programTotal=${programTotal}); removing it as an institutional total.`,
      );
      delete demo.nirf_total;
      delete demo.nirf_male;
      delete demo.nirf_female;
      delete demo.nirf_programs;
      delete demo.nirf_source;
    }
  }

  // Without program rows, a tiny NIRF total is almost certainly a specialty
  // category PDF (Architecture/Pharmacy/etc.). Reject it as an institutional total.
  const rawNirfTotal = typeof demo.nirf_total === "number" ? (demo.nirf_total as number) : undefined;
  if (rawNirfTotal !== undefined && rawNirfTotal < 500 && nirfPrograms.length === 0) {
    console.warn(
      `[GovData] NIRF total ${rawNirfTotal} for ${uniName} has no program rows and looks like a specialty category; removing.`,
    );
    delete demo.nirf_total;
    delete demo.nirf_male;
    delete demo.nirf_female;
    delete demo.nirf_programs;
    delete demo.nirf_source;
  }

  // ── Cross-source reconciliation: NIRF vs AISHE/NAAC total_students ──────
  const nirfTotal = typeof demo.nirf_total === "number" ? (demo.nirf_total as number) : undefined;
  const nirfMale = typeof demo.nirf_male === "number" ? (demo.nirf_male as number) : undefined;
  const nirfFemale =
    typeof demo.nirf_female === "number" ? (demo.nirf_female as number) : undefined;

  if (nirfTotal !== undefined && nirfTotal > 1000) {
    if (total !== undefined) {
      const diff = Math.abs(nirfTotal - total);
      const relativeDiff = diff / Math.max(nirfTotal, total);
      if (nirfTotal > total * 1.5 && (diff > 1000 || relativeDiff > 0.25)) {
        console.warn(
          `[GovData] total_students ${total} is much smaller than NIRF ${nirfTotal} for ${uniName}; preferring NIRF.`,
        );
        demo.total_students = nirfTotal;
        if (nirfMale !== undefined && nirfFemale !== undefined) {
          demo.total_students_male = nirfMale;
          demo.total_students_female = nirfFemale;
        }
        demo.data_quality = "partial";
        demo.source = String(demo.nirf_source || demo.source || "nirf");
      } else if (diff > 100) {
        // Both totals are present and plausible but disagree; flag as partial.
        console.warn(
          `[GovData] NIRF total (${nirfTotal}) and AISHE/NAAC total (${total}) differ for ${uniName}; data_quality=partial.`,
        );
        demo.data_quality = "partial";
      }
    } else if (nirfMale !== undefined && nirfFemale !== undefined) {
      // No AISHE/NAAC total but NIRF is complete; use NIRF.
      demo.total_students = nirfTotal;
      demo.total_students_male = nirfMale;
      demo.total_students_female = nirfFemale;
      demo.data_quality = "verified";
      demo.source = String(demo.nirf_source || demo.source || "nirf");
    }
  }

  // ── Derive sub-totals from gender splits when only splits exist ──────────
  if (!demo.hostelites && hostelitesMale && hostelitesFemale) {
    demo.hostelites = hostelitesMale + hostelitesFemale;
  }
  if (!demo.day_scholars && dayScholarsMale && dayScholarsFemale) {
    demo.day_scholars = dayScholarsMale + dayScholarsFemale;
  }

  // ── Final consistency check on splits ───────────────────────────────────
  const finalTotal = typeof demo.total_students === "number" ? (demo.total_students as number) : undefined;
  const finalMale = typeof demo.total_students_male === "number" ? (demo.total_students_male as number) : undefined;
  const finalFemale =
    typeof demo.total_students_female === "number" ? (demo.total_students_female as number) : undefined;
  if (finalTotal && finalMale && finalFemale && Math.abs(finalMale + finalFemale - finalTotal) > 100) {
    console.warn(
      `[GovData] Post-reconcile gender mismatch for ${uniName}: male+female=${finalMale + finalFemale}, total=${finalTotal}`,
    );
    delete demo.total_students_male;
    delete demo.total_students_female;
    if (demo.data_quality === "verified") demo.data_quality = "partial";
  }
}

async function serperSearch(query: string, apiKey: string, num = 5): Promise<SerperResult> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Serper failed: ${res.status} ${text}`);
  }
  return await res.json();
}

/**
 * Final fallback: send the PDF bytes directly to Gemini as inline data.
 * Works when local PDF parsing is unavailable AND Jina can't reach
 * the URL (e.g., .gov.in PDFs).
 */
async function extractPdfViaGemini(
  pdfUrl: string,
  apiKey: string,
): Promise<{ text: string; usage?: LlmUsageEntry }> {
  try {
    const buffer = await downloadPdfBuffer(pdfUrl);
    const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
    if (buffer.length > MAX_PDF_BYTES) {
      console.warn(
        `[GovData] PDF too large for Gemini inline: ${buffer.length} bytes`,
      );
      return { text: "" };
    }
    const base64 = buffer.toString("base64");
    const aiClient = getGoogleAI(apiKey);
    const response = await aiClient.models.generateContent({
      model: MODELS.geminiFlash,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Extract ALL text and tables from this PDF. Preserve table structure with markdown formatting. Include every number, program name, and demographic figure.",
            },
            {
              inlineData: {
                mimeType: "application/pdf",
                data: base64,
              },
            },
          ],
        },
      ],
      config: {
        httpOptions: { timeout: 25000 },
      },
    });
    const text = response.text || "";
    const usage = createLlmUsageEntry({
      label: "gov_data_inline_pdf",
      model: MODELS.geminiFlash,
      response,
      fallbackOutputTokens: Math.ceil(text.length / 4),
    });
    console.log(
      `[GovData] Gemini inline PDF extracted ${text.length} chars from ${pdfUrl}`,
    );
    return { text, usage };
  } catch (e) {
    console.warn(
      `[GovData] Gemini inline PDF failed for ${pdfUrl}:`,
      e instanceof Error ? e.message : String(e),
    );
    return { text: "" };
  }
}

/**
 * Dedicated government data enrichment action.
 * Searches for and extracts ONLY official government demographic data:
 * - NIRF (nirfindia.org) → student strength, program-wise enrollment
 * - AISHE (aishe.gov.in) → total enrollment, hostelites
 * - NAAC SSR / Mandatory Disclosure → hostel capacity, student numbers
 */
export const enrichGovernmentData = internalAction({
  args: {
    universityId: v.id("universities"),
    maxSerperQueries: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    error?: string;
    sourcesFound?: number;
    officers?: Array<{ name?: string; role?: string }>;
    serperQueriesUsed?: number;
    llmUsage?: LlmUsageSummary;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!university) throw new Error("University not found");

      const uniName = university.university_name;
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
      const rawSerperKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
      const serperKey = rawSerperKey ? rawSerperKey.trim() : null;

      console.log(`[GovData] Searching government sources for ${uniName}...`);

      // ─── Phase 1: Discover external government sources via Serper ─────────
      const queries = [
        `${uniName} NIRF engineering ranking 2024 2025 student strength`,
        `${uniName} site:nirfindia.org/rankings NIRF`,
        `${uniName} site:nirfindia.org PDF NIRF student strength`,
        `${uniName} AISHE enrollment data total students`,
        `${uniName} site:aishe.gov.in AISHE PDF`,
        `${uniName} NAAC SSR hostelite student data`,
        `${uniName} site:naac.gov.in NAAC SSR PDF`,
        `${uniName} mandatory disclosure student enrollment`,
        `${uniName} hostel capacity hostelites residential students`,
        `${uniName} day scholars non-residential students`,
        `${uniName} NAAC SSR "Criterion 2" enrollment hostel`,
        `${uniName} "Anti-Ragging" hostelites enrolled student welfare`,
        `${uniName} "Anti-Ragging Committee" hostelites enrolled students`,
        `${uniName} "Mandatory Disclosure" hostel residential students`,
        `${uniName} IQAC AQAR hostel capacity enrollment`,
      ];

      const allUrls: { url: string; score: number }[] = [];
      const seen = new Set<string>();
      // Credit discipline: NIRF-first slice (2 NIRF + 1 AISHE). Existing known
      // PDFs (from a previous run) are force-included below, so we never lose
      // demographics data we already located.
      const serperBudget = createSerperBudget({
        maxQueries: args.maxSerperQueries ?? 4,
      });
      for (const knownUrl of (university.demographics?.source_urls ?? []).filter(
        (u: string) => u.toLowerCase().endsWith(".pdf"),
      )) {
        if (!seen.has(knownUrl)) {
          seen.add(knownUrl);
          allUrls.push({ url: knownUrl, score: 100 });
        }
      }

      if (serperKey) {
        for (const q of queries) {
          if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) {
            console.warn(
              `[GovData] Serper budget reached for ${uniName}; switching to fallback paths.`,
            );
            break;
          }
          try {
            const searchResult = await runWithSerperBudget(serperBudget, () =>
              withRetry(() => serperSearch(q, serperKey as string, 5), {
                maxRetries: 1,
              }),
            );
            if (!searchResult.ok) {
              if (searchResult.quotaExhausted) {
                console.warn(
                  `[GovData] Serper quota exhausted for ${uniName}; falling back to grounding.`,
                );
                break;
              }
              continue;
            }
            const data = searchResult.value!;
            for (const r of data.organic || []) {
              if (!r.link || seen.has(r.link)) continue;
              seen.add(r.link);
              let score = 0;
              const url = r.link.toLowerCase();
              const titleSnippet = ((r.title || "") + " " + (r.snippet || "")).toLowerCase();
              if (url.includes("nirfindia.org")) score += 10;
              if (url.includes("nirfindia.org/rankings") || url.includes("nirfindia.org/engranking")) score += 6;
              if (url.includes("aishe.gov.in")) score += 10;
              if (url.includes("naac.gov.in")) score += 8;
              if (/\b(nirf|ranking|student.*strength|enrollment)\b/i.test(titleSnippet)) score += 5;
              if (/\b(engineering|overall|student strength|total students)\b/i.test(titleSnippet)) score += 4;
              if (/\b(architecture|planning)\b/i.test(titleSnippet)) score -= 3;
              if (/\b(hostel|hostelite|day scholar)\b/i.test(titleSnippet)) score += 5;
              if (url.endsWith(".pdf")) score += 2;

              // NIRF PDF category disambiguation: prefer Overall/Engineering,
              // strongly reject small/specialty category PDFs.
              if (/ir-o-u-/.test(url)) score += 15;
              if (/ir-e-u-/.test(url)) score += 10;
              if (/ir-a-u-|ir-p-u-|ir-d-u-|ir-m-u-|ir-l-u-|ir-b-u-|ir-u-u-/.test(url)) score -= 25;

              if (score > 0) allUrls.push({ url: r.link, score });
            }
          } catch (e) {
            console.warn(`[GovData] Serper query failed: "${q}"`, e instanceof Error ? e.message : String(e));
          }
        }
      }

      const topUrls = allUrls.sort((a, b) => b.score - a.score).slice(0, 5).map((u) => u.url);
      console.log(`[GovData] Discovered ${topUrls.length} government source URLs.`);

      // ─── Phase 2: Scrape discovered URLs via Jina Reader (free) ───────────
      const contextBlocks: string[] = [];
      const pdfTexts: string[] = []; // raw PDF text for office-holder extraction
      for (const extUrl of topUrls) {
        try {
          if (extUrl.toLowerCase().endsWith(".pdf")) {
            let combinedPdf = "";
            let pdfParseFailed = false;
            try {
              const buffer = await downloadPdfBuffer(extUrl);
              const [pdfText, pdfTables] = await Promise.all([
                extractPdfText(buffer),
                extractPdfTables(buffer),
              ]);
              combinedPdf = [pdfTables, pdfText]
                .filter((value) => value && value.trim().length > 0)
                .join("\n\n");
              if (pdfText.trim().length > 200) pdfTexts.push(pdfText);
            } catch (pdfErr) {
              pdfParseFailed = true;
              console.warn(
                `[GovData] local PDF parse failed for ${extUrl}:`,
                pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
              );
            }
            // Fallback 1: Jina Reader can extract text from PDF URLs too
            if (combinedPdf.length < 200) {
              try {
                const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(extUrl)}`, {
                  headers: { Accept: "text/plain" },
                  signal: AbortSignal.timeout(15000),
                });
                if (jinaRes.ok) {
                  const jinaText = await jinaRes.text();
                  if (jinaText.length > 200 && !hasHtmlWrapper(jinaText)) {
                    combinedPdf = jinaText;
                  }
                }
              } catch {
                // ignore Jina fallback failure
              }
            }
            // Fallback 2: Gemini inline PDF (works when local PDF parsing is broken
            // or Jina returns HTML wrapper instead of PDF tables)
            if (pdfParseFailed && apiKey) {
              const geminiPdf = await extractPdfViaGemini(extUrl, apiKey);
              if (geminiPdf.usage) {
                llmUsageEntries.push(geminiPdf.usage);
              }
              if (geminiPdf.text.length > 200) {
                combinedPdf = geminiPdf.text;
              }
            }
            if (combinedPdf.length > 200) {
              contextBlocks.push(
                `\n=== GOVERNMENT PDF SOURCE: ${extUrl} ===\n${combinedPdf.substring(0, MAX_PDF_CONTEXT_CHARS)}`,
              );
              continue;
            }
          }

          const jinaRes = await fetch(`https://r.jina.ai/${encodeURIComponent(extUrl)}`, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(15000),
          });
          if (!jinaRes.ok) continue;
          const text = await jinaRes.text();
          if (text.length > 200 && !hasHtmlWrapper(text)) {
            contextBlocks.push(`\n=== GOVERNMENT SOURCE: ${extUrl} ===\n${text.substring(0, MAX_SOURCE_CONTEXT_CHARS)}`);
          }
        } catch {
          // ignore
        }
      }

      if (contextBlocks.length === 0) {
        console.warn(`[GovData] No government data found for ${uniName}.`);
        if (!apiKey) {
          return {
            success: false,
            reason: "No government data sources found",
            llmUsage: summarizeLlmUsage(llmUsageEntries),
          };
        }

        // Last-resort path for hard-to-crawl domains (.gov.in, blocked PDFs):
        // ask Gemini Grounding directly even when source scraping yields nothing.
        try {
          const aiClient = getGoogleAI(apiKey);
          const groundingPrompt =
            `Find the latest NIRF ranking or AISHE enrollment data for ${uniName} in India. ` +
            `Return ONLY a JSON object with these exact fields: ` +
            `total_students (number), total_students_male (number), ` +
            `total_students_female (number), hostelites (number or null), hostelites_male (number or null), ` +
            `hostelites_female (number or null), day_scholars (number or null), day_scholars_male (number or null), ` +
            `day_scholars_female (number or null), ` +
            `nirf_total (number or null), nirf_male (number or null), nirf_female (number or null), ` +
            `nirf_source (string or null, e.g. "NIRF 2024-25"). ` +
            `Use null for missing values. Do not include any explanation.`;
          const groundingResponse = await aiClient.models.generateContent({
            model: MODELS.geminiFlash,
            contents: {
              role: "user",
              parts: [
                {
                  text: groundingPrompt,
                },
              ],
            },
            config: {
              systemInstruction:
                "Use Google Search to find official government enrollment data. Return ONLY valid JSON.",
              temperature: 0.0,
              maxOutputTokens: 1024,
              responseMimeType: "application/json",
              tools: [{ googleSearch: {} }],
              httpOptions: { timeout: 25000 },
            },
          });
          llmUsageEntries.push(
            createLlmUsageEntry({
              label: "gov_data_grounding_only_fallback",
              model: MODELS.geminiFlash,
              response: groundingResponse,
              fallbackInputTokens: Math.ceil(groundingPrompt.length / 4),
              fallbackOutputTokens: Math.ceil(
                (groundingResponse.text || "").length / 4,
              ),
            }),
          );
          const groundingParsed =
            parseJsonObject(groundingResponse.text || "") || {};
          const demo = {
            total_students: toNum(groundingParsed.total_students),
            total_students_male: toNum(groundingParsed.total_students_male),
            total_students_female: toNum(groundingParsed.total_students_female),
            hostelites: toNum(groundingParsed.hostelites),
            hostelites_male: toNum(groundingParsed.hostelites_male),
            hostelites_female: toNum(groundingParsed.hostelites_female),
            day_scholars: toNum(groundingParsed.day_scholars),
            day_scholars_male: toNum(groundingParsed.day_scholars_male),
            day_scholars_female: toNum(groundingParsed.day_scholars_female),
            nirf_total: toNum(groundingParsed.nirf_total),
            nirf_male: toNum(groundingParsed.nirf_male),
            nirf_female: toNum(groundingParsed.nirf_female),
            nirf_source:
              typeof groundingParsed.nirf_source === "string"
                ? groundingParsed.nirf_source
                : undefined,
            source: "government_data_enrichment_gemini_grounding",
            data_quality: "inferred",
          };
          applyDemographicSanity(demo as Record<string, unknown>, uniName);
          if (!hasAnyDemographicData(demo as Record<string, unknown>)) {
            return {
              success: false,
              reason: "No government data sources found",
              llmUsage: summarizeLlmUsage(llmUsageEntries),
            };
          }
          await ctx.runMutation(internal.universities.updateDemographicsInternal, {
            universityId: args.universityId,
            demographics: demo,
          });
          console.log(`[GovData] Saved demographics for ${uniName} via grounding-only fallback.`);
          return {
            success: true,
            sourcesFound: 0,
            llmUsage: summarizeLlmUsage(llmUsageEntries),
          };
        } catch (groundingErr) {
          console.warn(
            `[GovData] Gemini Grounding fallback failed for ${uniName}:`,
            groundingErr instanceof Error ? groundingErr.message : String(groundingErr),
          );
          return {
            success: false,
            reason: "No government data sources found",
            llmUsage: summarizeLlmUsage(llmUsageEntries),
          };
        }
      }

      console.log(`[GovData] Scraped ${contextBlocks.length} government sources (${contextBlocks.join("").length} chars).`);

      // ─── Phase 2b: extract office-holders from PDF text (reuses PDFs) ────
      let officers: Array<{ name?: string; role?: string }> = [];
      if (pdfTexts.length > 0 && apiKey) {
        try {
          const officerResult = await callGeminiWithUsage({
            apiKey,
            model: MODELS.geminiFlash,
            systemPrompt: OFFICER_EXTRACTION_SYSTEM_PROMPT,
            userPrompt: `UNIVERSITY: ${uniName}\n\nExtract named office-holders from the official PDF text below.\n\n${pdfTexts
              .join("\n\n")
              .slice(0, 30_000)}`,
            temperature: TEMP.deterministic,
            responseAsJson: true,
            responseSchema: OFFICER_EXTRACTION_SCHEMA,
            maxOutputTokens: 1024,
            label: "gov_data_officer_extraction",
            ctx,
          });
          llmUsageEntries.push(officerResult.usage);
          const parsedOfficers = JSON.parse(officerResult.text) as {
            officers?: Array<{ name?: string | null; role?: string | null }>;
          };
          officers = (parsedOfficers.officers ?? [])
            .filter((o) => o.name && o.role)
            .map((o) => ({
              name: o.name ?? undefined,
              role: o.role ?? undefined,
            }));
          if (officers.length > 0) {
            console.log(
              `[GovData] Extracted ${officers.length} office-holder candidate(s) from PDFs for ${uniName}`,
            );
          }
        } catch (e) {
          console.warn(
            `[GovData] Officer extraction failed for ${uniName}:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      // ─── Phase 3: Extract demographics via Gemini Flash-Lite ──────────────
      const prompt = `
UNIVERSITY: ${uniName}

EXTRACT ONLY official government demographic data from the sources below.
Data sources include NIRF ranking pages, AISHE enrollment data, NAAC SSR reports, Anti-Ragging disclosures, and Mandatory Disclosure documents.

CRITICAL EXTRACTION TARGETS:
1. NIRF program tables: program name, male count, female count, total count. Prefer the NIRF engineering/overall ranking table, not architecture-only or department-only tables.
2. HOSTELITE DATA: Total hostelites, male hostelites, female hostelites (search for "hostelites", "hostellers", "Boys Hostel", "Girls Hostel", "residential students", "hostel capacity")
3. DAY SCHOLAR DATA: Total day scholars, male day scholars, female day scholars (search for "day scholars", "day students", "non-residential")
4. OVERALL TOTALS: total_students, total_students_male, total_students_female

RULES:
- ONLY extract data from official government sources (NIRF, AISHE, NAAC, Mandatory Disclosure, Anti-Ragging).
- REJECT any data from university "About Us" or marketing pages.
- Use null for missing values, never 0.
- Extract EVERY NIRF program row: UG (4 Years), UG (5 Years), PG (2 Years), PG-Integrated, PhD, etc.
- Compute nirf_total, nirf_male and nirf_female by summing the program rows; do NOT copy a separate summary row if it disagrees with the row sum.
- Record the NIRF data year in nirf_source (e.g. "NIRF 2024-25").
- If NIRF tables have "Hostellers" and "Day Scholars" columns, extract those too.
- If NAAC SSR "Criterion 2" or "Criterion 4" tables show hostel/day scholar splits, extract them.
- If hostelites + day_scholars does not approximately equal total_students, prefer the split values and set total_students to null.
- If male + female does not approximately equal the reported total, keep the split and set total_students to null.

SOURCE CONTENT:
${contextBlocks.join("\n\n")}
`.trim();

      // Cap government context and enable one-day LLM caching for repeated reruns.
      const MAX_GOV_CONTEXT_CHARS = 70_000;
      const cappedPrompt = truncateAtNewline(
        prompt,
        MAX_GOV_CONTEXT_CHARS,
      );
      const extractionResult = await callGeminiWithUsage({
        apiKey,
        model: MODELS.geminiFlash,
        systemPrompt: GOVERNMENT_DATA_SYSTEM_PROMPT,
        userPrompt: cappedPrompt,
        temperature: 0.05,
        responseAsJson: true,
        responseSchema: GOVERNMENT_DATA_SCHEMA,
        maxOutputTokens: 4096,
        label: "gov_data_structured_extraction",
        ctx,
        cacheTtlMs: 24 * 60 * 60 * 1000,
      });
      llmUsageEntries.push(extractionResult.usage);

      const parsed = parseJsonObject(extractionResult.text);
      const demographics =
        parsed && typeof parsed.demographics === "object" && parsed.demographics
          ? (parsed.demographics as Record<string, unknown>)
          : {};

      // ─── Phase 4: Save to database ──────────────────────────────────────
      const demo = {
        total_students: toNum(demographics.total_students),
        total_students_male: toNum(demographics.total_students_male),
        total_students_female: toNum(demographics.total_students_female),
        day_scholars: toNum(demographics.day_scholars),
        day_scholars_male: toNum(demographics.day_scholars_male),
        day_scholars_female: toNum(demographics.day_scholars_female),
        hostelites: toNum(demographics.hostelites),
        hostelites_male: toNum(demographics.hostelites_male),
        hostelites_female: toNum(demographics.hostelites_female),
        source:
          typeof demographics.source === "string" && demographics.source
            ? demographics.source
            : "government_data_enrichment",
        data_quality: "verified",
        source_urls: Array.isArray(demographics.source_urls)
          ? demographics.source_urls.filter((u: unknown) => typeof u === "string")
          : undefined,
        nirf_source: typeof demographics.nirf_source === "string" ? demographics.nirf_source : undefined,
        nirf_total: toNum(demographics.nirf_total),
        nirf_male: toNum(demographics.nirf_male),
        nirf_female: toNum(demographics.nirf_female),
        nirf_programs: Array.isArray(demographics.nirf_programs)
          ? demographics.nirf_programs
              .filter((p: { name?: string }) => typeof p.name === "string" && p.name.trim())
              .map((p: { name: string; male?: unknown; female?: unknown; total?: unknown }) => ({
                name: p.name.trim(),
                male: toNum(p.male),
                female: toNum(p.female),
                total: toNum(p.total),
              }))
          : undefined,
      };

      applyDemographicSanity(demo as Record<string, unknown>, uniName);

      const hasAnyData = hasAnyDemographicData(demo as Record<string, unknown>);
      if (!hasAnyData) {
        // Deterministic fallback: regex-scan the raw government text for numbers
        const rawText = contextBlocks.join("\n\n");
        const fallback = extractDemographicsFromText(rawText);
        console.warn(
          `[GovData] LLM extraction returned no numeric data for ${uniName}. Fallback extracted:`,
          fallback,
        );
        if (fallback.total_students || fallback.total_students_male || fallback.total_students_female) {
          if (fallback.total_students) demo.total_students = fallback.total_students;
          if (fallback.total_students_male) demo.total_students_male = fallback.total_students_male;
          if (fallback.total_students_female) demo.total_students_female = fallback.total_students_female;
          if (fallback.hostelites) demo.hostelites = fallback.hostelites;
          if (fallback.day_scholars) demo.day_scholars = fallback.day_scholars;
          demo.source = "government_data_enrichment_fallback";
          demo.data_quality = "partial";
          applyDemographicSanity(demo as Record<string, unknown>, uniName);
        } else {
          // Last resort: Gemini Grounding search for NIRF/AISHE demographic data.
          // Works when government PDFs are unreachable (e.g., .gov.in IP-blocked).
          if (apiKey) {
            console.log(
              `[GovData] Attempting Gemini Grounding fallback for ${uniName} demographics`,
            );
            try {
              const aiClient = getGoogleAI(apiKey);
              const groundingPrompt =
                `Find the latest NIRF ranking or AISHE enrollment data for ${uniName} in India. ` +
                `Return ONLY a JSON object with these exact fields: ` +
                `total_students (number), total_students_male (number), ` +
                `total_students_female (number), hostelites (number or null), hostelites_male (number or null), ` +
                `hostelites_female (number or null), day_scholars (number or null), day_scholars_male (number or null), ` +
                `day_scholars_female (number or null), ` +
                `nirf_total (number or null), nirf_male (number or null), nirf_female (number or null), ` +
                `nirf_source (string or null, e.g. "NIRF 2024-25"). ` +
                `Use null for missing values. Do not include any explanation.`;
              const groundingResponse = await aiClient.models.generateContent({
                model: MODELS.geminiFlash,
                contents: {
                  role: "user",
                  parts: [
                    {
                      text: groundingPrompt,
                    },
                  ],
                },
                config: {
                  systemInstruction:
                    "You are a research assistant. Use Google Search to find official government enrollment data. Return ONLY valid JSON.",
                  temperature: 0.0,
                  maxOutputTokens: 1024,
                  responseMimeType: "application/json",
                  tools: [{ googleSearch: {} }],
                  httpOptions: { timeout: 25000 },
                },
              });
              llmUsageEntries.push(
                createLlmUsageEntry({
                  label: "gov_data_grounding_recovery",
                  model: MODELS.geminiFlash,
                  response: groundingResponse,
                  fallbackInputTokens: Math.ceil(groundingPrompt.length / 4),
                  fallbackOutputTokens: Math.ceil(
                    (groundingResponse.text || "").length / 4,
                  ),
                }),
              );
              const rawText = groundingResponse.text || "";
              console.log(
                `[GovData] Gemini Grounding raw JSON for ${uniName}:`,
                rawText,
              );
              try {
                const parsed = parseJsonObject(rawText) || {};
                if (parsed.total_students && toNum(parsed.total_students)! > 100) {
                  demo.total_students = toNum(parsed.total_students);
                }
                if (
                  parsed.total_students_male &&
                  toNum(parsed.total_students_male)! > 100
                ) {
                  demo.total_students_male = toNum(parsed.total_students_male);
                }
                if (
                  parsed.total_students_female &&
                  toNum(parsed.total_students_female)! > 100
                ) {
                  demo.total_students_female = toNum(parsed.total_students_female);
                }
                if (parsed.hostelites && toNum(parsed.hostelites)! > 100) {
                  demo.hostelites = toNum(parsed.hostelites);
                }
                if (
                  parsed.hostelites_male &&
                  toNum(parsed.hostelites_male)! > 50
                ) {
                  demo.hostelites_male = toNum(parsed.hostelites_male);
                }
                if (
                  parsed.hostelites_female &&
                  toNum(parsed.hostelites_female)! > 50
                ) {
                  demo.hostelites_female = toNum(parsed.hostelites_female);
                }
                if (parsed.day_scholars && toNum(parsed.day_scholars)! > 100) {
                  demo.day_scholars = toNum(parsed.day_scholars);
                }
                if (
                  parsed.day_scholars_male &&
                  toNum(parsed.day_scholars_male)! > 50
                ) {
                  demo.day_scholars_male = toNum(parsed.day_scholars_male);
                }
                if (
                  parsed.day_scholars_female &&
                  toNum(parsed.day_scholars_female)! > 50
                ) {
                  demo.day_scholars_female = toNum(parsed.day_scholars_female);
                }
                if (parsed.nirf_total && toNum(parsed.nirf_total)! > 100) {
                  demo.nirf_total = toNum(parsed.nirf_total);
                }
                if (parsed.nirf_male && toNum(parsed.nirf_male)! > 50) {
                  demo.nirf_male = toNum(parsed.nirf_male);
                }
                if (parsed.nirf_female && toNum(parsed.nirf_female)! > 50) {
                  demo.nirf_female = toNum(parsed.nirf_female);
                }
                if (
                  typeof parsed.nirf_source === "string" &&
                  parsed.nirf_source
                ) {
                  demo.nirf_source = parsed.nirf_source;
                }
                demo.source = "government_data_enrichment_gemini_grounding";
                demo.data_quality = "inferred";
                applyDemographicSanity(demo as Record<string, unknown>, uniName);
              } catch (parseErr) {
                console.warn(
                  `[GovData] Failed to parse Gemini Grounding JSON for ${uniName}:`,
                  parseErr instanceof Error ? parseErr.message : String(parseErr),
                );
              }
            } catch (groundingErr) {
              console.warn(
                `[GovData] Gemini Grounding recovery call failed for ${uniName}:`,
                groundingErr instanceof Error ? groundingErr.message : String(groundingErr),
              );
            }
          }

          const hasAnyDataAfterGrounding = hasAnyDemographicData(
            demo as Record<string, unknown>,
          );
          if (!hasAnyDataAfterGrounding) {
            console.warn(`[GovData] No numeric demographic data extracted for ${uniName}.`);
            return {
              success: false,
              reason: "Extraction returned no numeric data",
              llmUsage: summarizeLlmUsage(llmUsageEntries),
            };
          }
        }
      }

      await ctx.runMutation(internal.universities.updateDemographicsInternal, {
        universityId: args.universityId,
        demographics: demo,
      });

      console.log(`[GovData] Saved demographics for ${uniName}.`);
      return {
        success: true,
        sourcesFound: contextBlocks.length,
        officers,
        serperQueriesUsed: serperBudget.used,
        llmUsage: summarizeLlmUsage(llmUsageEntries),
      };
    } catch (e) {
      console.error("[GovData] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return {
        success: false,
        error: String(e),
        llmUsage: summarizeLlmUsage([]),
      };
    }
  },
});
