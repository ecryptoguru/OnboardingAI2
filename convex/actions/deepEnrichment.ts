"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { callGemini, THINKING } from "../lib/llm";
import { withRetry, sanitizeLlmInput, validateJsonOutput, truncateAtNewline, isValidEmail } from "../lib/utils";
import {
  DEEP_ENRICHMENT_SYNTHESIS_PROMPT,
  DEEP_ENRICHMENT_SCHEMA,
} from "../lib/prompts";
import {
  firecrawlMap,
  firecrawlScrape,
  filterHighYieldUrls,
  extractContactsFromMarkdown,
} from "../lib/scrapers";
import * as Sentry from "@sentry/nextjs";

const TARGET_ROLES = [
  "Owner",
  "President",
  "Chairman",
  "Chancellor",
  "Vice Chancellor",
  "Pro Vice Chancellor",
  "Registrar",
  "Dy Registrar",
  "Dean Student Welfare",
  "Dean Student Affairs",
  "Director Administration",
  "Chief Warden",
  "Controller of Examinations",
  "Finance Officer",
  "Librarian",
  "Head of Department",
  "Placement Officer",
  "Public Relations Officer",
];

// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_CONTEXT_CHARS = 100_000; // Gemini 3.5 Flash handles 1M context; use 100k for speed
const MAX_URLS_TO_SCRAPE = 6; // Limit Firecrawl API calls per enrichment
const MAX_CHARS_PER_SOURCE = 15_000; // Truncate each scraped source
const MIN_BLOCK_LENGTH = 200; // Minimum length for a block to be considered valid
const MAX_REGEX_CONTACTS = 30; // Cap to avoid bloating the prompt

// ─── Content normalizer ───────────────────────────────────────────────────────
function normalizeContent(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/!\[.*?\]\(data:.*?\)/g, "")
    .replace(
      /\[(?:Home|About|Contact|Menu|Login|Register|Apply|Skip to|Back to top|Toggle navigation|Search|Read more|Click here|Download|View all)\]/gi,
      "",
    )
    .replace(
      /(?:disregard|ignore|forget|override)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)/gi,
      "[FILTERED]",
    )
    .replace(
      /(?:you are now|act as|pretend to be|roleplay as|new persona)/gi,
      "[FILTERED]",
    )
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !/^[-=_|*#]{3,}$/.test(t);
    })
    .join("\n")
    .trim();
}

// ─── Context deduplicator ─────────────────────────────────────────────────────
function deduplicateContext(sources: string[]): string {
  const seenLines = new Set<string>();
  const deduped: string[] = [];
  for (const block of sources) {
    if (!block.trim()) continue;
    const lines = block.split("\n");
    const keptLines: string[] = [];
    for (const line of lines) {
      const key = line.trim().toLowerCase();
      if (key.startsWith("=== source:") || key.length < 20) {
        keptLines.push(line);
        continue;
      }
      if (/^[\d\s\t,.|%-]+$/.test(key)) {
        keptLines.push(line);
        continue;
      }
      if (!seenLines.has(key)) {
        seenLines.add(key);
        keptLines.push(line);
      }
    }
    if (keptLines.length > 0) deduped.push(keptLines.join("\n"));
  }
  return deduped.join("\n\n");
}

export const runDeepEnrichment = action({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    skipped?: boolean;
    reason?: string;
    stakeholdersSynthesized?: number;
    demographicsIncluded?: boolean;
    contextChars?: number;
    estimatedTokens?: { flash: number; pro: number };
    error?: string;
  }> => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);

      if (!university) throw new Error("University not found");
      const uniName = university.university_name;
      const url =
        typeof university.website === "string" ? university.website : "";

      if (!url) {
        throw new Error(
          `University ${uniName} has no website. Cannot run enrichment.`,
        );
      }

      console.log(`[DeepEnrichment] Starting for ${uniName}...`);

      let firecrawlKey = await ctx.runQuery(
        internal.settings.getInternalFirecrawlKey,
      );
      if (!firecrawlKey) {
        firecrawlKey = process.env.FIRECRAWL_API_KEY ?? null;
      }
      if (!firecrawlKey) {
        throw new Error(
          "FIRECRAWL API KEY is not set. Please configure it in Settings.",
        );
      }

      // ─── Domain extraction ────────────────────────────────────────────────
      const rawDomain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      console.log(
        `[DeepEnrichment] Domain="${domain}", starting Firecrawl pipeline...`,
      );

      // ─── Phase 1: Firecrawl Map → Discover high-yield URLs ───────────────
      let highYieldUrls: string[] = [];
      let mapResult: Awaited<ReturnType<typeof firecrawlMap>> | null = null;
      try {
        mapResult = await withRetry(
          async () => firecrawlMap(url, firecrawlKey),
          { maxRetries: 2 },
        );
        highYieldUrls = filterHighYieldUrls(mapResult, MAX_URLS_TO_SCRAPE);
        console.log(
          `[DeepEnrichment] Firecrawl map found ${mapResult.links?.length ?? 0} URLs; selected ${highYieldUrls.length} high-yield targets.`,
        );
      } catch (e) {
        console.error("[DeepEnrichment] Firecrawl map failed:", e);
        // Fallback: guess common subpages
        highYieldUrls = [
          `${url}/contact`,
          `${url}/administration`,
          `${url}/about`,
          `${url}/anti-ragging`,
          `${url}/mandatory-disclosure`,
        ];
      }

      // ─── Phase 2: Firecrawl Scrape → Get clean Markdown ──────────────────
      const scrapePromises = highYieldUrls.map(async (targetUrl) => {
        try {
          const result = await withRetry(
            async () => firecrawlScrape(targetUrl, firecrawlKey),
            { maxRetries: 1 },
          );
          const markdown = result.data?.markdown || "";
          const normalized = normalizeContent(markdown).substring(
            0,
            MAX_CHARS_PER_SOURCE,
          );
          return `\n=== SOURCE: ${targetUrl} ===\n${normalized}\n`;
        } catch (e) {
          console.error(`[DeepEnrichment] Scrape failed for ${targetUrl}:`, e);
          return "";
        }
      });

      const scrapedBlocks = await Promise.all(scrapePromises);
      const validBlocks = scrapedBlocks.filter(
        (b) => b.length > MIN_BLOCK_LENGTH,
      );

      // ─── Phase 2b: Zero-Cost Regex Fallback Extraction ───────────────────
      // If contacts exist in raw Markdown, they are physically impossible to miss.
      const regexEmails = new Set<string>();
      const regexPhones = new Set<string>();
      for (const block of validBlocks) {
        const result = extractContactsFromMarkdown(block);
        result.emails.forEach((e) => regexEmails.add(e));
        result.phones.forEach((p) => regexPhones.add(p));
      }
      // Cap to avoid bloating the prompt (rare edge case: pages with hundreds of emails)
      const uniqueRegexEmails = Array.from(regexEmails).slice(
        0,
        MAX_REGEX_CONTACTS,
      );
      const uniqueRegexPhones = Array.from(regexPhones).slice(
        0,
        MAX_REGEX_CONTACTS,
      );
      console.log(
        `[DeepEnrichment] Regex fallback found ${uniqueRegexEmails.length} emails, ${uniqueRegexPhones.length} phones.`,
      );

      // ─── Phase 3: Deduplicate & Cap context ──────────────────────────────
      const rawContext = deduplicateContext(validBlocks);
      const finalContext = truncateAtNewline(rawContext, MAX_CONTEXT_CHARS);
      const safeContext = sanitizeLlmInput(finalContext);

      console.log(
        `[DeepEnrichment] Context: ${rawContext.length} chars → capped at ${finalContext.length} chars (${validBlocks.length} sources).`,
      );

      // ─── Phase 4: Single-Pass Gemini 3.5 Flash Extraction ─────────────────
      // Replaces the old 12× Flash + Pro two-phase pipeline.
      // Gemini 3.5 Flash has 1M context, stable structured output, and is 25% cheaper than Pro.
      const extractionPrompt = `
UNIVERSITY BEING ENRICHED:
  Name: ${uniName}
  Website: ${url || "unknown"}

EXTRACT EVERY STAKEHOLDER AND DEMOGRAPHIC FACT from the web pages below.
Rules:
- Extract ALL emails and phone numbers found — do not stop at target roles.
- Include administrative staff, secretaries, office assistants, committee members.
- If a list has 10 names with 10 phones, extract all 10.
- Use null for missing values, never 0.
- Indian phone format: +91XXXXXXXXXX

ALSO EXTRACT:
- total_students, hostelites, day_scholars (with gender splits if available)
- NIRF program-wise student data if present
- NAAC / IQAC / Mandatory Disclosure hostelite numbers

PRE-DISCOVERED CONTACTS (from regex scan — verify and merge):
Emails: ${uniqueRegexEmails.join(", ") || "none"}
Phones: ${uniqueRegexPhones.join(", ") || "none"}

WEB PAGE CONTENT:
${safeContext}
      `.trim();

      let synthesizedJson;
      try {
        console.log(
          `[DeepEnrichment] Phase 4: Running Gemini 3.5 Flash extraction (model: gemini-3.5-flash)`,
        );
        const startMs = Date.now();
        const resultText = await callGemini({
          apiKey,
          model: "gemini-3.5-flash",
          systemPrompt: DEEP_ENRICHMENT_SYNTHESIS_PROMPT(TARGET_ROLES),
          userPrompt: extractionPrompt,
          temperature: 0.05,
          responseAsJson: true,
          responseSchema: DEEP_ENRICHMENT_SCHEMA,
          thinkingBudget: THINKING.off, // Flash: thinking off for speed
          maxOutputTokens: 8192,
        });
        console.log(
          `[DeepEnrichment] Gemini latency: ${Date.now() - startMs}ms`,
        );

        const cleanedText = resultText
          .replace(/^```(json)?\n?/, "")
          .replace(/\n?```$/, "")
          .trim();
        const parsed = JSON.parse(cleanedText);
        interface DeepEnrichmentOutput extends Record<string, unknown> {
          demographics: Record<string, unknown>;
          stakeholders: unknown[];
        }
        synthesizedJson = validateJsonOutput<DeepEnrichmentOutput>(
          parsed,
          ["demographics", "stakeholders"],
          "DeepEnrichment output",
        );
        console.log(
          "[DeepEnrichment] Synthesized:",
          JSON.stringify(synthesizedJson, null, 2),
        );
      } catch (e) {
        console.error("[DeepEnrichment] Failed to parse Gemini output:", e);
        throw new Error("Failed to synthesize intelligence data");
      }

      const { demographics, stakeholders } = synthesizedJson;

      // toNum: converts any value to number, returns undefined for null/undefined/NaN
      const toNum = (val: unknown): number | undefined => {
        if (val === null || val === undefined) return undefined;
        const n = Number(val);
        return isNaN(n) ? undefined : n;
      };
      // toNumStrict: same but also rejects 0 — hostelites/day_scholars are NEVER legitimately 0 for large universities
      // (the LLM frequently returns 0 for unfound fields instead of null despite instructions)
      const toNumStrict = (val: unknown): number | undefined => {
        const n = toNum(val);
        return n === 0 ? undefined : n;
      };

      const demo = demographics && {
        // AISHE/NAAC block
        total_students: toNum(demographics.total_students),
        total_students_male: toNum(demographics.total_students_male),
        total_students_female: toNum(demographics.total_students_female),
        day_scholars: toNumStrict(demographics.day_scholars),
        day_scholars_male: toNumStrict(demographics.day_scholars_male),
        day_scholars_female: toNumStrict(demographics.day_scholars_female),
        hostelites: toNumStrict(demographics.hostelites),
        hostelites_male: toNumStrict(demographics.hostelites_male),
        hostelites_female: toNumStrict(demographics.hostelites_female),
        source:
          typeof demographics.source === "string"
            ? demographics.source
            : undefined,
        // NIRF block
        nirf_source:
          typeof demographics.nirf_source === "string"
            ? demographics.nirf_source
            : undefined,
        nirf_total: toNum(demographics.nirf_total),
        nirf_male: toNum(demographics.nirf_male),
        nirf_female: toNum(demographics.nirf_female),
        nirf_programs: Array.isArray(demographics.nirf_programs)
          ? demographics.nirf_programs
              .filter(
                (p: { name?: string }) =>
                  typeof p.name === "string" && p.name.trim(),
              )
              .map(
                (p: {
                  name: string;
                  male?: number | string;
                  female?: number | string;
                  total?: number | string;
                }) => ({
                  name: p.name.trim(),
                  male: toNum(p.male),
                  female: toNum(p.female),
                  total:
                    toNum(p.total) ??
                    (toNum(p.male) != null && toNum(p.female) != null
                      ? (toNum(p.male) ?? 0) + (toNum(p.female) ?? 0)
                      : undefined),
                }),
              )
          : undefined,
      };

      if (demo) {
        // Inference chain — run in order so each inferred value can feed the next

        // 1. Compute totals from splits if missing
        if (
          !demo.total_students &&
          demo.total_students_male &&
          demo.total_students_female
        )
          demo.total_students =
            demo.total_students_male + demo.total_students_female;
        if (!demo.hostelites && demo.hostelites_male && demo.hostelites_female)
          demo.hostelites = demo.hostelites_male + demo.hostelites_female;
        if (
          !demo.day_scholars &&
          demo.day_scholars_male &&
          demo.day_scholars_female
        )
          demo.day_scholars = demo.day_scholars_male + demo.day_scholars_female;

        // 2. ⚠️ SANITY GATE: hostelites CANNOT exceed total_students.
        // If it happens, total_students was likely extracted from a subset/single college.
        // → DISCARD the invalid total, DO NOT discard the valid hostelites!
        if (
          demo.hostelites &&
          demo.total_students &&
          demo.hostelites > demo.total_students
        ) {
          console.warn(
            `[DeepEnrichment] REJECTED total_students (${demo.total_students}) — smaller than hostelites (${demo.hostelites}). Discarding invalid total.`,
          );
          demo.total_students = undefined;
          demo.total_students_male = undefined;
          demo.total_students_female = undefined;
        }

        // Similarly: day_scholars cannot exceed total_students
        if (
          demo.day_scholars &&
          demo.total_students &&
          demo.day_scholars > demo.total_students
        ) {
          console.warn(
            `[DeepEnrichment] REJECTED total_students (${demo.total_students}) — smaller than day_scholars (${demo.day_scholars}). Discarding invalid total.`,
          );
          demo.total_students = undefined;
          demo.total_students_male = undefined;
          demo.total_students_female = undefined;
        }

        // 3. If total is unknown but we have hostelites, use it only as a reasonable floor.
        //    Guard: reject if hostelites itself seems implausible vs. NIRF (>2× nirf_total)
        if (!demo.total_students && demo.hostelites) {
          const nirfFloor = demo.nirf_total;
          if (nirfFloor && demo.hostelites > nirfFloor * 2) {
            console.warn(
              `[DeepEnrichment] REJECTED hostelites (${demo.hostelites}) — >2× NIRF total (${nirfFloor}). Likely hostel capacity data.`,
            );
            demo.hostelites = undefined;
          } else {
            // Hostelites is plausible — use it as a minimum total estimate
            demo.total_students = demo.hostelites;
          }
        }

        // Case: total missing but day_scholars present (and reasonable)
        if (!demo.total_students && demo.day_scholars) {
          const nirfFloor = demo.nirf_total;
          if (!nirfFloor || demo.day_scholars <= nirfFloor * 2) {
            demo.total_students = demo.day_scholars;
          }
        }

        // 4. Infer day_scholars from total - hostelites (or vice versa)
        if (!demo.day_scholars && demo.total_students && demo.hostelites)
          demo.day_scholars = Math.max(
            0,
            demo.total_students - demo.hostelites,
          );
        if (!demo.hostelites && demo.total_students && demo.day_scholars)
          demo.hostelites = Math.max(
            0,
            demo.total_students - demo.day_scholars,
          );

        // 5. Infer gender splits for day_scholars if not found
        if (
          !demo.day_scholars_male &&
          demo.total_students_male &&
          demo.hostelites_male
        )
          demo.day_scholars_male = Math.max(
            0,
            demo.total_students_male - demo.hostelites_male,
          );
        if (
          !demo.day_scholars_female &&
          demo.total_students_female &&
          demo.hostelites_female
        )
          demo.day_scholars_female = Math.max(
            0,
            demo.total_students_female - demo.hostelites_female,
          );
      }

      if (
        demo &&
        Object.values(demo).some((val) => typeof val === "number" && val > 0)
      ) {
        console.log(
          "[DeepEnrichment] Saving demographics:",
          JSON.stringify(demo),
        );
        await ctx.runMutation(
          internal.universities.updateDemographicsInternal,
          {
            universityId: args.universityId,
            demographics: demo,
          },
        );
      } else {
        console.warn(
          "[DeepEnrichment] No demographics. Raw:",
          JSON.stringify(demographics),
        );
      }

      // Sort by data richness so highest-quality stakeholders are upserted first
      interface StakeholderCandidate {
        name?: string;
        email?: string;
        phone?: string;
        linkedin_url?: string;
        role?: string;
      }

      const richness = (st: StakeholderCandidate) =>
        (st.email ? 2 : 0) +
        (st.phone ? 1 : 0) +
        (st.linkedin_url ? 1 : 0) +
        (st.name ? 1 : 0);

      const validStakeholders = ((stakeholders as StakeholderCandidate[]) || [])
        .filter((st) => {
          const hasName = !!st.name?.trim();
          const hasValidEmail = !!st.email && isValidEmail(st.email);
          return hasName || hasValidEmail;
        })
        .sort((a, b) => richness(b) - richness(a));

      if (validStakeholders.length > 0) {
        await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
          university_id: args.universityId,
          stakeholders: validStakeholders.map((st) => ({
            name: st.name || undefined,
            role: st.role || undefined,
            email: st.email || undefined,
            phone: st.phone || undefined,
            linkedin_url: st.linkedin_url || undefined,
          })),
          source: "deep_enrichment",
        });
      }

      await ctx.runAction(api.actions.scoring.scoreUniversity, {
        universityId: args.universityId,
      });

      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: args.universityId,
        stage: "enriched",
      });

      // ─── Cost / Usage Logging ─────────────────────────────────────────────
      // Rough token estimate: 1 token ≈ 4 chars. Log for spend awareness.
      const firecrawlCredits = 1 + validBlocks.length; // 1 map + N scrapes
      const flashInputChars = extractionPrompt.length;
      const estimatedFlashTokens = Math.round(flashInputChars / 4);
      console.log(
        `[DeepEnrichment] COST ESTIMATE for ${uniName}:\n` +
          `  Firecrawl credits: ${firecrawlCredits} (1 map + ${validBlocks.length} scrapes)\n` +
          `  Gemini 3.5 Flash: 1 call, ~${estimatedFlashTokens.toLocaleString()} input tokens\n` +
          `  Context: ${finalContext.length.toLocaleString()} chars (raw: ${rawContext.length.toLocaleString()})`,
      );

      return {
        success: true,
        stakeholdersSynthesized: validStakeholders.length,
        demographicsIncluded: !!demographics,
        contextChars: finalContext.length,
        estimatedTokens: {
          flash: estimatedFlashTokens,
          pro: 0, // legacy field — we no longer use Pro
        },
      };
    } catch (e) {
      console.error("[DeepEnrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
