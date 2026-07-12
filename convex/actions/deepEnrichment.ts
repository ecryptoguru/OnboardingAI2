"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  callGeminiWithUsage,
  LlmUsageEntry,
  LlmUsageSummary,
  summarizeLlmUsage,
  THINKING,
  MODELS,
} from "../lib/llm";
import {
  withRetry,
  sanitizeLlmInput,
  validateJsonOutput,
  truncateAtNewline,
  isValidEmail,
  isValidIndianPhone,
  toNum,
  toNumStrict,
  extractDemographicsFromText,
} from "../lib/utils";
import {
  isDecisionMakerRole,
  isLikelyAcademicNonDecisionRole,
} from "../lib/stakeholderQuality";
import {
  DEEP_ENRICHMENT_SYNTHESIS_PROMPT,
  DEEP_ENRICHMENT_SCHEMA,
} from "../lib/prompts";
import {
  firecrawlMap,
  firecrawlScrape,
  filterHighYieldUrls,
  extractContactsFromMarkdown,
  extractContactsWithContext,
  matchPhonesToStakeholders,
} from "../lib/scrapers";
import {
  inferRoleFromContactContext,
  inferRoleFromInstitutionEmail,
  isSingletonRole,
  normalizeInstitutionDomain,
  normalizeStakeholderRole,
} from "../lib/contactInference";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../lib/serperBudget";
import * as Sentry from "@sentry/node";

const TARGET_ROLES = [
  "Owner",
  "President",
  "Chairman",
  "Chairperson",
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
  "Director",
  "Rector",
  "Secretary",
  "Treasurer",
  "Dean of Faculty",
  "Head of Administration",
  "Executive Director",
  "Managing Director",
  "Joint Director",
  "Deputy Director",
  "Associate Director",
];

// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_CONTEXT_CHARS = 50_000; // Cap context to keep Gemini calls fast
const MAX_URLS_TO_SCRAPE = 3; // Limit Firecrawl API calls per enrichment
const MAX_CHARS_PER_SOURCE = 8_000; // Truncate each scraped source
const MIN_BLOCK_LENGTH = 200; // Minimum length for a block to be considered valid
const MAX_REGEX_CONTACTS = 20; // Cap to avoid bloating the prompt
const MAX_COST_ESTIMATE = 15000; // Firecrawl credits * 100 + Gemini input tokens.
// A typical run: 1 map + 3 scrapes = 4 * 100 = 400.
// Plus ~25k chars prompt / 4 = 6.25k tokens. Total ~6,650.

// ─── External Source Search Helpers ────────────────────────────────────────────
// Indian university demographics live on government portals, NOT university websites.
// We use Serper to find these external pages and scrape them for demographic data.

interface SerperResult {
  organic?: Array<{ link: string; title?: string; snippet?: string }>;
}

async function serperSearch(
  query: string,
  apiKey: string,
  num = 5,
): Promise<SerperResult> {
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
 * Search for AISHE, NIRF, NAAC, and administration pages.
 * Returns URLs sorted by relevance for demographic + stakeholder extraction.
 */
async function discoverExternalSources(
  uniName: string,
  domain: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 2 }),
  options: {
    city?: string;
    state?: string;
    websitePath?: string;
  } = {},
): Promise<string[]> {
  const locationTerms = [options.city, options.state]
    .filter(Boolean)
    .join(" ")
    .trim();
  const websitePathTokens = (options.websitePath || "")
    .toLowerCase()
    .split("/")
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter((token) => token.length >= 4);
  // Use simple keyword queries — Serper works best with natural language, not complex operators
  const queries = [
    // NIRF data — highest value for demographics
    `${uniName} ${locationTerms} NIRF student strength enrollment`,
    `${uniName} ${locationTerms} site:${domain} administration`,
    `${uniName} ${locationTerms} site:${domain} registrar`,
    `${uniName} ${locationTerms} site:${domain} vice chancellor director`,
    // NAAC / IQAC / SSR
    `${uniName} ${locationTerms} NAAC SSR hostelite student data`,
    // Anti-ragging — mandatory page with contacts + hostel numbers
    `${uniName} ${locationTerms} anti-ragging committee contact`,
    // Administration / Contact
    `${uniName} ${locationTerms} administration contact directory`,
    `${uniName} ${locationTerms} dean office contact`,
    // LinkedIn for officials
    `${uniName} ${locationTerms} vice chancellor registrar linkedin`,
    `${uniName} ${locationTerms} director dean linkedin`,
    // General contact info search
    `${uniName} ${locationTerms} phone email address contact`,
  ];

  const allUrls: { url: string; score: number }[] = [];
  const seen = new Set<string>();

  for (const q of queries) {
    if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) break;
    try {
      const searchResult = await runWithSerperBudget(serperBudget, () =>
        withRetry(() => serperSearch(q, serperKey, 5), {
          maxRetries: 1,
        }),
      );
      if (!searchResult.ok) {
        if (searchResult.quotaExhausted) break;
        continue;
      }
      const data = searchResult.value!;
      for (const r of data.organic || []) {
        if (!r.link || seen.has(r.link)) continue;
        seen.add(r.link);
        // Score by relevance
        let score = 0;
        const url = r.link.toLowerCase();
        const title = (r.title || "").toLowerCase();
        const snippet = (r.snippet || "").toLowerCase();
        const combined = title + " " + snippet;

        // Boost university's own domain for contact/admin pages
        if (url.includes(domain.toLowerCase())) score += 6;
        if (
          locationTerms &&
          `${url} ${combined}`.includes(locationTerms.toLowerCase())
        ) {
          score += 4;
        }
        if (
          websitePathTokens.some(
            (token) =>
              token.length >= 4 && `${url} ${combined}`.includes(token),
          )
        ) {
          score += 4;
        }

        // Boost government/education data sources
        if (url.includes("nirfindia.org")) score += 10;
        if (url.includes("aishe.gov.in")) score += 10;
        if (url.includes("naac.gov.in")) score += 8;
        if (url.includes("ugc.gov.in")) score += 6;

        // Content relevance signals
        if (/\b(nirf|ranking|student.*strength|enrollment)\b/i.test(combined))
          score += 5;
        if (/\b(hostel|hostelite|day scholar|accommodation)\b/i.test(combined))
          score += 5;
        if (
          /\b(contact|phone|email|directory|administration)\b/i.test(combined)
        )
          score += 4;
        if (
          /\b(vice.chancellor|registrar|dean|principal|director)\b/i.test(
            combined,
          )
        )
          score += 4;
        if (
          /\b(anti.ragging|committee|iqac|mandatory.disclosure)\b/i.test(
            combined,
          )
        )
          score += 3;
        if (url.includes("linkedin.com/in/")) score += 3;
        if (url.endsWith(".pdf")) score += 2;

        // Penalise obvious junk / aggregator sites
        if (/shiksha|collegedunia|careers360|pagal guy/i.test(combined))
          score -= 5;
        if (/wikipedia|wiki/i.test(combined)) score -= 3;

        if (score > 0) allUrls.push({ url: r.link, score });
      }
    } catch (e) {
      console.warn(
        `[ExternalSearch] Serper query failed: "${q}"`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return allUrls
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((u) => u.url);
}

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

function buildBranchScopedPriorityUrls(
  workingUrl: string,
  discoveredLinks: string[],
  maxUrls: number,
): string[] {
  try {
    const parsed = new URL(workingUrl);
    const pathPrefix = parsed.pathname.replace(/\/$/, "");
    const hostname = parsed.hostname.toLowerCase();

    // Handle BOTH subpath and subdomain branches
    const branchScopedLinks = discoveredLinks.filter((link) => {
      try {
        const candidate = new URL(link);
        const candidateHost = candidate.hostname.toLowerCase();

        // Subpath match: /jaipur/contact
        if (
          pathPrefix &&
          candidate.pathname.startsWith(`${pathPrefix}/`) &&
          candidate.origin === parsed.origin
        ) {
          return true;
        }

        // Exact hostname match
        if (candidateHost === hostname) {
          return true;
        }

        // Subdomain match: jaipur.bits-pilani.ac.in is a subdomain of bits-pilani.ac.in
        // Check if candidate hostname ends with the working hostname
        if (
          candidateHost.endsWith(`.${hostname}`) ||
          hostname.endsWith(`.${candidateHost}`)
        ) {
          return true;
        }

        return false;
      } catch {
        return false;
      }
    });

    const guessed: string[] = [];
    if (pathPrefix && pathPrefix !== "") {
      guessed.push(
        workingUrl,
        `${parsed.origin}${pathPrefix}/contact`,
        `${parsed.origin}${pathPrefix}/contact-us`,
        `${parsed.origin}${pathPrefix}/administration`,
        `${parsed.origin}${pathPrefix}/about`,
        `${parsed.origin}${pathPrefix}/faculty`,
        `${parsed.origin}${pathPrefix}/hostel`,
        `${parsed.origin}${pathPrefix}/anti-ragging`,
        `${parsed.origin}${pathPrefix}/leadership`,
        `${parsed.origin}${pathPrefix}/governance`,
        `${parsed.origin}${pathPrefix}/team`,
        `${parsed.origin}${pathPrefix}/directory`,
      );
    } else {
      // For subdomain branches or root domains, guess common paths
      guessed.push(
        workingUrl,
        `${workingUrl.replace(/\/$/, "")}/contact`,
        `${workingUrl.replace(/\/$/, "")}/contact-us`,
        `${workingUrl.replace(/\/$/, "")}/administration`,
        `${workingUrl.replace(/\/$/, "")}/about`,
        `${workingUrl.replace(/\/$/, "")}/faculty`,
        `${workingUrl.replace(/\/$/, "")}/leadership`,
        `${workingUrl.replace(/\/$/, "")}/governance`,
        `${workingUrl.replace(/\/$/, "")}/team`,
        `${workingUrl.replace(/\/$/, "")}/directory`,
        `${workingUrl.replace(/\/$/, "")}/anti-ragging`,
      );
    }

    return [...new Set([...branchScopedLinks, ...guessed])].slice(0, maxUrls);
  } catch {
    return [];
  }
}

export const runDeepEnrichment = internalAction({
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
    llmUsage?: LlmUsageSummary;
    error?: string;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
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

      const firecrawlKey = await ctx.runQuery(
        internal.settings.getInternalFirecrawlKey,
      );
      if (!firecrawlKey) {
        throw new Error(
          "FIRECRAWL API KEY is not set. Please configure it in Settings.",
        );
      }

      const rawSerperKey = await ctx.runQuery(
        internal.settings.getInternalSerperKey,
      );
      const serperKey = rawSerperKey ? rawSerperKey.trim() : null;
      const serperBudget = createSerperBudget({ maxQueries: 2 });

      // ─── Domain extraction ────────────────────────────────────────────────
      const rawDomain = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      console.log(
        `[DeepEnrichment] Domain="${domain}", starting Firecrawl pipeline...`,
      );

      // ─── Phase 1: Firecrawl Map → Discover high-yield URLs ───────────────
      let highYieldUrls: string[] = [];
      let mapResult: Awaited<ReturnType<typeof firecrawlMap>> | null = null;
      let workingUrl = url;

      const urlVariants = [url];
      if (url.startsWith("http://")) {
        urlVariants.push(url.replace("http://", "https://"));
      } else if (url.startsWith("https://")) {
        urlVariants.push(url.replace("https://", "http://"));
      }

      for (const tryUrl of urlVariants) {
        try {
          mapResult = await withRetry(
            async () => firecrawlMap(tryUrl, firecrawlKey),
            { maxRetries: 2 },
          );
          if (mapResult.links && mapResult.links.length > 0) {
            workingUrl = tryUrl;
            highYieldUrls = filterHighYieldUrls(mapResult, MAX_URLS_TO_SCRAPE);
            const branchPriorityUrls = buildBranchScopedPriorityUrls(
              workingUrl,
              (mapResult.links || []).map((link) => link.url),
              MAX_URLS_TO_SCRAPE,
            );
            if (branchPriorityUrls.length > 0) {
              highYieldUrls = [
                ...branchPriorityUrls,
                ...highYieldUrls,
              ].filter((url, index, arr) => arr.indexOf(url) === index)
                .slice(0, MAX_URLS_TO_SCRAPE);
            }
            console.log(
              `[DeepEnrichment] Firecrawl map success with ${tryUrl}: ${mapResult.links.length} URLs; selected ${highYieldUrls.length} high-yield targets.`,
            );
            break;
          }
        } catch (e) {
          console.warn(
            `[DeepEnrichment] Firecrawl map failed for ${tryUrl}:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      if (!highYieldUrls.length) {
        console.error(
          "[DeepEnrichment] Firecrawl map failed for all URL variants.",
        );
        // Fallback: guess common subpages using the original URL
        highYieldUrls = [
          `${workingUrl}/contact`,
          `${workingUrl}/administration`,
          `${workingUrl}/about`,
          `${workingUrl}/anti-ragging`,
          `${workingUrl}/mandatory-disclosure`,
        ];
      }

      // ─── Phase 1b: External Source Discovery (AISHE/NIRF/NAAC/Admin) ────
      // Indian university demographics live on government portals, not university websites.
      // We search for these external sources and scrape them via Jina Reader (free).
      let externalBlocks: string[] = [];
      if (serperKey) {
        try {
          const externalUrls = await discoverExternalSources(
            uniName,
            domain,
            serperKey,
            serperBudget,
            {
              city: university.city,
              state: university.state,
              websitePath: new URL(workingUrl).pathname,
            },
          );
          if (externalUrls.length > 0) {
            console.log(
              `[DeepEnrichment] Discovered ${externalUrls.length} external sources: ${externalUrls.join(", ")}`,
            );
            const jinaPromises = externalUrls.map(async (extUrl) => {
              try {
                const jinaRes = await fetch(`https://r.jina.ai/${extUrl}`, {
                  headers: { Accept: "text/plain" },
                  signal: AbortSignal.timeout(8000),
                });
                if (!jinaRes.ok) return "";
                const text = await jinaRes.text();
                const normalized = normalizeContent(text).substring(
                  0,
                  MAX_CHARS_PER_SOURCE,
                );
                if (normalized.length < MIN_BLOCK_LENGTH) return "";
                return `\n=== EXTERNAL SOURCE: ${extUrl} ===\n${normalized}\n`;
              } catch {
                return "";
              }
            });
            externalBlocks = (await Promise.all(jinaPromises)).filter(
              (b) => b.length > MIN_BLOCK_LENGTH,
            );
            console.log(
              `[DeepEnrichment] External scraping: ${externalBlocks.length}/${externalUrls.length} sources succeeded.`,
            );
          }
        } catch (e) {
          console.warn(
            `[DeepEnrichment] External source discovery failed:`,
            e instanceof Error ? e.message : String(e),
          );
        }
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
      let validBlocks = scrapedBlocks.filter(
        (b) => b.length > MIN_BLOCK_LENGTH,
      );

      // Merge external sources (AISHE/NIRF/NAAC/Admin pages) into the context
      if (externalBlocks.length > 0) {
        validBlocks = validBlocks.concat(externalBlocks);
        console.log(
          `[DeepEnrichment] Merged ${externalBlocks.length} external blocks into context (total: ${validBlocks.length}).`,
        );
      }

      // NOTE: PDF extraction removed — government data action (enrichGovernmentData.ts)
      // already handles NIRF/AISHE/NAAC PDFs via Jina Reader + Gemini Flash-Lite.
      // Keeping deep enrichment focused on stakeholder contacts + website data.

      // ─── Phase 2d: Anti-Ragging Committee Scraping ───────────────────────
      // UGC mandates every university to list anti-ragging committee members
      // with their mobile numbers. These are real, personal phone numbers.
      const antiRaggingUrls = mapResult
        ? (mapResult.links || [])
            .filter((l) => {
              const urlLower = (l.url || "").toLowerCase();
              return /anti[-_]?ragging|antiragging|anti_ragging/i.test(
                urlLower,
              );
            })
            .map((l) => l.url)
            .slice(0, 1)
        : [
            `${workingUrl}/anti-ragging`,
            `${workingUrl}/anti-ragging-committee`,
          ];

      const antiRaggingContacts = {
        emails: new Set<string>(),
        phones: new Set<string>(),
        phoneContexts: [] as Array<{ value: string; context: string }>,
      };
      for (const arUrl of antiRaggingUrls) {
        try {
          const arRes = await fetch(`https://r.jina.ai/${arUrl}`, {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(8000),
          });
          if (arRes.ok) {
            const arText = await arRes.text();
            const contacts = extractContactsFromMarkdown(arText);
            contacts.emails.forEach((e) => antiRaggingContacts.emails.add(e));
            contacts.phones.forEach((p) => antiRaggingContacts.phones.add(p));
            // Also extract with context for downstream name→phone matching
            const withCtx = extractContactsWithContext(arText);
            withCtx.phones.forEach((p) => antiRaggingContacts.phoneContexts.push(p));
            console.log(
              `[DeepEnrichment] Anti-ragging page ${arUrl}: ${contacts.emails.length} emails, ${contacts.phones.length} phones.`,
            );
          }
        } catch {
          // Ignore anti-ragging page failures
        }
      }

      // ─── Phase 2b: Zero-Cost Regex Fallback Extraction ───────────────────
      // If contacts exist in raw Markdown, they are physically impossible to miss.
      const regexEmails = new Set<string>();
      const regexPhones = new Set<string>();
      const allEmailContexts: Array<{ value: string; context: string }> = [];
      const allPhoneContexts: Array<{ value: string; context: string }> = [...antiRaggingContacts.phoneContexts];
      for (const block of validBlocks) {
        const result = extractContactsFromMarkdown(block);
        result.emails.forEach((e) => regexEmails.add(e));
        result.phones.forEach((p) => regexPhones.add(p));
        // Collect phone contexts for name-based matching
        const withCtx = extractContactsWithContext(block);
        withCtx.emails.forEach((e) => allEmailContexts.push(e));
        withCtx.phones.forEach((p) => allPhoneContexts.push(p));
      }
      // Merge anti-ragging contacts into the main regex sets
      antiRaggingContacts.emails.forEach((e) => regexEmails.add(e));
      antiRaggingContacts.phones.forEach((p) => regexPhones.add(p));
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
      const regexRoleFallbackStakeholders = uniqueRegexEmails
        .flatMap((email) => {
          const matchingContext = allEmailContexts.find(
            (entry) => entry.value.toLowerCase() === email.toLowerCase(),
          );
          const role =
            inferRoleFromInstitutionEmail(email, url) ||
            inferRoleFromContactContext(matchingContext?.context);
          if (!role) return [];
          return [
            {
              role,
              email,
              phone: undefined,
              name: undefined,
              linkedin_url: undefined,
            },
          ];
        })
        .filter(
          (candidate, index, arr) =>
            arr.findIndex(
              (entry) =>
                entry.email?.toLowerCase() === candidate.email?.toLowerCase() ||
                entry.role?.toLowerCase() === candidate.role?.toLowerCase(),
            ) === index,
        );
      const regexPhoneFallbackStakeholders = allPhoneContexts
        .flatMap(({ value, context }) => {
          const role = inferRoleFromContactContext(context);
          if (!role || !isSingletonRole(role)) return [];
          return [
            {
              role,
              email: undefined,
              phone: value,
              name: undefined,
              linkedin_url: undefined,
            },
          ];
        })
        .filter(
          (candidate, index, arr) =>
            arr.findIndex(
              (entry) =>
                entry.phone === candidate.phone ||
                entry.role?.toLowerCase() === candidate.role?.toLowerCase(),
            ) === index,
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

DATA SOURCE PRIORITY (STRICT — government data ONLY):
1. NIRF data (from nirfindia.org) → nirf_total, nirf_male, nirf_female, nirf_programs
2. AISHE data (from aishe.gov.in) → total_students, hostelites, day_scholars
3. NAAC SSR reports / Mandatory Disclosure PDFs → hostelites, day_scholars, gender splits
4. Anti-Ragging Committee pages → names, mobile numbers, roles
5. University administration pages → contact emails, phone numbers
6. LinkedIn profiles → name, role, linkedin_url

CRITICAL RULES:
- For demographics: ONLY extract data from NIRF, AISHE, NAAC SSR, or Mandatory Disclosure.
- REJECT any student count from "About Us", "Overview", or marketing pages — these are inflated estimates.
- Extract ALL emails and phone numbers from ALL sources.
- Anti-Ragging Committee pages are UGC-mandated and MUST list real mobile numbers — extract every one.
- Use null for missing values, never 0.
- Indian phone format: +91XXXXXXXXXX

PRE-DISCOVERED CONTACTS (from regex scan — verify and merge):
Emails: ${uniqueRegexEmails.join(", ") || "none"}
Phones: ${uniqueRegexPhones.join(", ") || "none"}

WEB PAGE CONTENT:
${safeContext}
      `.trim();

      // ─── Cost ceiling guard ─────────────────────────────────────────────
      // Rough estimate: Firecrawl credits * 100 + Gemini input tokens. Abort if too high.
      // External sources use Jina Reader (free) — only count Firecrawl-based blocks.
      const firecrawlBasedBlocks = validBlocks.filter(
        (b) => !b.includes("EXTERNAL SOURCE:"),
      );
      const firecrawlCreditsConsumed = 1 + firecrawlBasedBlocks.length;
      const estimatedGeminiTokens = Math.round(extractionPrompt.length / 4);
      const costEstimate =
        firecrawlCreditsConsumed * 100 + estimatedGeminiTokens;
      if (costEstimate > MAX_COST_ESTIMATE) {
        console.warn(
          `[DeepEnrichment] COST CEILING EXCEEDED for ${uniName}: estimate=${costEstimate} (max=${MAX_COST_ESTIMATE}). Aborting Gemini call.`,
        );
        return {
          success: false,
          error: "budget_exceeded",
          stakeholdersSynthesized: 0,
          demographicsIncluded: false,
          contextChars: finalContext.length,
          estimatedTokens: { flash: estimatedGeminiTokens, pro: 0 },
          llmUsage: summarizeLlmUsage(llmUsageEntries),
        };
      }

      let synthesizedJson: {
        demographics: Record<string, unknown>;
        stakeholders: unknown[];
      } | null = null;
      let synthesisAttempts = 0;
      const maxSynthesisAttempts = 2;
      while (synthesisAttempts < maxSynthesisAttempts) {
        synthesisAttempts++;
        try {
          console.log(
            `[DeepEnrichment] Phase 4: Running Gemini extraction (model: ${MODELS.geminiFlash}, attempt ${synthesisAttempts})`,
          );
          const startMs = Date.now();
          const result = await callGeminiWithUsage({
            apiKey,
            model: MODELS.geminiFlash,
            systemPrompt: DEEP_ENRICHMENT_SYNTHESIS_PROMPT(TARGET_ROLES),
            userPrompt: extractionPrompt,
            temperature: 0.05,
            responseAsJson: true,
            responseSchema: DEEP_ENRICHMENT_SCHEMA,
            thinkingBudget: THINKING.off,
            maxOutputTokens: 8192,
            label: "deep_enrichment_synthesis",
            ctx,
            skipCache: true,
          });
          llmUsageEntries.push(result.usage);
          console.log(
            `[DeepEnrichment] Gemini latency: ${Date.now() - startMs}ms`,
          );

          const cleanedText = result.text
            .replace(/^```(json)?\n?/, "")
            .replace(/\n?```$/, "")
            .trim();
          const parsed = JSON.parse(cleanedText);
          synthesizedJson = validateJsonOutput(
            parsed,
            ["demographics", "stakeholders"],
            "DeepEnrichment output",
          ) as {
            demographics: Record<string, unknown>;
            stakeholders: unknown[];
          };
          // Redact PII: log only field counts, never names/emails/phones
          const stCount = Array.isArray(synthesizedJson.stakeholders)
            ? synthesizedJson.stakeholders.length
            : 0;
          const demoKeys = synthesizedJson.demographics
            ? Object.keys(synthesizedJson.demographics)
            : [];
          console.log(
            `[DeepEnrichment] Synthesized: ${stCount} stakeholders, demographics keys: [${demoKeys.join(", ")}]`,
          );
          break; // Success — exit retry loop
        } catch (e) {
          console.error(
            `[DeepEnrichment] Synthesis attempt ${synthesisAttempts} failed:`,
            e instanceof Error ? e.message : String(e),
          );
          if (synthesisAttempts >= maxSynthesisAttempts) {
            const regexFallbackStakeholders = [
              ...regexRoleFallbackStakeholders,
              ...regexPhoneFallbackStakeholders,
            ];
            if (regexFallbackStakeholders.length > 0) {
              console.warn(
                `[DeepEnrichment] Gemini synthesis unavailable. Persisting ${regexFallbackStakeholders.length} regex role/phone fallbacks.`,
              );
              await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
                university_id: args.universityId,
                stakeholders: regexFallbackStakeholders.map((st) => ({
                  name: undefined,
                  role: st.role,
                  email: st.email,
                  phone: st.phone,
                  linkedin_url: undefined,
                  email_source: st.email ? "regex" : undefined,
                  phone_source: st.phone ? "regex" : undefined,
                })),
                source: "deep_enrichment",
              });
              return {
                success: true,
                stakeholdersSynthesized: regexFallbackStakeholders.length,
                demographicsIncluded: false,
                contextChars: finalContext.length,
                estimatedTokens: { flash: estimatedGeminiTokens, pro: 0 },
                llmUsage: summarizeLlmUsage(llmUsageEntries),
                reason: "llm_synthesis_failed_regex_fallback",
              };
            }
            throw new Error(
              "Failed to synthesize intelligence data after retries",
            );
          }
        }
      }

      if (!synthesizedJson) {
        throw new Error("Failed to synthesize intelligence data after retries");
      }
      const { demographics, stakeholders } = synthesizedJson;
      if (demographics && typeof demographics === "object") {
        const rawEntries = Object.entries(demographics)
          .filter(([, v]) => v !== null && v !== undefined)
          .slice(0, 10)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`);
        console.log(
          `[DeepEnrichment] Raw demographics fields before toNum: ${
            rawEntries.length > 0 ? rawEntries.join(", ") : "(none)"
          }`,
        );
      }

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

        // Fall back to NIRF data if general demographics are not available
        if (!demo.total_students && demo.nirf_total) {
          demo.total_students = demo.nirf_total;
          demo.source = demo.source || demo.nirf_source || "NIRF Fallback";
        }
        if (!demo.total_students_male && demo.nirf_male) {
          demo.total_students_male = demo.nirf_male;
        }
        if (!demo.total_students_female && demo.nirf_female) {
          demo.total_students_female = demo.nirf_female;
        }

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

        // 6. Infer gender splits for hostelites if not found (reverse)
        if (
          !demo.hostelites_male &&
          demo.total_students_male &&
          demo.day_scholars_male
        )
          demo.hostelites_male = Math.max(
            0,
            demo.total_students_male - demo.day_scholars_male,
          );
        if (
          !demo.hostelites_female &&
          demo.total_students_female &&
          demo.day_scholars_female
        )
          demo.hostelites_female = Math.max(
            0,
            demo.total_students_female - demo.day_scholars_female,
          );
      }

      // Diagnostic: log a sample of raw values before toNum to help debug extraction issues
      if (demographics && typeof demographics === "object") {
        const rawSample = Object.entries(demographics)
          .filter(([, v]) => v !== null && v !== undefined)
          .slice(0, 6)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        console.log(`[DeepEnrichment] Raw demographics sample: ${rawSample}`);
      }

      if (
        demo &&
        Object.values(demo).some((val) => typeof val === "number" && val > 0)
      ) {
        const populatedFields = Object.entries(demo)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k]) => k);
        console.log(
          `[DeepEnrichment] Saving demographics: ${populatedFields.length} fields populated [${populatedFields.join(", ")}]`,
        );
        await ctx.runMutation(
          internal.universities.updateDemographicsInternal,
          {
            universityId: args.universityId,
            demographics: demo,
          },
        );
      } else {
        // Recovery fallback: if LLM returns demographics keys with null values,
        // salvage obvious numeric splits from raw context.
        const fallback = extractDemographicsFromText(finalContext);
        if (
          Object.values(fallback).some(
            (val) => typeof val === "number" && val > 0,
          )
        ) {
          console.warn(
            "[DeepEnrichment] LLM demographics empty. Applying regex fallback demographics extraction.",
          );
          await ctx.runMutation(
            internal.universities.updateDemographicsInternal,
            {
              universityId: args.universityId,
              demographics: {
                ...fallback,
                source: "context_regex_fallback",
                data_quality: "partial",
              },
            },
          );
        } else {
          console.warn(
            "[DeepEnrichment] No demographics extracted — all fields null or missing.",
          );
        }
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

      // Role-based emails that are valuable even without a person name
      const ROLE_EMAIL_PREFIXES = [
        "vc",
        "registrar",
        "registrar1",
        "dean",
        "coe",
        "chiefwarden",
        "provc",
        "dyregistrar",
        "finance",
        "director",
        "rector",
        "chairman",
        "president",
      ];
      function isRoleBasedEmail(email: string): boolean {
        const local = email.split("@")[0]?.toLowerCase() || "";
        return ROLE_EMAIL_PREFIXES.some(
          (p) =>
            local === p ||
            local.startsWith(p + ".") ||
            local.startsWith(p + "_"),
        );
      }

      // Normalize for pre-dedup (same logic as stakeholders.ts)
      function normalizeNameDedup(n?: string): string {
        const raw = (n || "")
          .toLowerCase()
          .replace(
            /\b(dr|prof|professor|mr|mrs|ms|shri|smt|er|engg|arch)\b/g,
            "",
          )
          .replace(/\./g, " ")
          .replace(/[,\-]/g, " ");
        return raw
          .split(/\s+/)
          .filter((t) => t.length > 0)
          .sort()
          .join(" ");
      }

      // Pre-compute context-based phone→stakeholder matches once
      const phoneNameMatches = matchPhonesToStakeholders(
        allPhoneContexts,
        (stakeholders as StakeholderCandidate[]) || [],
      );

      function collectFallbackPhonesForStakeholder(
        stakeholder: StakeholderCandidate,
      ): string[] {
        if (stakeholder.phone) return [stakeholder.phone];
        if (uniqueRegexPhones.length === 0) return [];

        // Context-based match: check if a phone was matched to this stakeholder name
        if (stakeholder.name) {
          for (const [phone, matchedName] of phoneNameMatches) {
            if (
              matchedName.toLowerCase() === stakeholder.name.toLowerCase()
            ) {
              return [phone];
            }
          }
        }

        // Single-phone fallback
        if (uniqueRegexPhones.length === 1) return [uniqueRegexPhones[0]];

        // Block-proximity fallback (name or role appears near phone)
        const normalizedRole = (stakeholder.role || "").toLowerCase();
        const normalizedName = normalizeNameDedup(stakeholder.name);
        if (!normalizedName && !normalizedRole) return [];

        const matchingBlocks = validBlocks.filter((block) => {
          const blockLower = block.toLowerCase();
          return (
            (!!normalizedName && blockLower.includes(normalizedName.split(" ")[0] || "")) ||
            (!!normalizedRole && blockLower.includes(normalizedRole))
          );
        });
        if (matchingBlocks.length === 0) return [];

        const matchedPhones = new Set<string>();
        for (const block of matchingBlocks) {
          const contacts = extractContactsFromMarkdown(block);
          contacts.phones.forEach((phone) => matchedPhones.add(phone));
        }
        return Array.from(matchedPhones);
      }

      const validStakeholders = ((stakeholders as StakeholderCandidate[]) || [])
        .filter((st) => {
          const hasName = !!st.name?.trim();
          const hasRole = !!st.role?.trim();
          const decisionRole = isDecisionMakerRole(st.role);
          const academicRole = isLikelyAcademicNonDecisionRole(st.role);
          const hasValidEmail = !!st.email && isValidEmail(st.email);
          const hasValidPhone = !!st.phone && isValidIndianPhone(st.phone);
          const hasLinkedin =
            !!st.linkedin_url &&
            /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(
              st.linkedin_url,
            );
          const isRoleEmail = hasValidEmail && isRoleBasedEmail(st.email!);
          const priorityRole = decisionRole || isSingletonRole(st.role);

          // Avoid polluting outreach stakeholders with faculty profile pages.
          // We only keep them when they also carry a decision-maker role.
          if (academicRole && !decisionRole) return false;

          // Keep if: has a real name + some contact info
          // OR: has a priority role with any trustworthy contact channel
          // OR: has a role-based email for a priority role
          return (
            (hasName &&
              (hasValidEmail || hasValidPhone || hasLinkedin || (hasRole && priorityRole))) ||
            (hasRole && priorityRole && (hasValidEmail || hasValidPhone || hasLinkedin)) ||
            (isRoleEmail && hasRole && priorityRole)
          );
        })
        // Pre-dedup within LLM extraction: merge duplicates by normalized name or email
        .reduce<StakeholderCandidate[]>((acc, st) => {
          const normName = normalizeNameDedup(st.name);
          const existingIdx = acc.findIndex((e) => {
            if (
              st.email &&
              e.email &&
              st.email.toLowerCase() === e.email.toLowerCase()
            )
              return true;
            if (
              normName &&
              normalizeNameDedup(e.name) === normName &&
              normName.length > 3
            )
              return true;
            return false;
          });
          const fallbackPhones = collectFallbackPhonesForStakeholder(st);
          const resolvedPhone = st.phone || fallbackPhones[0];
          if (existingIdx >= 0) {
            // Merge richer data into existing
            const existing = acc[existingIdx];
            acc[existingIdx] = {
              ...existing,
              name: existing.name || st.name,
              role: existing.role || st.role,
              email: existing.email || st.email,
              phone: existing.phone || resolvedPhone,
              linkedin_url: existing.linkedin_url || st.linkedin_url,
            };
          } else {
            acc.push({
              ...st,
              phone: resolvedPhone,
            });
          }
          return acc;
        }, [])
        .sort((a, b) => richness(b) - richness(a));

      const institutionDomain = normalizeInstitutionDomain(url);
      if (validStakeholders.length === 0 && institutionDomain) {
        const fallbackRoleContacts = uniqueRegexEmails
          .flatMap((email): StakeholderCandidate[] => {
            const role = inferRoleFromInstitutionEmail(email, institutionDomain);
            if (!role || !isSingletonRole(role)) return [];
            return [
              {
                role,
                email,
                phone: undefined,
                name: undefined,
                linkedin_url: undefined,
              },
            ];
          })
          .reduce<StakeholderCandidate[]>((acc, candidate) => {
            const existingIdx = acc.findIndex(
              (entry) =>
                entry.role?.toLowerCase() === candidate.role?.toLowerCase() ||
                entry.email?.toLowerCase() === candidate.email?.toLowerCase(),
            );
            if (existingIdx >= 0) {
              acc[existingIdx] = {
                ...acc[existingIdx],
                email: acc[existingIdx].email || candidate.email,
              };
            } else {
              acc.push(candidate);
            }
            return acc;
          }, []);
        validStakeholders.push(...fallbackRoleContacts);
      }

      // Filter out historical/non-current stakeholders (Founder, Former X, etc.)
      // even if archived contact details still exist on old pages.
      const HISTORICAL_ROLE_PATTERNS =
        /\b(former|ex-|past|retired|late|historical|emeritus|previous|incumbent)\b|^(founder|chairman emeritus|president emeritus|chancellor emeritus|vice chancellor emeritus)$/i;

      // Email-name consistency: if both exist, the email local part should
      // roughly match the person's name. Reject obvious mismatches.
      function emailMatchesStakeholder(
        email: string,
        name: string,
        role?: string | null,
      ): boolean {
        const local = email.split("@")[0].toLowerCase();
        const nameLower = name.toLowerCase();
        const nameTokens = nameLower
          .split(/[.\s]+/)
          .map((token) => token.trim())
          .filter(Boolean);
        // Extract first letters of each name part
        const nameInitials = nameTokens
          .map((w) => w[0])
          .join("");
        // Simple checks
        if (local.includes(nameLower.replace(/[.\s]/g, "").substring(0, 5))) return true;
        if (nameLower.includes(local.substring(0, 4))) return true;
        if (nameInitials.length >= 2 && local.includes(nameInitials)) return true;
        const longerTokens = nameTokens.filter((token) => token.length > 2);
        if (longerTokens.some((token) => local.includes(token))) return true;
        // Role-based institutional emails are acceptable if the alias matches
        // the stakeholder role for this institution.
        const inferredRole = inferRoleFromInstitutionEmail(email, institutionDomain);
        if (
          role &&
          inferredRole &&
          normalizeStakeholderRole(role) === normalizeStakeholderRole(inferredRole)
        ) {
          return true;
        }
        const domain = email.split("@")[1] || "";
        const isPersonalDomain = /gmail|yahoo|hotmail|outlook|rediff/.test(domain);
        return !isPersonalDomain && nameInitials.length >= 2 && local.includes(nameInitials);
      }

      // LinkedIn-name consistency: the URL slug should contain name fragments.
      function linkedinMatchesName(linkedinUrl: string, name: string): boolean {
        const slug = linkedinUrl.split("/in/")[1]?.toLowerCase() || "";
        if (!slug) return false;
        const parts = name.toLowerCase().split(/[.\s]+/).filter((w) => w.length > 2);
        if (parts.length === 0) return false;
        const matches = parts.filter((p) => slug.includes(p)).length;
        return matches >= 1;
      }

      const currentStakeholders = validStakeholders.filter((st) => {
        const role = st.role || "";
        const isHistorical = HISTORICAL_ROLE_PATTERNS.test(role);
        if (isHistorical) {
          console.warn(
            `[DeepEnrichment] Rejecting historical stakeholder: ${st.name} (${st.role})`,
          );
          return false;
        }
        // Reject bad email-name pairings
        if (st.email && st.name && !emailMatchesStakeholder(st.email, st.name, st.role)) {
          console.warn(
            `[DeepEnrichment] Rejecting mismatched email-name: ${st.email} → ${st.name}`,
          );
          return false;
        }
        // Reject bad LinkedIn-name pairings
        if (st.linkedin_url && st.name && !linkedinMatchesName(st.linkedin_url, st.name)) {
          console.warn(
            `[DeepEnrichment] Rejecting mismatched LinkedIn: ${st.linkedin_url} → ${st.name}`,
          );
          return false;
        }
        return true;
      });

      if (currentStakeholders.length > 0) {
        await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
          university_id: args.universityId,
          stakeholders: currentStakeholders.map((st) => ({
            name: st.name || undefined,
            role: st.role || undefined,
            email: st.email || undefined,
            phone: st.phone || undefined,
            linkedin_url: st.linkedin_url || undefined,
            email_source: st.email ? "scraped" : undefined,
            phone_source: st.phone ? "scraped" : undefined,
          })),
          source: "deep_enrichment",
        });
      }

      // Note: scoring is now handled by the orchestrator to avoid double-scoring
      // when multiple enrichment actions run in parallel.

      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: args.universityId,
        stage: "enriched",
      });

      // ─── Cost / Usage Logging ─────────────────────────────────────────────
      const llmUsage = summarizeLlmUsage(llmUsageEntries);
      const firecrawlCredits = 1 + validBlocks.length; // 1 map + N scrapes
      const flashInputChars = extractionPrompt.length;
      const estimatedFlashTokens = Math.round(flashInputChars / 4);
      console.log(
        `[DeepEnrichment] COST SUMMARY for ${uniName}:\n` +
          `  Firecrawl credits: ${firecrawlCredits} (1 map + ${validBlocks.length} scrapes)\n` +
          `  LLM exact tokens: in=${llmUsage.inputTokens.toLocaleString()} out=${llmUsage.outputTokens.toLocaleString()} total=${llmUsage.totalTokens.toLocaleString()}\n` +
          `  LLM exact cost: $${llmUsage.totalCostUsd.toFixed(6)} across ${llmUsage.calls} call(s)\n` +
          `  Estimated input tokens for context guard: ${estimatedFlashTokens.toLocaleString()}\n` +
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
        llmUsage,
      };
    } catch (e) {
      console.error("[DeepEnrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return {
        success: false,
        error: String(e),
        llmUsage: summarizeLlmUsage([]),
      };
    }
  },
});

/**
 * Debug action: traces the deep enrichment pipeline WITHOUT writing to DB.
 * Returns a detailed report of what each phase discovered.
 */
export const debugDeepEnrichment = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const report: Record<string, unknown> = { phases: {} };

    const university = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!university) return { error: "University not found" };

    const uniName = university.university_name;
    const url =
      typeof university.website === "string" ? university.website : "";
    report.university = uniName;
    report.website = url;

    // Phase 1: Check keys
    const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
    const firecrawlKey = await ctx.runQuery(internal.settings.getInternalFirecrawlKey);
    const rawSerperKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
    const serperKey = rawSerperKey ? rawSerperKey.trim() : null;
    report.keys = {
      gemini: !!apiKey,
      firecrawl: !!firecrawlKey,
      serper: !!serperKey,
    };

    // Phase 2: Firecrawl map
    let mapLinks: string[] = [];
    if (firecrawlKey) {
      try {
        const mapResult = await firecrawlMap(url, firecrawlKey as string);
        mapLinks = (mapResult.links || []).map((l) => l.url);
        report.phases = {
          ...(report.phases as object),
          firecrawlMap: {
            success: true,
            links: mapLinks.length,
            top10: mapLinks.slice(0, 10),
          },
        };
      } catch (e) {
        report.phases = {
          ...(report.phases as object),
          firecrawlMap: {
            success: false,
            error: e instanceof Error ? e.message : String(e),
          },
        };
      }
    }

    // Phase 3: External source search
    let externalUrls: string[] = [];
    if (serperKey) {
      try {
        const domain = url
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")
          .replace(/^www\./, "");
        externalUrls = await discoverExternalSources(
          uniName,
          domain,
          serperKey as string,
          createSerperBudget({ maxQueries: 2 }),
          {
            city: university.city,
            state: university.state,
            websitePath: new URL(url).pathname,
          },
        );
        report.phases = {
          ...(report.phases as object),
          externalSearch: { success: true, urls: externalUrls },
        };
      } catch (e) {
        report.phases = {
          ...(report.phases as object),
          externalSearch: {
            success: false,
            error: e instanceof Error ? e.message : String(e),
          },
        };
      }
    }

    // Phase 4: Jina Reader on external URLs
    const jinaResults: Record<string, { length: number; preview: string }> = {};
    for (const extUrl of externalUrls.slice(0, 3)) {
      try {
        const res = await fetch(`https://r.jina.ai/${extUrl}`, {
          headers: { Accept: "text/plain" },
          signal: AbortSignal.timeout(15000),
        });
        const text = await res.text();
        jinaResults[extUrl] = {
          length: text.length,
          preview: text.substring(0, 500),
        };
      } catch (e) {
        jinaResults[extUrl] = {
          length: 0,
          preview: `ERROR: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    report.phases = { ...(report.phases as object), jinaScrape: jinaResults };

    // Phase 5: Jina Reader on university contact page
    if (url) {
      try {
        const branchPriorityUrls = buildBranchScopedPriorityUrls(url, [], 2);
        const contactTarget =
          branchPriorityUrls.find((candidate) =>
            /\/contact(?:-us)?$/i.test(candidate),
          ) || `${url.replace(/\/$/, "")}/contact`;
        const contactRes = await fetch(
          `https://r.jina.ai/${contactTarget}`,
          {
            headers: { Accept: "text/plain" },
            signal: AbortSignal.timeout(15000),
          },
        );
        const contactText = await contactRes.text();
        const { emails, phones } = extractContactsFromMarkdown(contactText);
        report.phases = {
          ...(report.phases as object),
          contactPage: {
            length: contactText.length,
            emails,
            phones,
            preview: contactText.substring(0, 500),
          },
        };
      } catch (e) {
        report.phases = {
          ...(report.phases as object),
          contactPage: { error: e instanceof Error ? e.message : String(e) },
        };
      }
    }

    // Phase 6: Regex extraction from map links
    const allEmails = new Set<string>();
    const allPhones = new Set<string>();
    for (const link of mapLinks.slice(0, 10)) {
      try {
        const res = await fetch(`https://r.jina.ai/${link}`, {
          headers: { Accept: "text/plain" },
          signal: AbortSignal.timeout(10000),
        });
        const text = await res.text();
        const contacts = extractContactsFromMarkdown(text);
        contacts.emails.forEach((e) => allEmails.add(e));
        contacts.phones.forEach((p) => allPhones.add(p));
      } catch {
        // ignore
      }
    }
    report.phases = {
      ...(report.phases as object),
      regexScan: {
        emails: Array.from(allEmails),
        phones: Array.from(allPhones),
      },
    };

    return report;
  },
});
