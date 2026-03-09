"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal, api } from "../_generated/api";
import { callGemini, callFlash, THINKING } from "../lib/llm";
import { withRetry } from "../lib/utils";
import { DEEP_ENRICHMENT_SYNTHESIS_PROMPT, DEEP_ENRICHMENT_SCHEMA, FLASH_EXTRACTION_PROMPT } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

const TARGET_ROLES = [
  "Owner",
  "President",
  "Chairman",
  "Chancellor",
  "Vice Chancellor",
  "Registrar",
  "Dy Registrar",
  "Dean Student Welfare",
  "Dean Student Affairs",
  "Director Administration",
  "Chief Warden",
];

// ─── Cost constants ───────────────────────────────────────────────────────────
const JINA_CHARS_PER_SOURCE = 5_000;   // General sources — compact
const JINA_CHARS_NIRF = 12_000;        // NIRF pages have program-wise tables — need more room
const MAX_CONTEXT_CHARS = 60_000;      // Pro 3.1 handles 60k easily; raised from 40k to stop NIRF truncation

// ─── Content normalizer ───────────────────────────────────────────────────────
// Strips HTML entities, nav boilerplate, and repeated whitespace.
// FIX: line filter uses > 0 (not > 3) — short lines like "830" are real NIRF data.
function normalizeContent(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/!\[.*?\]\(data:.*?\)/g, "")
    .replace(/\[(?:Home|About|Contact|Menu|Login|Register|Apply|Skip to|Back to top|Toggle navigation|Search|Read more|Click here|Download|View all)\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .split("\n")
    .filter(line => {
      const t = line.trim();
      // FIX: was > 3, which dropped single-number lines like "830" from NIRF tables
      return t.length > 0 && !/^[-=_|*#]{3,}$/.test(t);
    })
    .join("\n")
    .trim();
}

// ─── Jina scraper ─────────────────────────────────────────────────────────────
async function jinaScrape(url: string, prefix: string, charLimit = JINA_CHARS_PER_SOURCE): Promise<string> {
  if (!url) return "";
  try {
    const raw = await withRetry(async () => {
      const response = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Accept: "text/event-stream, text/plain" },
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return await response.text();
    });
    const normalized = normalizeContent(raw).substring(0, charLimit);
    return `\n=== SOURCE: ${prefix} ===\n${normalized}\n`;
  } catch (error) {
    console.error(`[DeepEnrichment] Jina scrape failed for ${url}:`, error);
    return "";
  }
}

// ─── Serper search ────────────────────────────────────────────────────────────
async function serperSearch(query: string, prefix: string, serperKey: string): Promise<string> {
  try {
    const data = await withRetry(async () => {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, num: 5 }),
      });
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return await response.json();
    });

    const snippets = (data.organic || [])
      .map((res: any) => `${res.title}: ${res.snippet}`)
      .join("\n");
    return `\n=== SOURCE: ${prefix} ===\n${snippets || "NO RESULTS"}\n`;
  } catch (error) {
    console.error(`[DeepEnrichment] Serper failed for "${query}":`, error);
    return "";
  }
}

// ─── Serper raw fetch (used inline with withRetry) ────────────────────────────
async function serperFetch(query: string, num: number, serperKey: string): Promise<any> {
  return withRetry(async () => {
    const r = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num }),
    });
    if (!r.ok) throw new Error(`Serper ${r.status}`);
    return r.json();
  });
}

// ─── Context deduplicator ─────────────────────────────────────────────────────
// Removes identical lines seen across multiple sources — no repeated snippets sent to LLM.
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
      // Never deduplicate lines that are purely numeric / tabular data (NIRF student counts)
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
  handler: async (ctx, args) => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      if (!university) throw new Error("University not found");
      const uniName = university.university_name;
      const url = typeof university.website === "string" ? university.website : "";

      console.log(`[DeepEnrichment] Starting for ${uniName}...`);
      const serperKey = process.env.SERPER_API_KEY;
      if (!serperKey) throw new Error("SERPER_API_KEY is not set");

      // ─── Domain extraction ────────────────────────────────────────────────
      // FIX: Strip www. so @domain email patterns work correctly.
      // "www.yenepoya.edu.in" → "yenepoya.edu.in" — emails use the bare domain.
      const rawDomain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      // ─── Phase 1: Parallel Gather (11 targeted sources) ──────────────────
      // ORDER MATTERS: Demographics sources first so they're never truncated by the 60k cap.
      const gatheringPromises = [
        // SOURCE 1: NIRF Portal — student data
        // FIX: Run both searches IN PARALLEL then scrape IN PARALLEL (was 5 serial awaits → 2 parallel rounds)
        (async () => {
          try {
            // Round 1: fire both NIRF searches at the same time
            const [nirfSearch, nirf25DataSearch, nirfSnippets] = await Promise.all([
              serperFetch(`site:nirfindia.org "${uniName}" 2022 OR 2023 OR 2024 OR 2025`, 3, serperKey),
              serperFetch(`site:nirfindia.org "${uniName}" "Student Strength" "UG" "PG" program`, 2, serperKey),
              serperSearch(`NIRF 2022 OR 2023 OR 2024 OR 2025 "${uniName}" "Total Students" "Hostellers" "Day Scholars"`, "NIRF Snippets", serperKey),
            ]);
            // Round 2: fire all page scrapes in parallel
            const nirfLinks: string[] = [
              ...(nirfSearch.organic || []).slice(0, 2).map((r: any) => r.link),
              nirf25DataSearch.organic?.[0]?.link,
            ].filter((l: string | undefined): l is string => !!l);
            const nirfScrapes = await Promise.all(
              nirfLinks.map((l: string) => jinaScrape(l, `NIRF Page`, JINA_CHARS_NIRF))
            );
            return nirfScrapes.join("\n") + nirfSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 2: AISHE data snippets
        serperSearch(
          `"${uniName}" AISHE "2021-22" OR "2022-23" OR "2023-24" OR "2024-25" "Total Students" "Male" "Female" "Hostellers" "Day Scholars"`,
          "AISHE Data", serperKey
        ),

        // SOURCE 3: Student strength
        serperSearch(
          `"${uniName}" "student strength" OR "total enrollment" OR "total enrolled" 2022 OR 2023 OR 2024 OR 2025`,
          "Student Strength", serperKey
        ),

        // SOURCE 4: Mandatory Disclosure / NAAC SSR snippets
        // FIX: search + snippet in parallel; scrape only if link found
        (async () => {
          try {
            const [discSearch, naacSnippets] = await Promise.all([
              serperFetch(`"${uniName}" "Mandatory Disclosure" 2022 OR 2023 OR 2024 OR 2025 "Total Students" "Hostellers" "Day Scholars"`, 2, serperKey),
              serperSearch(`"${uniName}" "NAAC SSR" 2022 OR 2023 OR 2024 OR 2025 "Total Students" "Hostel" "Male" "Female"`, "NAAC/AQAR Snippets", serperKey),
            ]);
            const discLink = discSearch.organic?.[0]?.link;
            const discScrape = discLink ? await jinaScrape(discLink, "Mandatory Disclosure") : "";
            return discScrape + naacSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 5: NAAC SSR Criterion 2.1 — PRIMARY hostelite source
        // FIX: search + hostelite snippets in parallel; scrape in parallel
        (async () => {
          try {
            const [naacSearch, hostelSnippets] = await Promise.all([
              serperFetch(`"${uniName}" NAAC SSR "hostelites" OR "day scholars" "Criterion 2" site:*.ac.in OR site:naac.gov.in`, 3, serperKey),
              serperSearch(`"${uniName}" "hostelites" OR "hostellers" OR "day scholars" total male female 2022 OR 2023 OR 2024 OR 2025`, "Hostelite Snippets", serperKey),
            ]);
            const naacLinks: string[] = (naacSearch.organic || [])
              .slice(0, 2).map((r: any) => r.link).filter((l: string) => l);
            const naacScrapes = await Promise.all(
              naacLinks.map((l: string) => jinaScrape(l, "NAAC SSR Hostelites"))
            );
            return naacScrapes.join("\n") + hostelSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 6: Official Website Homepage
        jinaScrape(url, "Official Website"),

        // SOURCE 7: Internal Admin / Contact Directory page
        // FIX: search then scrape — only 2 rounds (was already correct)
        (async () => {
          try {
            const searchData = await serperFetch(
              `site:${rawDomain} "Vice Chancellor" OR "Registrar" OR "contact" email phone`,
              2, serperKey
            );
            const links = (searchData.organic || [])
              .slice(0, 2)
              .map((r: any) => r.link)
              .filter((l: string) => l && l !== url);
            return (await Promise.all(links.map((l: string) => jinaScrape(l, "Admin/Contact Page")))).join("\n");
          } catch { return ""; }
        })(),

        // SOURCE 8: LinkedIn profiles
        serperSearch(
          `site:linkedin.com/in/ "Vice Chancellor" OR "Registrar" OR "Chief Warden" "${uniName}"`,
          "LinkedIn Profiles", serperKey
        ),

        // SOURCE 9: Internal site email/phone
        serperSearch(
          `site:${rawDomain} "@${domain}" OR "Phone:" "Vice Chancellor" OR "Registrar" OR "Dean"`,
          "Internal Contacts", serperKey
        ),

        // SOURCE 10: External directory listing
        serperSearch(
          `"${uniName}" "Vice Chancellor" OR "Registrar" "email" OR "mobile" "@"`,
          "External Directory", serperKey
        ),

        // SOURCE 11: Anti-ragging statutory disclosure
        serperSearch(
          `"anti-ragging" "${uniName}" "hostelites" OR "day scholars" OR contact committee email phone mobile`,
          "Anti-Ragging + Hostelites", serperKey
        ),
      ];

      const gatheredResults = await Promise.all(gatheringPromises);

      // ─── Normalise + Deduplicate before sending to LLM ───────────────────
      const rawContext = deduplicateContext(gatheredResults);
      const finalContext = rawContext.substring(0, MAX_CONTEXT_CHARS);

      console.log(
        `[DeepEnrichment] Context: ${rawContext.length} chars → capped at ${finalContext.length} chars`
      );

      // ─── Phase 1: Parallel Flash Pre-Extraction ───────────────────────────
      // Send each raw source to Flash to extract structured facts first.
      console.log(`[DeepEnrichment] Phase 1: Running parallel Flash extraction on ${gatheredResults.length} sources`);
      const flashPromises = gatheredResults.map(async (sourceText) => {
        if (!sourceText || sourceText.trim().length < 100) return null;
        try {
          const factsStr = await callFlash({
            systemPrompt: FLASH_EXTRACTION_PROMPT,
            userPrompt: sourceText.substring(0, 8000), // Keep input tight for max speed
            responseAsJson: true,
            responseSchema: DEEP_ENRICHMENT_SCHEMA, // CRITICAL FIX: Force strict structured output in Phase 1
            temperature: 0,
          });
          return JSON.parse(factsStr);
        } catch (e) {
          console.error("[DeepEnrichment] Phase 1 Extraction Error on chunk:", e);
          return null; // Ignore errors from individual source extractions
        }
      });
      const extractedFactsArray = await Promise.all(flashPromises);
      const validFacts = extractedFactsArray.filter(Boolean);
      const factsContext = JSON.stringify(validFacts, null, 2);
      console.log(`[DeepEnrichment] Phase 1 Complete. Extracted ${validFacts.length} fact objects.`);

      // ─── Phase 2: Pro Synthesis ───────────────────────────────────────────
      // Give Pro the pre-extracted facts JSON (high confidence) + raw context (fallback)
      const synthesisPrompt = `
PRE-EXTRACTED FACTS (High Confidence):
${factsContext}

RAW SOURCE CONTEXT (For verification & fallback):
${finalContext.substring(0, 20000)}

Synthesize the final result using the PRE-EXTRACTED FACTS. Only pull from RAW SOURCE CONTEXT if data is missing or conflicting.
      `.trim();

      let synthesizedJson;
      try {
        console.log(`[DeepEnrichment] Phase 2: Running Pro synthesis`);
        const resultText = await callGemini({
          systemPrompt: DEEP_ENRICHMENT_SYNTHESIS_PROMPT(TARGET_ROLES),
          userPrompt: synthesisPrompt,
          temperature: 0.1,
          responseAsJson: true,
          responseSchema: DEEP_ENRICHMENT_SCHEMA,
          thinkingBudget: THINKING.low, // Dropped from 1024 to 512, since facts are largely pre-structured
        });

    const cleanedText = resultText.replace(/^```(json)?\n?/, "").replace(/\n?```$/, "").trim();
    synthesizedJson = JSON.parse(cleanedText);
    console.log("[DeepEnrichment] Synthesized:", JSON.stringify(synthesizedJson, null, 2));
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
        source: demographics.source ?? undefined,
        // NIRF block
        nirf_source: typeof demographics.nirf_source === "string" ? demographics.nirf_source : undefined,
        nirf_total: toNum(demographics.nirf_total),
        nirf_male: toNum(demographics.nirf_male),
        nirf_female: toNum(demographics.nirf_female),
        nirf_programs: Array.isArray(demographics.nirf_programs)
          ? demographics.nirf_programs
              .filter((p: any) => typeof p.name === "string" && p.name.trim())
              .map((p: any) => ({
                name: p.name.trim(),
                male: toNum(p.male),
                female: toNum(p.female),
                total: toNum(p.total) ?? (toNum(p.male) != null && toNum(p.female) != null
                  ? (toNum(p.male) ?? 0) + (toNum(p.female) ?? 0) : undefined),
              }))
          : undefined,
      };

      if (demo) {
        // Inference chain — run in order so each inferred value can feed the next
        // 1. Compute totals from splits if missing
        if (!demo.total_students && demo.total_students_male && demo.total_students_female)
          demo.total_students = demo.total_students_male + demo.total_students_female;
        if (!demo.hostelites && demo.hostelites_male && demo.hostelites_female)
          demo.hostelites = demo.hostelites_male + demo.hostelites_female;
        if (!demo.day_scholars && demo.day_scholars_male && demo.day_scholars_female)
          demo.day_scholars = demo.day_scholars_male + demo.day_scholars_female;
        // 2. Infer hostelites from total - day_scholars (or vice versa)
        if (!demo.hostelites && demo.total_students && demo.day_scholars)
          demo.hostelites = demo.total_students - demo.day_scholars;
        if (!demo.day_scholars && demo.total_students && demo.hostelites)
          demo.day_scholars = demo.total_students - demo.hostelites;
        // 3. Infer gender splits for day_scholars if not found
        if (!demo.day_scholars_male && demo.total_students_male && demo.hostelites_male)
          demo.day_scholars_male = demo.total_students_male - demo.hostelites_male;
        if (!demo.day_scholars_female && demo.total_students_female && demo.hostelites_female)
          demo.day_scholars_female = demo.total_students_female - demo.hostelites_female;
      }

      if (demo && Object.values(demo).some(val => typeof val === "number" && val > 0)) {
        console.log("[DeepEnrichment] Saving demographics:", JSON.stringify(demo));
        await ctx.runMutation(internal.universities.updateDemographicsInternal, {
          universityId: args.universityId,
          demographics: demo,
        });
      } else {
        console.warn("[DeepEnrichment] No demographics. Raw:", JSON.stringify(demographics));
      }

      // FIX: Sort by data richness before slicing to keep the 10 most complete records.
      // Previously .slice(0,10) cut by model output order — could discard records with email+phone.
      const richness = (st: any) =>
        (st.email ? 2 : 0) + (st.phone ? 1 : 0) + (st.linkedin_url ? 1 : 0) + (st.name ? 1 : 0);

      const validStakeholders = (stakeholders || [])
        .filter((st: any) => st.name || st.email)
        .sort((a: any, b: any) => richness(b) - richness(a))
        .slice(0, 10);

      if (validStakeholders.length > 0) {
        await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
          university_id: args.universityId,
          stakeholders: validStakeholders.map((st: any) => ({
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

      return {
        success: true,
        stakeholdersSynthesized: validStakeholders.length,
        demographicsIncluded: !!demographics,
        contextChars: finalContext.length,
      };

    } catch (e) {
      console.error("[DeepEnrichment] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return { success: false, error: String(e) };
    }
  }
});
