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
    // ─── Prompt injection stripping ─────────────────────────────────────────
    // Adversarial web pages may embed instruction override payloads in content.
    // The responseSchema is the primary defense, but belt-and-suspenders is warranted
    // given 60k of raw web content flowing into the model context.
    .replace(/(?:disregard|ignore|forget|override)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)/gi, "[FILTERED]")
    .replace(/(?:you are now|act as|pretend to be|roleplay as|new persona)/gi, "[FILTERED]")
    // ────────────────────────────────────────────────────────────────────────
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
  handler: async (ctx, args): Promise<{ success: boolean; skipped?: boolean; reason?: string; stakeholdersSynthesized?: number; demographicsIncluded?: boolean; contextChars?: number; estimatedTokens?: { flash: number; pro: number }; error?: string }> => {
    try {
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      
      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);

      if (!university) throw new Error("University not found");
      const uniName = university.university_name;
      const url = typeof university.website === "string" ? university.website : "";

      // ─── Pre-Enrichment Cleanup ───────────────────────────────────────────
      // If we are artificially running deep enrichment again, clear out the 
      // previous AI signals, demographics, and stakeholders first.
      await ctx.runMutation(internal.wipeEnrichment.clearSingleUniversityEnrichmentInternal, {
        universityId: args.universityId,
      });

      console.log(`[DeepEnrichment] Starting for ${uniName}...`);
      const serperKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
      if (!serperKey) throw new Error("SERPER API KEY is not set tightly in env variables");

      // ─── Disambiguation fields ────────────────────────────────────────────
      // Use address + state + zip_code to uniquely identify among campuses.
      // E.g. "VIT University" → "Vellore" + "Tamil Nadu" + "632014" 
      const state = university.state ?? "";
      const zip = university.zip_code ?? "";
      const address = university.address ?? "";
      // Extract city from address (first meaningful word that looks like a city)
      const cityMatch = address.match(/([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*)/g);
      const city = cityMatch?.[0] ?? state;
      // Unique qualifier: prefers zip (most precise), falls back to city, then state
      const locationQualifier = zip ? zip : city ? city : state;
      // For search: use both name and location to disambiguate
      const disambigQuery = `"${uniName}" ${locationQualifier ? `"${locationQualifier}"` : ""}`.trim();

      // ─── Domain extraction ────────────────────────────────────────────────
      const rawDomain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      console.log(`[DeepEnrichment] Disambiguation: name="${uniName}", location="${locationQualifier}", domain="${domain}"`);

      // ─── Phase 0: Find NIRF institution code ─────────────────────────────
      // This is critical: searching NIRF with just the name returns other campuses.
      // Finding the institution code first enables precise data page scraping.
      let nirfCode: string | null = null;
      let nirfDataUrl: string | null = null;
      try {
        const nirfCodeSearch = await serperFetch(
          `site:nirfindia.org "${uniName}" ${locationQualifier} "IR-" institution code 2024 OR 2025`,
          3, serperKey
        );
        for (const result of (nirfCodeSearch.organic || [])) {
          const snippet = (result.snippet || "") + (result.link || "");
          const codeMatch = snippet.match(/IR-[A-Z]-U-\d{4}/);
          if (codeMatch) {
            nirfCode = codeMatch[0];
            break;
          }
        }
        // Also try extracting from snippet of NIRF ranking pages
        if (!nirfCode) {
          const nirfRankSearch = await serperFetch(
            `nirfindia.org "${uniName}" ${locationQualifier} ranking student strength`,
            5, serperKey
          );
          for (const result of (nirfRankSearch.organic || [])) {
            const snippet = (result.snippet || "") + (result.link || "");
            const codeMatch = snippet.match(/IR-[A-Z]-U-\d{4}/);
            if (codeMatch) {
              nirfCode = codeMatch[0];
              nirfDataUrl = result.link;
              break;
            }
          }
        }
        if (nirfCode) {
          console.log(`[DeepEnrichment] Found NIRF code: ${nirfCode}`);
        }
      } catch { /* non-fatal */ }

      // ─── Phase 1: Parallel Gather (12 targeted sources) ──────────────────
      // ORDER MATTERS: Demographics sources first so they're never truncated by the 60k cap.
      const gatheringPromises = [
        // SOURCE 1: NIRF — use institution code if found, otherwise search with location
        (async () => {
          try {
            const sources: string[] = [];

            if (nirfCode) {
              // Scrape institution-specific NIRF data pages
              const nirfPages = await Promise.all([
                jinaScrape(
                  `https://www.nirfindia.org/Rankings/2025/UniversityRanking.html`,
                  "NIRF 2025 University Page", JINA_CHARS_NIRF
                ),
                jinaScrape(nirfDataUrl || `https://www.nirfindia.org/Rankings/2024/UniversityRanking.html`,
                  "NIRF 2024 Page", JINA_CHARS_NIRF
                ),
              ]);
              sources.push(...nirfPages);
            }

            // Also do targeted keyword search using disambig query
            const [nirfSearch, nirfSnippets] = await Promise.all([
              serperFetch(
                `${disambigQuery} site:nirfindia.org "Student Strength" OR "Hostellers" OR "Day Scholars" 2023 OR 2024`,
                4, serperKey
              ),
              serperSearch(
                `NIRF 2023 OR 2024 ${disambigQuery} "Total Students" OR "Hostellers" OR "Day Scholars"`,
                "NIRF Snippets", serperKey
              ),
            ]);

            // Filter NIRF links to only institution-specific data pages (not overall report PDFs)
            const nirfLinks: string[] = (nirfSearch.organic || [])
              .slice(0, 4)
              .map((r: any) => r.link)
              .filter((l: string | undefined): l is string =>
                !!l && !l.endsWith(".pdf") && (
                  l.includes("nirfindia.org") || l.includes("nirf")
                )
              );

            const nirfScrapes = await Promise.all(
              nirfLinks.map((l: string) => jinaScrape(l, "NIRF Page", JINA_CHARS_NIRF))
            );
            sources.push(...nirfScrapes, nirfSnippets);
            return sources.join("\n");
          } catch { return ""; }
        })(),

        // SOURCE 2: AISHE/NAAC data snippets — include name variations for XIM (XUB)
        serperSearch(
          `${disambigQuery} OR "XUB" OR "Xavier University Bhubaneswar" AISHE "2022-23" OR "2023-24" "Total Students" "Hostellers" "Day Scholars"`,
          "AISHE/NAAC Data", serperKey
        ),

        // SOURCE 3: Student strength with location qualifier + capacity keywords
        serperSearch(
          `${disambigQuery} "student strength" OR "total enrollment" OR "hostel capacity" OR "hostel intake" 2023 OR 2024`,
          "Student Strength & Capacity", serperKey
        ),

        // SOURCE 4: Mandatory Disclosure — search university domain specifically
        (async () => {
          try {
            const [discSearch, naacSnippets] = await Promise.all([
              serperFetch(
                domain
                  ? `site:${rawDomain} "mandatory disclosure" OR "UGC" "hostel" OR "day scholars" OR "total students"`
                  : `${disambigQuery} "Mandatory Disclosure" 2023 OR 2024 "Total Students" "Hostellers" "Day Scholars"`,
                3, serperKey
              ),
              serperSearch(
                `${disambigQuery} OR "XUB" "NAAC SSR" OR "AQAR" 2022 OR 2023 OR 2024 "Criterion 4.1.1" OR "hostel blocks" OR "accommodation"`,
                "NAAC/AQAR Snippets", serperKey
              ),
            ]);
            const discLink = discSearch.organic?.[0]?.link;
            const discScrape = discLink && !discLink.endsWith(".pdf")
              ? await jinaScrape(discLink, "Mandatory Disclosure")
              : discSearch.organic?.[0]
                ? `=== SOURCE: Mandatory Disclosure ===\n${discSearch.organic[0].title}: ${discSearch.organic[0].snippet}\n`
                : "";
            return discScrape + naacSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 5: NAAC SSR hostelite data — include domain-specific search
        (async () => {
          try {
            const [naacSearch, hostelSnippets] = await Promise.all([
              serperFetch(
                domain
                  ? `site:${rawDomain} "hostelites" OR "hostel facilities" OR "Criterion 2" students OR capacity`
                  : `${disambigQuery} NAAC SSR "hostelites" OR "day scholars" "boys hostel" OR "girls hostel"`,
                3, serperKey
              ),
              serperSearch(
                `${disambigQuery} "hostelites" OR "hostellers" OR "day scholars" male female capacity 2023 OR 2024 OR 2025`,
                "Hostelite Snippets", serperKey
              ),
            ]);
            const naacLinks: string[] = (naacSearch.organic || [])
              .slice(0, 2).map((r: any) => r.link).filter((l: string) => l && !l.endsWith(".pdf"));
            const naacScrapes = await Promise.all(
              naacLinks.map((l: string) => jinaScrape(l, "NAAC SSR Hostelites"))
            );
            return naacScrapes.join("\n") + hostelSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 6: Official Website Homepage
        jinaScrape(url, "Official Website"),

        // SOURCE 7: Internal Admin/Contact — search within domain for contact emails
        (async () => {
          try {
            const contactPages = domain
              ? [`${url}/administration`, `${url}/contact`, `${url}/about/administration`]
              : [];
            const searchData = await serperFetch(
              domain
                ? `site:${rawDomain} "Vice Chancellor" OR "Registrar" OR "contact" email phone`
                : `${disambigQuery} "Vice Chancellor" OR "Registrar" contact email phone`,
              2, serperKey
            );
            const links = [
              ...(searchData.organic || []).slice(0, 2).map((r: any) => r.link).filter((l: string) => l && l !== url),
              ...contactPages,
            ].slice(0, 3);
            return (await Promise.all(links.map((l: string) => jinaScrape(l, "Admin/Contact Page")))).join("\n");
          } catch { return ""; }
        })(),

        // SOURCE 8: LinkedIn profiles — use name + location for disambiguation
        serperSearch(
          `site:linkedin.com/in/ "Vice Chancellor" OR "Registrar" OR "Chief Warden" "${uniName}" ${locationQualifier}`,
          "LinkedIn Profiles", serperKey
        ),

        // SOURCE 9: Internal site email/phone using domain
        serperSearch(
          domain
            ? `site:${rawDomain} "@${domain}" OR "Phone:" "Vice Chancellor" OR "Registrar" OR "Dean"`
            : `${disambigQuery} "Vice Chancellor" OR "Registrar" email phone "@" contact`,
          "Internal Contacts", serperKey
        ),

        // SOURCE 10: External directory listing with location
        serperSearch(
          `${disambigQuery} "Vice Chancellor" OR "Registrar" "email" OR "mobile" "@"`,
          "External Directory", serperKey
        ),

        // SOURCE 11: Anti-ragging statutory disclosure — best source for hostelites + committee contacts
        (async () => {
          try {
            const [antiRagSearch, antiRagSnippets] = await Promise.all([
              serperFetch(
                domain
                  ? `site:${rawDomain} "anti-ragging" "hostelites" OR "day scholars" committee`
                  : `${disambigQuery} "anti-ragging" "hostelites" OR "day scholars" committee`,
                3, serperKey
              ),
              serperSearch(
                `"anti-ragging" ${disambigQuery} "hostelites" OR "day scholars" contact committee email phone mobile`,
                "Anti-Ragging + Hostelites", serperKey
              ),
            ]);
            const arLinks: string[] = (antiRagSearch.organic || [])
              .slice(0, 2).map((r: any) => r.link).filter((l: string) => l && !l.endsWith(".pdf"));
            const arScrapes = await Promise.all(
              arLinks.map((l: string) => jinaScrape(l, "Anti-Ragging Page"))
            );
            return arScrapes.join("\n") + antiRagSnippets;
          } catch { return ""; }
        })(),

        // SOURCE 12: UGC HEI Portal — official data including hostelite stats
        (async () => {
          try {
            const ugcSearch = await serperFetch(
              `site:hei.ugc.ac.in "${uniName}" ${locationQualifier} "hostelites" OR "total students" OR "day scholars"`,
              2, serperKey
            );
            const ugcLink = ugcSearch.organic?.[0]?.link;
            if (ugcLink) {
              return await jinaScrape(ugcLink, "UGC HEI Portal");
            }
            // UGC HEI portal hostelite search
            return await serperSearch(
              `hei.ugc.ac.in ${disambigQuery} "hostelites" OR "enrolled" OR "total students"`,
              "UGC HEI Portal", serperKey
            );
          } catch { return ""; }
        })(),
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
            apiKey,
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
UNIVERSITY BEING ENRICHED:
  Name: ${uniName}
  Location: ${state ? state + ", " : ""}India${zip ? ` (ZIP: ${zip})` : ""}${address ? `\n  Address: ${address}` : ""}
  Website: ${url || "unknown"}
${nirfCode ? `  NIRF Code: ${nirfCode}` : ""}

⚠️ DISAMBIGUATION ALERT: Multiple institutions may share a similar name (e.g. VIT Vellore vs VIT-AP vs VIT Chennai, or Yenepoya University vs Yenepoya Medical College, or SRM University vs SRM IST).
ONLY extract data that belongs to the EXACT institution above (matching name + location).
If you see data for another campus, IGNORE it completely.

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
          apiKey,
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

        // 2. ⚠️ SANITY GATE: hostelites CANNOT exceed total_students.
        // If it happens, total_students was likely extracted from a subset/single college.
        // → DISCARD the invalid total, DO NOT discard the valid hostelites!
        if (demo.hostelites && demo.total_students && demo.hostelites > demo.total_students) {
          console.warn(
            `[DeepEnrichment] REJECTED total_students (${demo.total_students}) — smaller than hostelites (${demo.hostelites}). Discarding invalid total.`
          );
          demo.total_students = undefined;
          demo.total_students_male = undefined;
          demo.total_students_female = undefined;
        }

        // Similarly: day_scholars cannot exceed total_students
        if (demo.day_scholars && demo.total_students && demo.day_scholars > demo.total_students) {
          console.warn(
            `[DeepEnrichment] REJECTED total_students (${demo.total_students}) — smaller than day_scholars (${demo.day_scholars}). Discarding invalid total.`
          );
          demo.total_students = undefined;
          demo.total_students_male = undefined;
          demo.total_students_female = undefined;
        }

        // 3. If total is unknown but we have hostelites, use it only as a reasonable floor.
        //    Guard: reject if hostelites itself seems implausible vs. NIRF (>2× nirf_total)
        if (!demo.total_students && demo.hostelites) {
          const nerfFloor = demo.nirf_total;
          if (nerfFloor && demo.hostelites > nerfFloor * 2) {
            console.warn(
              `[DeepEnrichment] REJECTED hostelites (${demo.hostelites}) — >2× NIRF total (${nerfFloor}). Likely hostel capacity data.`
            );
            demo.hostelites = undefined;
          } else {
            // Hostelites is plausible — use it as a minimum total estimate
            demo.total_students = demo.hostelites;
          }
        }

        // Case: total missing but day_scholars present (and reasonable)
        if (!demo.total_students && demo.day_scholars) {
          const nerfFloor = demo.nirf_total;
          if (!nerfFloor || demo.day_scholars <= nerfFloor * 2) {
            demo.total_students = demo.day_scholars;
          }
        }

        // 4. Infer day_scholars from total - hostelites (or vice versa)
        if (!demo.day_scholars && demo.total_students && demo.hostelites)
          demo.day_scholars = Math.max(0, demo.total_students - demo.hostelites);
        if (!demo.hostelites && demo.total_students && demo.day_scholars)
          demo.hostelites = Math.max(0, demo.total_students - demo.day_scholars);

        // 5. Infer gender splits for day_scholars if not found
        if (!demo.day_scholars_male && demo.total_students_male && demo.hostelites_male)
          demo.day_scholars_male = Math.max(0, demo.total_students_male - demo.hostelites_male);
        if (!demo.day_scholars_female && demo.total_students_female && demo.hostelites_female)
          demo.day_scholars_female = Math.max(0, demo.total_students_female - demo.hostelites_female);
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

      // ─── Cost / Usage Logging ─────────────────────────────────────────────
      // Rough token estimate: 1 token ≈ 4 chars. Log for spend awareness.
      const phase1Calls = gatheredResults.filter(s => s && s.trim().length >= 100).length;
      const phase1InputChars = gatheredResults.reduce((sum, s) => sum + Math.min((s || "").length, 8000), 0);
      const phase2InputChars = synthesisPrompt.length;
      const estimatedFlashTokens = Math.round(phase1InputChars / 4);
      const estimatedProTokens = Math.round((phase2InputChars + finalContext.substring(0, 20000).length) / 4);
      console.log(
        `[DeepEnrichment] COST ESTIMATE for ${uniName}:\n` +
        `  Serper queries: 12 (fixed)\n` +
        `  Flash Phase 1 calls: ${phase1Calls}, ~${estimatedFlashTokens.toLocaleString()} input tokens\n` +
        `  Pro Phase 2: 1 call, ~${estimatedProTokens.toLocaleString()} input tokens\n` +
        `  Context: ${finalContext.length.toLocaleString()} chars (raw: ${rawContext.length.toLocaleString()})`
      );

      return {
        success: true,
        stakeholdersSynthesized: validStakeholders.length,
        demographicsIncluded: !!demographics,
        contextChars: finalContext.length,
        estimatedTokens: { flash: estimatedFlashTokens, pro: estimatedProTokens },
      };

    } catch (e) {
      console.error("[DeepEnrichment] Fatal error:", e);
      Sentry.captureException(e, { extra: { universityId: args.universityId } });
      return { success: false, error: String(e) };
    }
  }
});
