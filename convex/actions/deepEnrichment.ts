"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  LlmUsageEntry,
  LlmUsageSummary,
  summarizeLlmUsage,
} from "../lib/llm";
import {
  withRetry,
  withConcurrencyLimit,
  sanitizeLlmInput,
  truncateAtNewline,
  isValidEmail,
  isValidIndianPhone,
  toNum,
  toNumStrict,
  extractDemographicsFromText,
} from "../lib/utils";
import {
  augmentStakeholderSources,
  computeDemographicSourceUrls,
  type StakeholderLike,
} from "../lib/validateDeepEnrichment";
import {
  extractPartialsFromSources,
  mergePartialExtractions,
} from "../lib/perSourceExtraction";
import {
  isDecisionMakerRole,
  isLikelyAcademicNonDecisionRole,
} from "../lib/stakeholderQuality";

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
  TARGET_ROLES,
} from "../lib/contactInference";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../lib/serperBudget";
import * as Sentry from "@sentry/node";



// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_CONTEXT_CHARS = 70_000; // Cap context to keep Gemini calls fast
const MAX_URLS_TO_SCRAPE = 6; // Limit first-pass Firecrawl API calls per enrichment
const MAX_FOLLOWUP_URLS = 4; // Free Jina-based recursive follow-up from menu pages
const MAX_CHARS_PER_SOURCE = 6_000; // Truncate each scraped source
const MIN_BLOCK_LENGTH = 200; // Minimum length for a block to be considered valid
const MAX_REGEX_CONTACTS = 30; // Cap to avoid bloating the prompt
const MAX_COST_ESTIMATE = 30_000; // Firecrawl credits * 100 + Gemini input tokens.
// A typical run: 1 map + 6 scrapes = 7 * 100 = 700.
// Plus ~55k chars prompt / 4 = ~13.7k tokens. Total ~14.4k.

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
 * Search for leadership, LinkedIn, and contact pages.
 * Government data (NIRF, AISHE, NAAC) is handled by enrichGovernmentData.ts.
 * Returns URLs sorted by relevance for stakeholder extraction.
 */
async function discoverExternalSources(
  uniName: string,
  domain: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 4 }),
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
  // Use simple keyword queries — Serper works best with natural language, not complex operators.
  // Put high-probability leadership-leaf queries first because they are the most common failure point.
  const queries = [
    // Leadership leaf pages (officers, deans, registrar, VC, telephone directory)
    `${uniName} ${locationTerms} site:${domain} officers deans registrar directory`,
    `${uniName} ${locationTerms} site:${domain} administration contact directory`,
    `${uniName} ${locationTerms} site:${domain} vice chancellor director finance officer`,
    // Administration / Contact
    `${uniName} ${locationTerms} administration contact dean office`,
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
        if (url.includes(domain.toLowerCase())) score += 8;
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

        // Content relevance signals
        if (/\b(contact|phone|email|directory|administration)\b/i.test(combined))
          score += 4;
        if (
          /\b(vice.?chancellor|registrar|dean|principal|director|officer)\b/i.test(
            combined,
          )
        )
          score += 4;

        // Leadership leaf page URL signals
        if (/(?<![a-zA-Z])(officer|officers|dean|deans|registrar|director|directors|chancellor|vice[-\s]?chancellor|chairman|chairperson)(?![a-zA-Z])/i.test(url))
          score += 6;
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
    .replace(/\[at\]/gi, "@")
    .replace(/\[dot\]/gi, ".")
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

// ─── Jina Reader helper with navigation stripping ─────────────────────────────
const JINA_REMOVE_SELECTOR =
  "nav, header, footer, .menu, .navbar, #menu, .main-navigation, .site-nav, .topbar, .sidebar, aside, .widget, .footer-content, .site-header, .masthead, .main-menu";

async function fetchJinaTextRaw(
  url: string,
  timeoutMs = 20000,
): Promise<string> {
  const res = await fetch(
    `https://r.jina.ai/${encodeURIComponent(url)}`,
    {
      headers: {
        Accept: "text/plain",
        "X-Remove-Selector": JINA_REMOVE_SELECTOR,
      },
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  if (!res.ok) {
    throw new Error(`Jina failed for ${url}: ${res.status}`);
  }
  return res.text();
}

async function fetchJinaText(
  url: string,
  timeoutMs = 20000,
): Promise<string> {
  return withRetry(
    () => fetchJinaTextRaw(url, timeoutMs),
    {
      maxRetries: 2,
      retryOn: (err: unknown) => {
        const status =
          (err as Record<string, unknown>)?.status ||
          (err as Record<string, unknown>)?.statusCode;
        if (typeof status === "number") {
          return status === 429 || (status >= 500 && status < 600);
        }
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        return /\b(429|50[0-3]|timeout|etimedout|fetch failed|network error|econnrefused|econnreset|socket hang up)\b/i.test(lower);
      },
    },
  );
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

const LEADERSHIP_URL_PATTERNS = [
  { re: /(?<![a-zA-Z])(chancellor|vice[-\s]?chancellor|pro[-\s]?vice[-\s]?chancellor|vc|provc)(?![a-zA-Z])/i, weight: 10 },
  { re: /(?<![a-zA-Z])(registrar|controller|finance|librarian|warden|rector|secretary|treasurer)(?![a-zA-Z])/i, weight: 8 },
  { re: /(?<![a-zA-Z])(dean|deans|director|directors|principal|head|hod|chairman|chairpersons?|president|owner)(?![a-zA-Z])/i, weight: 7 },
  { re: /(?<![a-zA-Z])(officer|officers)(?![a-zA-Z])/i, weight: 6 },
  { re: /(?<![a-zA-Z])(staff)(?![a-zA-Z])/i, weight: -10 },
  { re: /(?<![a-zA-Z])(administration|leadership|governance|management|executive|team)(?![a-zA-Z])/i, weight: 3 },
  { re: /(?<![a-zA-Z])(about[-\s]?us|about)(?![a-zA-Z])/i, weight: 2 },
  { re: /(?<![a-zA-Z])(contact|contact[-\s]?us|contactus)(?![a-zA-Z])/i, weight: 2 },
  { re: /(?<![a-zA-Z])(telephone[-_\s]?directory|phone[-_\s]?directory|directory)(?![a-zA-Z])/i, weight: 1 },
  { re: /(?<![a-zA-Z])(anti[-\s]?ragging|committee)(?![a-zA-Z])/i, weight: 1 },
  // NIRF data pages feed demographics; keep them in the scrape list, but lower
  // priority than leadership pages because they rarely contain decision makers.
  { re: /(?<![a-zA-Z])(nirf|nirf.ranking|nirf.report|nirf.data)(?![a-zA-Z])/i, weight: 2 },
];

function scoreLeadershipUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  for (const pattern of LEADERSHIP_URL_PATTERNS) {
    if (pattern.re.test(lower)) {
      score += pattern.weight;
    }
  }
  // Penalise very long URLs, query strings, binary/PDF links and ephemeral pages.
  if (/\?/.test(url)) score -= 2;
  if (/\.(pdf|docx?|xlsx?|pptx?|zip|mp4|mp3)$/i.test(url)) score -= 5;
  if (url.length > 120) score -= 1;
  // Drop news / event / meeting / circular / notification pages that rarely list stable decision makers.
  if (/(meeting|minutes|circular|notification|proud|news|event|blog|press[-_]?release|announcement|tender)/i.test(url))
    score -= 6;
  return score;
}

function scoreSourceBlock(block: string): number {
  const match = block.match(/=== (?:EXTERNAL |FOLLOWUP )?SOURCE: ([^=\n]+) ===/);
  const url = match?.[1]?.trim() || "";
  let score = scoreLeadershipUrl(url) || 0;
  const text = block.toLowerCase();
  if (/(nirf|naac|aishe|ssr|iqac|mandatory disclosure)/.test(text)) score += 3;
  if (/(vice\s*chancellor|registrar|dean|director|officer)/.test(text)) score += 4;
  if (/(hostel|hostelites|day scholar|student strength|enrollment)/.test(text)) score += 2;
  if (/(staff|attendant|stenographer|junior assistant|senior assistant|office assistant|technician)/.test(text)) score -= 3;
  if (/(news|event|blog|tender|career|notification)/.test(text)) score -= 4;
  return score;
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
    const branchScopedLinks = discoveredLinks
      .filter((link) => {
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
      })
      // Prioritise pages that are most likely to list named decision makers.
      .sort((a, b) => scoreLeadershipUrl(b) - scoreLeadershipUrl(a));

    const root = workingUrl.replace(/\/$/, "");
    const base = pathPrefix && pathPrefix !== "" ? `${parsed.origin}${pathPrefix}` : root;

    // Fallback guesses — many Indian university CMSs use .php or bare paths.
    // We only use these if the discovered map does not already surface better links.
    const guessPaths = [
      "/administration",
      "/admin",
      "/officers",
      "/officer",
      "/deans",
      "/dean",
      "/registrar",
      "/director",
      "/leadership",
      "/governance",
      "/team",
      "/directory",
      "/telephone-directory",
      "/telephone_directory",
      "/telephone",
      "/contact",
      "/contact-us",
      "/contactus",
      "/about",
      "/about-us",
      "/nirf",
      "/nirf-2",
      "/nirf-3",
      "/nirf-rankings",
      "/anti-ragging",
      "/antiragging",
      "/anti_ragging",
    ];
    const cmsExts = detectCmsExtensions(discoveredLinks).length
      ? detectCmsExtensions(discoveredLinks)
      : ["", ".php", ".html"];
    const guessed: string[] = [];
    for (const p of guessPaths) {
      for (const ext of cmsExts) {
        if (p.endsWith(ext) || (p.endsWith(".php") || p.endsWith(".html"))) {
          guessed.push(`${base}${p}`);
        } else {
          guessed.push(`${base}${p}${ext}`);
        }
      }
    }

    // Combine discovered links and fallback guesses, deduplicate by semantic URL
    // key, then sort by leadership relevance. Prepend the working URL.
    const candidateMap = new Map<string, string>();
    for (const link of [...branchScopedLinks, ...guessed]) {
      const key = normalizeUrlKey(link);
      const existing = candidateMap.get(key);
      if (!existing || scoreLeadershipUrl(link) > scoreLeadershipUrl(existing)) {
        candidateMap.set(key, link);
      }
    }
    const allCandidates = [...candidateMap.values()].sort(
      (a, b) => scoreLeadershipUrl(b) - scoreLeadershipUrl(a),
    );
    return [workingUrl, ...allCandidates].slice(0, maxUrls);
  } catch {
    return [];
  }
}

// ─── URL extraction helpers for recursive follow-up ───────────────────────────
const NON_SCRAPABLE_EXTENSIONS =
  /\.(pdf|docx?|xlsx?|pptx?|zip|jpg|jpeg|png|gif|svg|webp|mp4|mp3|avi|mov)$/i;

function cleanUrl(url: string): string {
  // Strip trailing punctuation that markdown extraction often captures
  return url.replace(/[\),.;'"\s]+$/, "");
}

function extractUrlsFromMarkdown(
  markdown: string,
  baseUrl: string,
): string[] {
  const found = new Set<string>();

  // Markdown [text](url) links (relative or absolute)
  const mdLinkRegex = /\[.*?\]\(([^\s)]+)\)/g;
  let match;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    found.add(cleanUrl(match[1].trim()));
  }

  // Autolinks <url>
  const autoLinkRegex = /<(https?:\/\/[^\s>]+)>/g;
  while ((match = autoLinkRegex.exec(markdown)) !== null) {
    found.add(cleanUrl(match[1].trim()));
  }

  // Bare URLs
  const bareRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  while ((match = bareRegex.exec(markdown)) !== null) {
    found.add(cleanUrl(match[0].trim()));
  }

  const resolved: string[] = [];
  for (const raw of found) {
    try {
      const abs = new URL(raw, baseUrl).href;
      resolved.push(abs);
    } catch {
      // Ignore malformed URLs
    }
  }
  return resolved;
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    // Strip www, trailing slash, and common CMS extensions; collapse punctuation.
    let key = u.hostname.replace(/^www\./i, "");
    let path = u.pathname
      .toLowerCase()
      .replace(/\.(php|html?)$/i, "")
      .replace(/\/$/, "")
      .replace(/[-_]/g, "");
    // Treat plural role pages as singular for dedup (officers ↔ officer, deans ↔ dean).
    path = path.replace(/s$/, "");
    key += path;
    return key;
  } catch {
    return url.toLowerCase();
  }
}

function isSamePageAnchor(link: string, sourceUrl: string): boolean {
  try {
    const source = new URL(sourceUrl);
    const candidate = new URL(link, sourceUrl);
    return (
      candidate.hash !== "" &&
      candidate.origin === source.origin &&
      candidate.pathname === source.pathname
    );
  } catch {
    return false;
  }
}

function detectCmsExtensions(discoveredLinks: string[]): string[] {
  const exts = new Set<string>();
  for (const l of discoveredLinks) {
    const match = l.match(/\.(php|html?|aspx?)$/i);
    if (match) exts.add(`.${match[1].toLowerCase()}`);
  }
  return exts.size > 0 ? [...exts] : [""];
}

function getLeadershipGuesses(baseUrl: string, discoveredLinks: string[] = []): string[] {
  const root = baseUrl.replace(/\/$/, "");
  const exts = detectCmsExtensions(discoveredLinks);
  const roles = [
    "officers",
    "officer",
    "deans",
    "dean",
    "registrar",
    "director",
    "director-message",
    "director-profile",
    "chairman",
    "chairperson",
    "chancellor",
    "vice-chancellor",
    "vicechancellor",
    "vice_chancellor",
    "vc",
    "finance-officer",
    "finance-officers",
    "finance_officer",
    "nirf",
    "nirf-2",
    "nirf-3",
    "nirf-rankings",
    "contact-us",
    "contactus",
    "contact",
    "telephone-directory",
    "telephone_directory",
  ];
  const guesses: string[] = [];
  for (const role of roles) {
    for (const ext of exts) {
      guesses.push(`${root}/${role}${ext}`);
      // For PHP sites, also try underscore variants used by some CMSs.
      if (ext === ".php" && role.includes("-")) {
        guesses.push(`${root}/${role.replace(/-/g, "_")}${ext}`);
      }
    }
  }
  return guesses;
}

function selectFollowupUrls(
  blocks: string[],
  baseUrl: string,
  alreadyScraped: Set<string>,
  maxUrls: number,
  discoveredLinks: string[] = [],
): string[] {
  const workingDomain = normalizeInstitutionDomain(baseUrl);
  // Deduplicate by origin+pathname, keep the best URL (no hash, no trailing junk)
  const candidates = new Map<string, { url: string; score: number }>();

  const addCandidate = (link: string, sourceUrl?: string) => {
    if (sourceUrl && isSamePageAnchor(link, sourceUrl)) return;
    const normalizedKey = normalizeUrlKey(link);
    if (alreadyScraped.has(link) || alreadyScraped.has(normalizedKey)) return;
    try {
      const candidate = new URL(link);
      const host = candidate.hostname.toLowerCase();
      if (host !== workingDomain && !host.endsWith(`.${workingDomain}`)) {
        return;
      }
      // Skip non-scrapable binary assets and image-serving paths
      if (NON_SCRAPABLE_EXTENSIONS.test(candidate.pathname)) return;
      if (candidate.pathname.includes("/_next/image")) return;
      const score = scoreLeadershipUrl(link);
      if (score <= 0) return;
      // Deduplicate by semantic URL key (ignore hash, trailing slash, extensions)
      const existing = candidates.get(normalizedKey);
      if (!existing || existing.score < score) {
        const url = `${candidate.origin}${candidate.pathname.replace(/\/$/, "")}${candidate.search}`;
        candidates.set(normalizedKey, { url, score });
      }
    } catch {
      // Ignore unparseable URLs
    }
  };

  // Add links found inside scraped page blocks
  for (const block of blocks) {
    const sourceMatch = block.match(/=== (?:EXTERNAL )?SOURCE: ([^=\n]+) ===/);
    const sourceUrl = (sourceMatch?.[1] || "").trim() || baseUrl;
    const links = extractUrlsFromMarkdown(block, sourceUrl);
    for (const link of links) {
      addCandidate(link, sourceUrl);
    }
  }

  // Also consider leadership-looking URLs discovered by Firecrawl map/Serper
  // that were not scraped at first level.
  for (const link of discoveredLinks) {
    addCandidate(link);
  }

  // Add standard leadership path guesses; many Indian university CMSs use .php or
  // bare slugs, and these pages are often not linked from the main nav that
  // Firecrawl/Jina extract.
  for (const guess of getLeadershipGuesses(baseUrl, discoveredLinks)) {
    addCandidate(guess);
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxUrls)
    .map((c) => c.url);
}

export const runDeepEnrichment = internalAction({
  args: {
    universityId: v.id("universities"),
    dryRun: v.optional(v.boolean()),
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
    stakeholders?: unknown[];
    demographics?: Record<string, unknown>;
    error?: string;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
      const dryRun = args.dryRun ?? false;
      let finalStakeholders: Record<string, unknown>[] = [];
      let finalDemographics: Record<string, unknown> = {};
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);

      if (!university) throw new Error("University not found");
      const uniName = university.university_name;
      const existingDemographics = (university.demographics ?? {}) as Record<string, unknown>;
      const url =
        typeof university.website === "string" ? university.website : "";

      if (!url) {
        throw new Error(
          `University ${uniName} has no website. Cannot run enrichment.`,
        );
      }

      // Some university records store websites without a scheme (e.g. "www.example.com").
      // Firecrawl tolerates this, but URL constructors and external source discovery do not.
      const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;

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
      const serperBudget = createSerperBudget({ maxQueries: 4 });

      // ─── Domain extraction ────────────────────────────────────────────────
      const rawDomain = normalizedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      console.log(
        `[DeepEnrichment] Domain="${domain}", starting Firecrawl pipeline...`,
      );

      // ─── Phase 1: Firecrawl Map → Discover high-yield URLs ───────────────
      let highYieldUrls: string[] = [];
      let mapResult: Awaited<ReturnType<typeof firecrawlMap>> | null = null;
      let workingUrl = normalizedUrl;

      const urlVariants = [normalizedUrl];
      if (normalizedUrl.startsWith("http://")) {
        urlVariants.push(normalizedUrl.replace("http://", "https://"));
      } else if (normalizedUrl.startsWith("https://")) {
        urlVariants.push(normalizedUrl.replace("https://", "http://"));
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
              `[DeepEnrichment] Firecrawl map success with ${tryUrl}: ${mapResult.links.length} URLs; selected ${highYieldUrls.length} high-yield targets: ${highYieldUrls.join(", ")}`,
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
        // Fallback: guess common subpages using the original URL (bare + .php)
        const guessPaths = [
          "/contact",
          "/contact-us",
          "/contactus",
          "/administration",
          "/admin",
          "/officers",
          "/deans",
          "/about",
          "/anti-ragging",
          "/antiragging",
          "/mandatory-disclosure",
          "/telephone-directory",
        ];
        highYieldUrls = [
          ...new Set(
            guessPaths.flatMap((p) => [
              `${workingUrl}${p}`,
              `${workingUrl}${p}.php`,
              `${workingUrl}${p}.html`,
            ]),
          ),
        ];
      }

      // ─── Phase 1b: External Source Discovery (AISHE/NIRF/NAAC/Admin) ────
      // Indian university demographics live on government portals, not university websites.
      // We search for these external sources and scrape them via Jina Reader (free).
      let externalBlocks: string[] = [];
      let externalUrls: string[] = [];
      if (serperKey) {
        try {
          externalUrls = await discoverExternalSources(
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
            const jinaTasks = externalUrls.map((extUrl) => async () => {
              try {
                const text = await fetchJinaText(extUrl, 25000);
                const normalized = normalizeContent(text).substring(
                  0,
                  MAX_CHARS_PER_SOURCE,
                );
                if (normalized.length < MIN_BLOCK_LENGTH) return "";
                return `\n=== EXTERNAL SOURCE: ${extUrl} ===\n${normalized}\n`;
              } catch (e) {
                console.warn(
                    `[DeepEnrichment] Jina Reader failed for ${extUrl}:`,
                    e instanceof Error ? e.message : String(e),
                  );
                return "";
              }
            });
            externalBlocks = (await withConcurrencyLimit(jinaTasks, 4)).filter(
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
      const scrapeTasks = highYieldUrls.map((targetUrl) => async () => {
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
          console.warn(
            `[DeepEnrichment] Firecrawl failed for ${targetUrl}, trying Jina Reader fallback:`,
            e instanceof Error ? e.message : String(e),
          );
          try {
            const text = await fetchJinaText(targetUrl, 25000);
            const normalized = normalizeContent(text).substring(
              0,
              MAX_CHARS_PER_SOURCE,
            );
            if (normalized.length >= MIN_BLOCK_LENGTH) {
              console.log(
                `[DeepEnrichment] Jina Reader fallback succeeded for ${targetUrl}`,
              );
              return `\n=== SOURCE: ${targetUrl} ===\n${normalized}\n`;
            }
          } catch (jinaErr) {
            console.warn(
              `[DeepEnrichment] Jina Reader fallback also failed for ${targetUrl}:`,
              jinaErr instanceof Error ? jinaErr.message : String(jinaErr),
            );
          }
          return "";
        }
      });

      const scrapedBlocks = await withConcurrencyLimit(scrapeTasks, 4);
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

      // ─── Phase 2c: Recursive follow-up to leadership leaf pages ────────────
      // University admin pages are often menus linking to separate officer/dean/registrar
      // pages. Follow the most promising in-page links using free Jina Reader.
      try {
        const alreadyScraped = new Set<string>();
        const addScraped = (url: string) => {
          try {
            const u = new URL(url);
            alreadyScraped.add(url);
            alreadyScraped.add(`${u.origin}${u.pathname}`);
            alreadyScraped.add(normalizeUrlKey(url));
          } catch {
            alreadyScraped.add(url);
          }
        };
        [workingUrl, ...highYieldUrls, ...externalUrls].forEach(addScraped);

        const discoveredLinks = mapResult
          ? (mapResult.links || []).map((l) => l.url)
          : [];
        const followupUrls = selectFollowupUrls(
          validBlocks,
          workingUrl,
          alreadyScraped,
          MAX_FOLLOWUP_URLS,
          [...discoveredLinks, ...externalUrls],
        );
        if (followupUrls.length > 0) {
          console.log(
            `[DeepEnrichment] Following ${followupUrls.length} leadership leaf links from scraped pages: ${followupUrls.join(", ")}`,
          );
          const followupTasks = followupUrls.map((fu) => async () => {
            try {
              const text = await fetchJinaText(fu, 25000);
              const normalized = normalizeContent(text).substring(
                0,
                MAX_CHARS_PER_SOURCE,
              );
              if (normalized.length < MIN_BLOCK_LENGTH) return "";
              return `\n=== FOLLOWUP SOURCE: ${fu} ===\n${normalized}\n`;
            } catch (e) {
              console.warn(
                `[DeepEnrichment] Follow-up Jina failed for ${fu}:`,
                e instanceof Error ? e.message : String(e),
              );
              return "";
            }
          });
          const followupBlocks = (await withConcurrencyLimit(followupTasks, 4)).filter(
            (b) => b.length > MIN_BLOCK_LENGTH,
          );
          if (followupBlocks.length > 0) {
            validBlocks = validBlocks.concat(followupBlocks);
            console.log(
              `[DeepEnrichment] Follow-up added ${followupBlocks.length} leaf-page blocks (total: ${validBlocks.length}).`,
            );
          }
        }
      } catch (e) {
        console.warn(
          `[DeepEnrichment] Recursive follow-up failed:`,
          e instanceof Error ? e.message : String(e),
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
          const arText = await fetchJinaText(arUrl, 20000);
          const contacts = extractContactsFromMarkdown(arText);
          contacts.emails.forEach((e) => antiRaggingContacts.emails.add(e));
          contacts.phones.forEach((p) => antiRaggingContacts.phones.add(p));
          // Also extract with context for downstream name→phone matching
          const withCtx = extractContactsWithContext(arText);
          withCtx.phones.forEach((p) => antiRaggingContacts.phoneContexts.push(p));
          console.log(
            `[DeepEnrichment] Anti-ragging page ${arUrl}: ${contacts.emails.length} emails, ${contacts.phones.length} phones.`,
          );
        } catch (e) {
          console.warn(
            `[DeepEnrichment] Anti-ragging Jina failed for ${arUrl}:`,
            e instanceof Error ? e.message : String(e),
          );
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

      // ─── Phase 3: Re-rank sources so per-source extraction starts with the
      // highest-yield blocks, then deduplicate & cap context.
      validBlocks.sort((a, b) => scoreSourceBlock(b) - scoreSourceBlock(a));

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
        (b) =>
          !b.includes("EXTERNAL SOURCE:") && !b.includes("FOLLOWUP SOURCE:"),
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
        stakeholders: StakeholderLike[];
      } | null = null;
      let synthesisAttempts = 0;
      const maxSynthesisAttempts = 2;
      while (synthesisAttempts < maxSynthesisAttempts) {
        synthesisAttempts++;
        try {
          console.log(
            `[DeepEnrichment] Phase 4: Running per-source extraction + merge (attempt ${synthesisAttempts})`,
          );
          const startMs = Date.now();

          const partials = await extractPartialsFromSources(
            validBlocks,
            {
              uniName,
              website: url,
              targetRoles: TARGET_ROLES,
              preDiscoveredEmails: uniqueRegexEmails,
              preDiscoveredPhones: uniqueRegexPhones,
            },
            apiKey,
            ctx,
            llmUsageEntries,
          );
          console.log(
            `[DeepEnrichment] Extracted ${partials.length} partial extractions`,
          );

          synthesizedJson = await mergePartialExtractions(
            partials,
            {
              uniName,
              website: url,
              targetRoles: TARGET_ROLES,
              preDiscoveredEmails: uniqueRegexEmails,
              preDiscoveredPhones: uniqueRegexPhones,
            },
            apiKey,
            ctx,
            llmUsageEntries,
          );

          // Attach source provenance where the model did not provide it
          synthesizedJson.stakeholders = augmentStakeholderSources(
            synthesizedJson.stakeholders,
            validBlocks,
          );
          const demographicSourceUrls = computeDemographicSourceUrls(validBlocks);
          if (demographicSourceUrls.length > 0 && synthesizedJson.demographics) {
            synthesizedJson.demographics.source_urls = demographicSourceUrls;
          }

          console.log(
            `[DeepEnrichment] Gemini latency: ${Date.now() - startMs}ms`,
          );

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
                `[DeepEnrichment] Gemini synthesis unavailable. Falling back to ${regexFallbackStakeholders.length} regex role/phone contacts.`,
              );
              synthesizedJson = {
                demographics: {},
                stakeholders: regexFallbackStakeholders.map((st) => ({
                  name: st.name,
                  role: st.role,
                  email: st.email,
                  phone: st.phone,
                  linkedin_url: st.linkedin_url,
                  email_source: st.email ? "regex" : undefined,
                  phone_source: st.phone ? "regex" : undefined,
                })),
              };
              finalStakeholders = synthesizedJson.stakeholders as Record<string, unknown>[];
              break;
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
        data_quality:
          typeof demographics.data_quality === "string"
            ? demographics.data_quality
            : undefined,
        source_urls: Array.isArray(demographics.source_urls)
          ? demographics.source_urls.filter((u) => typeof u === "string")
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

      // Determine data quality for this enrichment run
      function inferDataQuality(d: Record<string, unknown>): "verified" | "partial" | "inferred" {
        const quality = d.data_quality;
        if (quality === "verified" || quality === "partial" || quality === "inferred") {
          return quality as "verified" | "partial" | "inferred";
        }
        const sourceUrls = Array.isArray(d.source_urls) ? d.source_urls : [];
        const source = String(d.source || "").toLowerCase();
        const hasGovSource = sourceUrls.some(
          (u: unknown) =>
            typeof u === "string" &&
            /\b(nirfindia|aishe|naac|ugc|gov\.in)\b/i.test(u),
        );
        const hasNirf =
          source.includes("nirf") ||
          /\bnirf\b/i.test(String(d.nirf_source || ""));
        if (hasGovSource || hasNirf) return "verified";
        const hasNonMarketingSource =
          sourceUrls.length > 0 ||
          /\b(anti[-\s]?ragging|mandatory disclosure|ssr|iqac|aqar)\b/i.test(source);
        return hasNonMarketingSource ? "partial" : "inferred";
      }

      function shouldWriteDemographics(
        existing: Record<string, unknown>,
        newQuality: "verified" | "partial" | "inferred",
      ): boolean {
        const existingQuality = existing.data_quality;
        if (existingQuality === "verified" && newQuality !== "verified") {
          console.log(
            `[DeepEnrichment] Existing demographics are verified. Skipping ${newQuality} overwrite.`,
          );
          return false;
        }
        return true;
      }

      const demoQuality = inferDataQuality(demo);
      demo.data_quality = demoQuality;

      finalDemographics = demo;

      if (
        demo &&
        Object.values(demo).some((val) => typeof val === "number" && val > 0)
      ) {
        if (shouldWriteDemographics(existingDemographics, demoQuality)) {
          if (dryRun) {
            console.log(
              `[DeepEnrichment] dryRun: skipping persistence of demographics with quality ${demoQuality}.`,
            );
          } else {
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
          }
        }
      } else {
        // Recovery fallback: if LLM returns demographics keys with null values,
        // salvage obvious numeric splits from raw context.
        const fallback = extractDemographicsFromText(finalContext);
        if (
          Object.values(fallback).some(
            (val) => typeof val === "number" && val > 0,
          )
        ) {
          if (shouldWriteDemographics(existingDemographics, "partial")) {
            const fallbackDemo = {
              ...fallback,
              source: "context_regex_fallback",
              data_quality: "partial",
              source_urls: computeDemographicSourceUrls(validBlocks),
            };
            finalDemographics = fallbackDemo;
            if (dryRun) {
              console.warn(
                "[DeepEnrichment] dryRun: skipping regex fallback demographics persistence.",
              );
            } else {
              console.warn(
                "[DeepEnrichment] LLM demographics empty. Applying regex fallback demographics extraction.",
              );
              await ctx.runMutation(
                internal.universities.updateDemographicsInternal,
                {
                  universityId: args.universityId,
                  demographics: fallbackDemo,
                },
              );
            }
          } else {
            console.warn(
              "[DeepEnrichment] Existing demographics are verified; skipping regex fallback.",
            );
          }
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
        source_url?: string;
        sources?: string[];
      }

      function isClericalOrSupportRole(role?: string | null): boolean {
        if (!role) return false;
        const lower = role.toLowerCase();
        return /\b(staff|assistant|attendant|stenographer|technician|superintendent|operator|driver|peon|clerk)\b/.test(lower);
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

        // If there are multiple phones and no name match, do not blindly assign
        // the first phone; that over-assigns shared office numbers.
        if (uniqueRegexPhones.length > 1) return [];

        // Single-phone fallback: only assign if the stakeholder's name or role
        // appears in the context near that phone, or if the role is a singleton
        // decision-maker role that plausibly owns the main office number.
        const normalizedRole = (stakeholder.role || "").toLowerCase();
        const normalizedName = normalizeNameDedup(stakeholder.name);
        if (!normalizedName && !normalizedRole) return [];

        const phone = uniqueRegexPhones[0];
        const phoneCtx = allPhoneContexts.find((p) => p.value === phone);
        const ctx = (phoneCtx?.context || "").toLowerCase();
        const nameFirstToken = normalizedName?.split(" ")[0];
        if (
          nameFirstToken && ctx.includes(nameFirstToken)
        ) {
          return [phone];
        }
        if (normalizedRole && ctx.includes(normalizedRole)) {
          return [phone];
        }

        if (
          isSingletonRole(stakeholder.role) ||
          isDecisionMakerRole(stakeholder.role)
        ) {
          return [phone];
        }

        return [];
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

          // Drop clerical / support staff unless they have a priority role.
          if (!priorityRole && isClericalOrSupportRole(st.role)) return false;

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
        /\b(former|ex-|past|retired|late|historical|emeritus|previous)\b|^(founder|chairman emeritus|president emeritus|chancellor emeritus|vice chancellor emeritus)$/i;

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

      const currentStakeholders = validStakeholders
        .map((st) => {
          const cleaned: StakeholderCandidate = { ...st };
          // Strip mismatched generic emails instead of discarding the whole stakeholder.
          // A named Chancellor/Registrar with info@... is still valuable without that email.
          if (cleaned.email && cleaned.name && !emailMatchesStakeholder(cleaned.email, cleaned.name, cleaned.role)) {
            console.warn(
              `[DeepEnrichment] Stripping mismatched email ${cleaned.email} for ${cleaned.name}`,
            );
            cleaned.email = undefined;
          }
          // Strip mismatched LinkedIn URLs similarly.
          if (cleaned.linkedin_url && cleaned.name && !linkedinMatchesName(cleaned.linkedin_url, cleaned.name)) {
            console.warn(
              `[DeepEnrichment] Stripping mismatched LinkedIn ${cleaned.linkedin_url} for ${cleaned.name}`,
            );
            cleaned.linkedin_url = undefined;
          }
          return cleaned;
        })
        .filter((st) => {
          const role = st.role || "";
          const isHistorical = HISTORICAL_ROLE_PATTERNS.test(role);
          if (isHistorical) {
            console.warn(
              `[DeepEnrichment] Rejecting historical stakeholder: ${st.name} (${st.role})`,
            );
            return false;
          }
          // After cleaning contacts, keep stakeholders that still carry outreach value:
          // a real name plus either a priority role or a remaining valid contact channel.
          const hasName = !!st.name?.trim();
          const hasRole = !!st.role?.trim();
          const decisionRole = isDecisionMakerRole(st.role);
          const priorityRole = decisionRole || isSingletonRole(st.role);
          const hasValidEmail = !!st.email && isValidEmail(st.email);
          const hasValidPhone = !!st.phone && isValidIndianPhone(st.phone);
          const hasLinkedin =
            !!st.linkedin_url &&
            /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(
              st.linkedin_url,
            );
          return (
            hasName &&
            (hasValidEmail || hasValidPhone || hasLinkedin || (hasRole && priorityRole))
          );
        });

      finalStakeholders = currentStakeholders.map((st) => ({
        name: st.name || undefined,
        role: st.role || undefined,
        email: st.email || undefined,
        phone: st.phone || undefined,
        linkedin_url: st.linkedin_url || undefined,
        source_url: st.source_url || undefined,
        sources:
          st.sources ??
          (st.source_url ? [st.source_url] : undefined),
        email_source: st.email ? "scraped" : undefined,
        phone_source: st.phone ? "scraped" : undefined,
      }));

      if (currentStakeholders.length > 0) {
        if (dryRun) {
          console.log(
            `[DeepEnrichment] dryRun: skipping persistence of ${currentStakeholders.length} stakeholders.`,
          );
        } else {
          await ctx.runMutation(internal.stakeholders.upsertBulkInternal, {
            university_id: args.universityId,
            stakeholders: finalStakeholders,
            source: "deep_enrichment",
          });
        }
      }

      // Note: scoring is now handled by the orchestrator to avoid double-scoring
      // when multiple enrichment actions run in parallel.

      if (!dryRun) {
        await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
          universityId: args.universityId,
          stage: "enriched",
        });
      }

      // ─── Cost / Usage Logging ─────────────────────────────────────────────
      const llmUsage = summarizeLlmUsage(llmUsageEntries);
      const firecrawlCredits = 1 + firecrawlBasedBlocks.length; // 1 map + N scrapes
      const flashInputChars = extractionPrompt.length;
      const estimatedFlashTokens = Math.round(flashInputChars / 4);
      console.log(
        `[DeepEnrichment] COST SUMMARY for ${uniName}:\n` +
          `  Firecrawl credits: ${firecrawlCredits} (1 map + ${firecrawlBasedBlocks.length} scrapes)\n` +
          `  LLM exact tokens: in=${llmUsage.inputTokens.toLocaleString()} out=${llmUsage.outputTokens.toLocaleString()} total=${llmUsage.totalTokens.toLocaleString()}\n` +
          `  LLM exact cost: $${llmUsage.totalCostUsd.toFixed(6)} across ${llmUsage.calls} call(s)\n` +
          `  Estimated input tokens for context guard: ${estimatedFlashTokens.toLocaleString()}\n` +
          `  Context: ${finalContext.length.toLocaleString()} chars (raw: ${rawContext.length.toLocaleString()})`,
      );

      const demographicsIncluded =
        !!finalDemographics &&
        Object.values(finalDemographics).some(
          (v) => typeof v === "number" && v > 0,
        );

      return {
        success: true,
        stakeholdersSynthesized: finalStakeholders.length,
        demographicsIncluded,
        contextChars: finalContext.length,
        estimatedTokens: {
          flash: estimatedFlashTokens,
          pro: 0, // legacy field — we no longer use Pro
        },
        llmUsage,
        stakeholders: dryRun ? finalStakeholders : undefined,
        demographics: dryRun ? finalDemographics : undefined,
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
    const rawUrl =
      typeof university.website === "string" ? university.website : "";
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    report.university = uniName;
    report.website = url;
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
          createSerperBudget({ maxQueries: 4 }),
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
          `https://r.jina.ai/${encodeURIComponent(contactTarget)}`,
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
        const res = await fetch(`https://r.jina.ai/${encodeURIComponent(link)}`, {
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
