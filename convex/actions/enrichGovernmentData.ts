"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { withRetry, toNum } from "../lib/utils";
import { callGemini, MODELS } from "../lib/llm";
import { DEEP_ENRICHMENT_SYNTHESIS_PROMPT, DEEP_ENRICHMENT_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/node";

interface SerperResult {
  organic?: Array<{ link: string; title?: string; snippet?: string }>;
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
 * Dedicated government data enrichment action.
 * Searches for and extracts ONLY official government demographic data:
 * - NIRF (nirfindia.org) → student strength, program-wise enrollment
 * - AISHE (aishe.gov.in) → total enrollment, hostelites
 * - NAAC SSR / Mandatory Disclosure → hostel capacity, student numbers
 */
export const enrichGovernmentData = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!university) throw new Error("University not found");

      const uniName = university.university_name;
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
      const rawSerperKey = await ctx.runQuery(internal.settings.getInternalSerperKey) || process.env.SERPER_API_KEY;
      const serperKey = rawSerperKey ? rawSerperKey.trim() : null;

      console.log(`[GovData] Searching government sources for ${uniName}...`);

      // ─── Phase 1: Discover external government sources via Serper ─────────
      const queries = [
        `${uniName} NIRF student strength enrollment`,
        `${uniName} AISHE enrollment data`,
        `${uniName} NAAC SSR hostelite student data`,
        `${uniName} mandatory disclosure student enrollment`,
        `${uniName} hostel capacity hostelites residential students`,
        `${uniName} day scholars non-residential students`,
        `${uniName} NAAC SSR "Criterion 2" enrollment hostel`,
        `${uniName} "Anti-Ragging" hostelites enrolled student welfare`,
      ];

      const allUrls: { url: string; score: number }[] = [];
      const seen = new Set<string>();

      if (serperKey) {
        for (const q of queries) {
          try {
            const data = await withRetry(() => serperSearch(q, serperKey as string, 5), { maxRetries: 1 });
            for (const r of data.organic || []) {
              if (!r.link || seen.has(r.link)) continue;
              seen.add(r.link);
              let score = 0;
              const url = r.link.toLowerCase();
              const titleSnippet = ((r.title || "") + " " + (r.snippet || "")).toLowerCase();
              if (url.includes("nirfindia.org")) score += 10;
              if (url.includes("aishe.gov.in")) score += 10;
              if (url.includes("naac.gov.in")) score += 8;
              if (/\b(nirf|ranking|student.*strength|enrollment)\b/i.test(titleSnippet)) score += 5;
              if (/\b(hostel|hostelite|day scholar)\b/i.test(titleSnippet)) score += 5;
              if (url.endsWith(".pdf")) score += 2;
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
      for (const extUrl of topUrls) {
        try {
          const jinaRes = await fetch(`https://r.jina.ai/${extUrl}`, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(15000),
          });
          if (!jinaRes.ok) continue;
          const text = await jinaRes.text();
          if (text.length > 200) {
            contextBlocks.push(`\n=== GOVERNMENT SOURCE: ${extUrl} ===\n${text.substring(0, 15000)}`);
          }
        } catch {
          // ignore
        }
      }

      if (contextBlocks.length === 0) {
        console.warn(`[GovData] No government data found for ${uniName}.`);
        return { success: false, reason: "No government data sources found" };
      }

      console.log(`[GovData] Scraped ${contextBlocks.length} government sources (${contextBlocks.join("").length} chars).`);

      // ─── Phase 3: Extract demographics via Gemini Flash-Lite ──────────────
      const prompt = `
UNIVERSITY: ${uniName}

EXTRACT ONLY official government demographic data from the sources below.
Data sources include NIRF ranking pages, AISHE enrollment data, NAAC SSR reports, Anti-Ragging disclosures, and Mandatory Disclosure documents.

CRITICAL EXTRACTION TARGETS:
1. NIRF program tables: program name, male count, female count, total count
2. HOSTELITE DATA: Total hostelites, male hostelites, female hostelites (search for "hostelites", "hostellers", "Boys Hostel", "Girls Hostel", "residential students", "hostel capacity")
3. DAY SCHOLAR DATA: Total day scholars, male day scholars, female day scholars (search for "day scholars", "day students", "non-residential")
4. OVERALL TOTALS: total_students, total_students_male, total_students_female

RULES:
- ONLY extract data from official government sources (NIRF, AISHE, NAAC, Mandatory Disclosure, Anti-Ragging).
- REJECT any data from university "About Us" or marketing pages.
- Use null for missing values, never 0.
- If NIRF tables have "Hostellers" and "Day Scholars" columns, extract those too.
- If NAAC SSR "Criterion 2" or "Criterion 4" tables show hostel/day scholar splits, extract them.

SOURCE CONTENT:
${contextBlocks.join("\n\n")}
`.trim();

      const resultText = await callGemini({
        apiKey,
        model: MODELS.geminiFlash,
        systemPrompt: DEEP_ENRICHMENT_SYNTHESIS_PROMPT([]),
        userPrompt: prompt,
        temperature: 0.05,
        responseAsJson: true,
        responseSchema: DEEP_ENRICHMENT_SCHEMA,
        maxOutputTokens: 4096,
      });

      const parsed = JSON.parse(resultText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim());
      const demographics = parsed.demographics || {};

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
        source: "government_data_enrichment",
        data_quality: "verified",
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

      const hasAnyData = Object.values(demo).some((v) => typeof v === "number" && v > 0);
      if (!hasAnyData) {
        console.warn(`[GovData] No numeric demographic data extracted for ${uniName}.`);
        return { success: false, reason: "Extraction returned no numeric data" };
      }

      await ctx.runMutation(internal.universities.updateDemographicsInternal, {
        universityId: args.universityId,
        demographics: demo,
      });

      console.log(`[GovData] Saved demographics for ${uniName}.`);
      return { success: true, sourcesFound: contextBlocks.length };
    } catch (e) {
      console.error("[GovData] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return { success: false, error: String(e) };
    }
  },
});
