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
  truncateAtNewline,
  isValidEmail,
  isValidIndianPhone,
} from "../lib/utils";
import {
  augmentStakeholderSources,
  enforceSingletonRoles,
  linkedinMatchesName,
  type StakeholderLike,
} from "../lib/validateDeepEnrichment";
import { gapFillMissingRoles } from "../lib/gapFill";
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
  type ContactWithContext,
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
const MAX_FOLLOWUP_URLS = 8; // Free Jina-based recursive follow-up from menu pages
const MAX_CHARS_PER_SOURCE = 6_000; // Truncate each scraped source
const MIN_BLOCK_LENGTH = 200; // Minimum length for a block to be considered valid
const MAX_FIRECRAWL_SCRAPES_PER_UNIVERSITY = 7; // Cap Firecrawl scrape credits per run; Jina takes over after
const MAX_REGEX_CONTACTS = 30; // Cap to avoid bloating the prompt
const MAX_COST_ESTIMATE = 30_000; // Firecrawl credits * 100 + Gemini input tokens.
// A typical run: 1 map + 6 scrapes = 7 * 100 = 700.
// Plus ~55k chars prompt / 4 = ~13.7k tokens. Total ~14.4k.

// ─── External Source Search Helpers ────────────────────────────────────────────
// Search for leadership, contact and LinkedIn pages. Demographics are handled by
// enrichGovernmentData, not deep enrichment.

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
export interface ExternalSource {
  url: string;
  title?: string;
  snippet?: string;
}

async function discoverExternalSources(
  uniName: string,
  domain: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 6 }),
  options: {
    city?: string;
    state?: string;
    websitePath?: string;
  } = {},
): Promise<ExternalSource[]> {
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
    // LinkedIn for officials (also surfaces official posts/announcements)
    `${uniName} ${locationTerms} vice chancellor registrar linkedin`,
    `${uniName} ${locationTerms} director dean linkedin`,
    // General contact info search
    `${uniName} ${locationTerms} phone email address contact`,
  ];

  const allUrls: { source: ExternalSource; score: number }[] = [];
  const seen = new Set<string>();
  const officialDomain = domain.toLowerCase();

  const institutionNameTokens = uniName
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  // Official social / community sites for the institution.  Announcements on
  // these often name the *current* office-holder before the main website is
  // updated (e.g. a new Vice-Chancellor appointment).
  const OFFICIAL_SOCIAL_HOSTS = new Set([
    "facebook.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "instagram.com",
    "youtube.com",
  ]);

  // Only keep URLs on the official domain / subdomains, plus LinkedIn profiles
  // and official social-media posts about the institution's leadership.
  const isRelevantExternalUrl = (link: string, title = "", snippet = ""): boolean => {
    try {
      const u = new URL(link);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (
        host === officialDomain ||
        host.endsWith(`.${officialDomain}`) ||
        officialDomain.endsWith(`.${host}`)
      ) {
        return true;
      }
      if (
        (host === "linkedin.com" || host.endsWith(".linkedin.com")) &&
        u.pathname.toLowerCase().startsWith("/in/")
      ) {
        return true;
      }
      if (OFFICIAL_SOCIAL_HOSTS.has(host)) {
        const combined = `${u.pathname} ${title} ${snippet}`.toLowerCase();
        const hasInstitution = institutionNameTokens.some((t) =>
          combined.includes(t),
        );
        const hasLeadership = /\b(vice\s*chancellor|pro\s*vice\s*chancellor|registrar|dean|director|chancellor|chairman|principal)\b/i.test(
          combined,
        );
        if (hasInstitution && hasLeadership) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  };

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
        if (!isRelevantExternalUrl(r.link, r.title, r.snippet)) {
          console.log(`[ExternalSearch] Skipping off-domain result: ${r.link}`);
          continue;
        }
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

        if (score > 0) {
          allUrls.push({
            source: {
              url: r.link,
              title: r.title,
              snippet: r.snippet,
            },
            score,
          });
        }
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
    .slice(0, 5)
    .map((u) => u.source);
}

/**
 * Fallback for .gov.in sites that block Firecrawl/Jina: pull Serper snippets
 * for leadership/contact queries and build source blocks from them. Only
 * official-domain / gov.in results are kept, and every block still flows
 * through the normal per-source extraction + evidence sanitisation.
 */
async function discoverThinSiteSnippetBlocks(
  uniName: string,
  domain: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 2 }),
): Promise<string[]> {
  const queries = [
    `${uniName} vice chancellor registrar`,
    `${uniName} registrar contact`,
    `${uniName} administration officers`,
    `${uniName} director general director`,
  ];
  const blocks: string[] = [];
  const seen = new Set<string>();
  const officialHosts = new Set([domain.toLowerCase()]);

  for (const q of queries) {
    if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) break;
    try {
      const searchResult = await runWithSerperBudget(serperBudget, () =>
        withRetry(() => serperSearch(q, serperKey, 5), {
          maxRetries: 1,
        }),
      );
      if (!searchResult.ok) {
        if (searchResult.quotaExhausted) {
          console.warn(
            `[DeepEnrichment] thin-site Serper quota exhausted after "${q}"`,
          );
          break;
        }
        console.warn(
          `[DeepEnrichment] thin-site Serper query failed for "${q}": ${searchResult.reason || "unknown"}`,
        );
        continue;
      }
      const results = searchResult.value?.organic || [];
      let accepted = 0;
      for (const r of results) {
        if (!r.link || seen.has(r.link)) continue;
        seen.add(r.link);
        let host = "";
        try {
          host = new URL(r.link).hostname.replace(/^www\./i, "").toLowerCase();
        } catch {
          continue;
        }
        const onOfficial = [...officialHosts].some(
          (h) =>
            host === h || host.endsWith(`.${h}`) || h.endsWith(`.${host}`),
        );
        if (!onOfficial && !host.endsWith(".gov.in")) continue;
        // Snippet blocks are intentionally shorter than full-page blocks;
        // leadership snippets are still useful evidence for per-source extraction.
        const text = `TITLE: ${r.title || "N/A"}\nSNIPPET: ${r.snippet || "N/A"}`;
        if (text.length >= 100) {
          blocks.push(`\n=== EXTERNAL SOURCE: ${r.link} ===\n${text}\n`);
          accepted++;
        }
      }
      console.log(
        `[DeepEnrichment] thin-site Serper "${q}" → ${results.length} results, ${accepted} snippet blocks`,
      );
    } catch (e) {
      console.warn(
        `[DeepEnrichment] thin-site Serper query failed: "${q}"`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  return blocks;
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
  { re: /(?<![a-zA-Z])(officers[-_]?of[-_]?|officers?[-_]?of)(?![a-zA-Z])/i, weight: 12 },
  { re: /(?<![a-zA-Z])(officer|officers)(?![a-zA-Z])/i, weight: 6 },
  { re: /(?<![a-zA-Z])(staff)(?![a-zA-Z])/i, weight: -10 },
  { re: /(?<![a-zA-Z])(administration|leadership|governance|management|executive|team)(?![a-zA-Z])/i, weight: 3 },
  { re: /(?<![a-zA-Z])(about[-\s]?us|about)(?![a-zA-Z])/i, weight: 2 },
  { re: /(?<![a-zA-Z])(contact|contact[-\s]?us|contactus)(?![a-zA-Z])/i, weight: 2 },
  { re: /(?<![a-zA-Z])(telephone[-_\s]?directory|phone[-_\s]?directory|directory)(?![a-zA-Z])/i, weight: 1 },
  { re: /(?<![a-zA-Z])(anti[-\s]?ragging|committee)(?![a-zA-Z])/i, weight: 1 },
  // NIRF data pages may appear on the site; keep them but deprioritise.
  // Demographics are now handled by enrichGovernmentData, not deep enrichment.
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

  // Boost blocks that contain many named people (e.g. an officers table)
  const titleMatches = (text.match(/\b(dr\.|prof\.|mr\.|mrs\.|shri\.|smt\.|er\.)\s+[a-z]/gi) || []).length;
  score += Math.min(titleMatches, 12);

  // Strong boost for blocks that name a specific person in a leadership role
  // (e.g. "Prof. (Dr.) M. Afshar Alam, Vice-Chancellor" or an officers table).
  if (/(prof\.?|dr\.?|mr\.?|mrs\.?)\s+[a-z].*\b(vice[-\s]?chancellor|registrar|dean|director|controller|chancellor|finance[-\s]?officer|librarian|warden|rector)/i.test(text)) {
    score += 10;
  }

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
  let cleaned = url.replace(/[\),.;'"\s]+$/, "");
  // If a known binary extension is followed by extra characters, truncate there
  const extMatch = cleaned.match(/(\.pdf|\.docx?|\.xlsx?|\.pptx?|\.zip)([^?#]*)/i);
  if (extMatch) {
    cleaned = cleaned.substring(0, cleaned.toLowerCase().indexOf(extMatch[1].toLowerCase()) + extMatch[1].length);
  }
  return cleaned;
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

  // Reference-style link definitions: [id]: url "title"
  const refDefRegex = /^\[(.*?)\]:\s*(\S+)/gm;
  const refMap = new Map<string, string>();
  while ((match = refDefRegex.exec(markdown)) !== null) {
    const id = match[1].trim().toLowerCase();
    const url = match[2].trim();
    if (id && url && !refMap.has(id)) {
      refMap.set(id, cleanUrl(url));
    }
  }

  // Reference-style link usages: [text][id] or [text] [id]
  // After exhausting inline-style, also resolve collapsed [id][] references.
  const refLinkRegex = /\[(?:[^\]]+)\]\[(\s*[^\]]+?)\]|\[([^\]]+)\]\s?\[\]/g;
  while ((match = refLinkRegex.exec(markdown)) !== null) {
    const id = (match[1] || match[2] || "").trim().toLowerCase();
    if (id && refMap.has(id)) {
      found.add(refMap.get(id)!);
    }
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
      if (
        host !== workingDomain &&
        !host.endsWith(`.${workingDomain}`) &&
        !workingDomain.endsWith(`.${host}`)
      ) {
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
    maxSerperQueries: v.optional(v.number()),
    preDiscoveredOfficers: v.optional(
      v.array(
        v.object({
          name: v.optional(v.string()),
          role: v.optional(v.string()),
        }),
      ),
    ),
    // Scheduled-orchestration continuation: when set, deep schedules the
    // post-deep phases (social refresh + scoring) itself instead of returning,
    // so it never runs as a nested child action with a tighter runtime cap.
    continuation: v.optional(v.boolean()),
    queue: v.optional(v.array(v.string())),
    serperUsedBefore: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    skipped?: boolean;
    reason?: string;
    stakeholdersSynthesized?: number;
    contextChars?: number;
    estimatedTokens?: { flash: number; pro: number };
    serperQueriesUsed?: number;
    firecrawlCreditsUsed?: number;
    llmUsage?: LlmUsageSummary;
    stakeholders?: unknown[];
    error?: string;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
      const dryRun = args.dryRun ?? false;
      let finalStakeholders: Record<string, unknown>[] = [];
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
      // Credit discipline: external discovery gets 3 queries, thin-site snippet
      // fallback gets 2 (fresh budgets, sequential phases).
      const serperBudget = createSerperBudget({
        maxQueries: Math.min(3, args.maxSerperQueries ?? 6),
      });

      // ─── Domain extraction ────────────────────────────────────────────────
      const rawDomain = normalizedUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const domain = rawDomain.replace(/^www\./, "");

      console.log(
        `[DeepEnrichment] Domain="${domain}", starting Firecrawl pipeline...`,
      );

      // ─── Phase 1: Firecrawl Map → Discover high-yield URLs ───────────────
      // Credit discipline: exactly ONE map attempt (no http/https variant
      // loop — each attempt consumes a credit). On failure we fall back to
      // free Jina-only guessed paths.
      let highYieldUrls: string[] = [];
      let mapResult: Awaited<ReturnType<typeof firecrawlMap>> | null = null;
      const workingUrl = normalizedUrl;
      let firecrawlCreditsUsed = 0;
      let firecrawlMapCount = 0;
      let firecrawlScrapeCount = 0;
      // Set when the Firecrawl plan reports no credits left: the rest of the
      // run goes Jina-only without wasting scrape attempts.
      let firecrawlDisabled = false;

      try {
        firecrawlCreditsUsed += 1;
        firecrawlMapCount += 1;
        mapResult = await withRetry(
          async () => firecrawlMap(workingUrl, firecrawlKey),
          { maxRetries: 1 },
        );
        if (mapResult.links && mapResult.links.length > 0) {
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
            `[DeepEnrichment] Firecrawl map success with ${workingUrl}: ${mapResult.links.length} URLs; selected ${highYieldUrls.length} high-yield targets: ${highYieldUrls.join(", ")}`,
          );
        }
      } catch (e) {
        const mapErr = e instanceof Error ? e.message : String(e);
        console.warn(
          `[DeepEnrichment] Firecrawl map failed for ${workingUrl}:`,
          mapErr,
        );
        if (/insufficient credits|not enough credits/i.test(mapErr)) {
          firecrawlDisabled = true;
          console.warn(
            `[DeepEnrichment] Firecrawl plan out of credits; running Jina-only for ${uniName}`,
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

      // ─── Phase 1b: External Source Discovery (leadership/contact/LinkedIn) ────
      // Supplement site scraping with Serper for leadership leaf pages and LinkedIn profiles.
      // Demographics are handled separately by enrichGovernmentData.
      let externalBlocks: string[] = [];
      let externalSources: ExternalSource[] = [];
      if (serperKey) {
        try {
          externalSources = await discoverExternalSources(
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
          if (externalSources.length > 0) {
            console.log(
              `[DeepEnrichment] Discovered ${externalSources.length} external sources: ${externalSources.map((s) => s.url).join(", ")}`,
            );
            const jinaTasks = externalSources.map((ext) => async () => {
              const { url: extUrl, title = "", snippet = "" } = ext;
              try {
                const text = await fetchJinaText(extUrl, 25000);
                const fetched = normalizeContent(text).substring(
                  0,
                  MAX_CHARS_PER_SOURCE,
                );
                if (fetched.length >= MIN_BLOCK_LENGTH) {
                  return `\n=== EXTERNAL SOURCE: ${extUrl} ===\n${
                    title ? `TITLE: ${title}\n` : ""
                  }${
                    snippet ? `SNIPPET: ${snippet}\n` : ""
                  }${fetched}\n`;
                }
              } catch (e) {
                console.warn(
                    `[DeepEnrichment] Jina Reader failed for ${extUrl}:`,
                    e instanceof Error ? e.message : String(e),
                  );
              }
              // If Jina failed or returned too little, fall back to the
              // search result title + snippet. This is especially useful for
              // official social-media announcement posts.
              if (title || snippet) {
                const fallback = `TITLE: ${title || "N/A"}\nSNIPPET: ${snippet || "N/A"}`;
                if (fallback.length >= MIN_BLOCK_LENGTH) {
                  return `\n=== EXTERNAL SOURCE: ${extUrl} ===\n${fallback}\n`;
                }
              }
              return "";
            });
            externalBlocks = (await withConcurrencyLimit(jinaTasks, 3)).filter(
              (b) => b.length > MIN_BLOCK_LENGTH,
            );
            console.log(
              `[DeepEnrichment] External scraping: ${externalBlocks.length}/${externalSources.length} sources succeeded.`,
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
      // Credit discipline: 1 map + up to MAX_FIRECRAWL_SCRAPES_PER_UNIVERSITY
      // scrapes (≤8 total). Once the cap is reached — or a 429 /
      // insufficient-credits error is seen — remaining URLs go straight to the
      // free Jina Reader fallback.
      const maxFirecrawlTotal = 1 + MAX_FIRECRAWL_SCRAPES_PER_UNIVERSITY;
      const scrapeTasks = highYieldUrls.map((targetUrl) => async () => {
        let markdown = "";
        let firecrawlAttempted = false;
        if (!firecrawlDisabled && firecrawlCreditsUsed < maxFirecrawlTotal) {
          firecrawlCreditsUsed += 1;
          firecrawlScrapeCount += 1;
          firecrawlAttempted = true;
          try {
            const result = await withRetry(
              async () => firecrawlScrape(targetUrl, firecrawlKey),
              { maxRetries: 1 },
            );
            markdown = result.data?.markdown || "";
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(
              `[DeepEnrichment] Firecrawl failed for ${targetUrl}, trying Jina Reader fallback:`,
              msg,
            );
            // Rate-limited or out of credits: stop burning attempts and route
            // the remaining URLs through the free Jina Reader path.
            if (
              /\b429\b|rate limit|ratelimit|insufficient credits|not enough credits/i.test(
                msg,
              )
            ) {
              firecrawlCreditsUsed = maxFirecrawlTotal;
              if (/insufficient credits|not enough credits/i.test(msg)) {
                firecrawlDisabled = true;
              }
              console.warn(
                `[DeepEnrichment] Firecrawl ${/\b429\b|rate limit|ratelimit/i.test(msg) ? "rate limit" : "credit limit"} hit; switching remaining scrapes to Jina Reader`,
              );
            }
          }
        }

        if (!markdown) {
          try {
            markdown = await fetchJinaText(targetUrl, 25000);
            if (firecrawlAttempted) {
              console.log(
                `[DeepEnrichment] Jina Reader fallback succeeded for ${targetUrl}`,
              );
            }
          } catch (jinaErr) {
            console.warn(
              `[DeepEnrichment] Jina Reader failed for ${targetUrl}:`,
              jinaErr instanceof Error ? jinaErr.message : String(jinaErr),
            );
            return "";
          }
        }

        const normalized = normalizeContent(markdown).substring(
          0,
          MAX_CHARS_PER_SOURCE,
        );
        if (normalized.length < MIN_BLOCK_LENGTH) return "";
        return `\n=== SOURCE: ${targetUrl} ===\n${normalized}\n`;
      });

      const scrapedBlocks = await withConcurrencyLimit(scrapeTasks, 2);
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
        [
          workingUrl,
          ...highYieldUrls,
          ...externalSources.map((s) => s.url),
        ].forEach(addScraped);

        const discoveredLinks = mapResult
          ? (mapResult.links || []).map((l) => l.url)
          : [];
        const followupUrls = selectFollowupUrls(
          validBlocks,
          workingUrl,
          alreadyScraped,
          MAX_FOLLOWUP_URLS,
          [...discoveredLinks, ...externalSources.map((s) => s.url)],
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
          const followupBlocks = (await withConcurrencyLimit(followupTasks, 2)).filter(
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

      // ─── Phase 2d: thin-site snippet fallback (any university) ──────────
      // Sites that block Firecrawl/Jina (e.g. .gov.in) or are simply thin
      // produce little context. When the assembled context is below threshold,
      // supplement with Serper snippets (official-domain results only) so
      // per-source extraction still has evidence to work with.
      const totalContextChars = validBlocks.reduce(
        (sum, b) => sum + b.length,
        0,
      );
      const thinSiteBudget = createSerperBudget({ maxQueries: 2 });
      if (totalContextChars < 15_000 && serperKey) {
        try {
          const snippetBlocks = await discoverThinSiteSnippetBlocks(
            uniName,
            domain,
            serperKey,
            thinSiteBudget,
          );
          if (snippetBlocks.length > 0) {
            validBlocks = validBlocks.concat(snippetBlocks);
            console.log(
              `[DeepEnrichment] thin-site snippet fallback added ${snippetBlocks.length} blocks (total: ${validBlocks.length}).`,
            );
          } else {
            console.warn(
              `[DeepEnrichment] thin-site snippet fallback produced 0 blocks for ${uniName}`,
            );
          }
        } catch (e) {
          console.warn(
            `[DeepEnrichment] thin-site snippet fallback failed:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      // ─── Phase 2e: Anti-Ragging Committee Scraping ───────────────────────
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
        phoneContexts: [] as ContactWithContext[],
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
      const allEmailContexts: ContactWithContext[] = [];
      const allPhoneContexts: ContactWithContext[] = [...antiRaggingContacts.phoneContexts];
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

      console.log(
        `[DeepEnrichment] Context: ${rawContext.length} chars → capped at ${finalContext.length} chars (${validBlocks.length} sources).`,
      );

      // ─── Phase 4: Per-source stakeholder extraction + merge ─────────────────
      // Replaces the old 12× Flash + Pro two-phase pipeline.

      // ─── Cost ceiling guard ─────────────────────────────────────────────
      // Rough estimate: REAL Firecrawl credits * 100 + Gemini input tokens.
      // Abort if too high. Jina-fallback blocks are free and not counted.
      const firecrawlBasedBlocks = validBlocks.filter(
        (b) =>
          !b.includes("EXTERNAL SOURCE:") && !b.includes("FOLLOWUP SOURCE:"),
      );
      const firecrawlCreditsConsumed = firecrawlCreditsUsed;
      const estimatedGeminiTokens = Math.round(finalContext.length / 4);
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
          contextChars: finalContext.length,
          estimatedTokens: { flash: estimatedGeminiTokens, pro: 0 },
          llmUsage: summarizeLlmUsage(llmUsageEntries),
        };
      }

      let synthesizedJson: {
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

          // Inject government-data officers (NIRF PDFs etc.) as a synthetic
          // partial so the merge can reconcile them with website data.
          if (args.preDiscoveredOfficers && args.preDiscoveredOfficers.length > 0) {
            partials.push({
              source_url: "government_data",
              stakeholders: args.preDiscoveredOfficers.map((o) => ({
                name: o.name,
                role: o.role,
                source_url: "government_data",
                contact_confidence: 0.5,
              })),
              raw: "",
            });
            console.log(
              `[DeepEnrichment] Injected ${args.preDiscoveredOfficers.length} government-data officer candidate(s) into merge`,
            );
          }

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

          // Deterministic singleton-role enforcement: competing holders of the
          // same singleton role are reduced to the leaf-page/highest-confidence
          // record.
          const singletonResult = enforceSingletonRoles(
            synthesizedJson.stakeholders,
          );
          if (singletonResult.dropped.length > 0) {
            console.warn(
              `[DeepEnrichment] Singleton enforcement dropped ${singletonResult.dropped.length} duplicate holder(s) for ${uniName}`,
            );
          }
          synthesizedJson.stakeholders = singletonResult.kept;

          // Gap-fill still-missing singleton leadership roles (free passes
          // first, then ≤1 Serper query per role, max 3 roles).
          const gapFilled = await gapFillMissingRoles(
            synthesizedJson.stakeholders,
            validBlocks,
            {
              uniName,
              website: url,
              domain,
              apiKey,
              ctx,
              llmUsageEntries,
              serperKey,
            },
          );
          if (gapFilled.length > 0) {
            // Re-run singleton enforcement so a gap-fill match can never create
            // competing holders of the same singleton role.
            const finalSingleton = enforceSingletonRoles([
              ...synthesizedJson.stakeholders,
              ...gapFilled,
            ]);
            if (finalSingleton.dropped.length > 0) {
              console.warn(
                `[DeepEnrichment] Singleton enforcement (post gap-fill) dropped ${finalSingleton.dropped.length} duplicate holder(s) for ${uniName}`,
              );
            }
            synthesizedJson.stakeholders = finalSingleton.kept;
          }

          console.log(
            `[DeepEnrichment] Gemini latency: ${Date.now() - startMs}ms`,
          );

          // Redact PII: log only counts, never names/emails/phones
          const stCount = Array.isArray(synthesizedJson.stakeholders)
            ? synthesizedJson.stakeholders.length
            : 0;
          console.log(
            `[DeepEnrichment] Synthesized: ${stCount} stakeholders`,
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
      const stakeholders = synthesizedJson.stakeholders;

      // Sort by data richness so highest-quality stakeholders are upserted first
      interface StakeholderCandidate {
        name?: string;
        email?: string;
        phone?: string;
        phone_source?: string;
        linkedin_url?: string;
        linkedin_source?: string;
        role?: string;
        source_url?: string;
        sources?: string[];
        contact_confidence?: number;
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
        // Only use phones that matchPhonesToStakeholders explicitly tied to
        // this person's name+role. This stops the model's per-source phone
        // guesses (which often copy the main switchboard) from contaminating
        // individual records.
        if (stakeholder.name) {
          for (const [phone, matchedName] of phoneNameMatches) {
            if (
              matchedName.toLowerCase() === stakeholder.name.toLowerCase()
            ) {
              return [phone];
            }
          }
        }

        return [];
      }

      // Resolve conflicts for singleton senior roles (VC, Registrar, FO, etc.)
      // When multiple sources name different people for the same role, prefer
      // the dedicated leadership leaf page and the current officers table over
      // stale .html snapshots or committee/prospectus PDFs.
      function sourceSpecificityScore(
        st: StakeholderCandidate,
      ): number {
        const url = (st.source_url || "").toLowerCase();
        const canonicalRole = (normalizeStakeholderRole(st.role) || "").toLowerCase();
        let score = 0;

        if (canonicalRole && url.includes(canonicalRole.replace(/\s+/g, "-")))
          score += 20;
        if (canonicalRole && url.includes(canonicalRole.replace(/\s+/g, "")))
          score += 10;

        if (url.includes("officers-of") && !url.endsWith(".html")) score += 10;
        if (url.includes("officers-of") && url.endsWith(".html")) score += 2;

        if (/(\.pdf|committee|prospectus|finance.*committee)/.test(url))
          score -= 10;
        if (url.endsWith(".html")) score -= 3;
        if (url.includes("faculty") || url.includes("profile") || url.includes("bio"))
          score += 5;

        return score;
      }

      function resolveSingletonRoleConflicts(
        list: StakeholderCandidate[],
      ): StakeholderCandidate[] {
        const byRole = new Map<string, StakeholderCandidate[]>();
        const rest: StakeholderCandidate[] = [];
        for (const st of list) {
          const canonicalRole = normalizeStakeholderRole(st.role);
          if (canonicalRole && isSingletonRole(canonicalRole)) {
            const key = canonicalRole.toLowerCase();
            const arr = byRole.get(key) || [];
            arr.push(st);
            byRole.set(key, arr);
          } else {
            rest.push(st);
          }
        }

        const resolved: StakeholderCandidate[] = [];
        for (const group of byRole.values()) {
          if (group.length === 1) {
            resolved.push(group[0]);
            continue;
          }
          // Pick the record with the most specific/authoritative source.
          // Preserve the Offg. / Acting label from the chosen record.
          const scored = group.map((st) => ({
            st,
            score:
              sourceSpecificityScore(st) +
              (st.name?.toLowerCase().includes("offg") ||
              st.role?.toLowerCase().includes("offg") ||
              st.name?.toLowerCase().includes("acting") ||
              st.role?.toLowerCase().includes("acting")
                ? 3
                : 0),
          }));
          scored.sort((a, b) => b.score - a.score);
          resolved.push(scored[0].st);
        }

        return [...resolved, ...rest];
      }

      const resolvedStakeholders = resolveSingletonRoleConflicts(
        (stakeholders as StakeholderCandidate[]) || [],
      );

      const validStakeholders = (resolvedStakeholders || [])
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
          const resolvedPhone = fallbackPhones[0];
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
          if (cleaned.linkedin_url && cleaned.name && !linkedinMatchesName(cleaned.name, cleaned.linkedin_url)) {
            console.warn(
              `[DeepEnrichment] Stripping mismatched LinkedIn ${cleaned.linkedin_url} for ${cleaned.name}`,
            );
            cleaned.linkedin_url = undefined;
            cleaned.linkedin_source = "none";
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
        phone_source: st.phone_source || (st.phone ? "scraped" : "none"),
        linkedin_url: st.linkedin_url || undefined,
        linkedin_source: st.linkedin_source || (st.linkedin_url ? "scraped" : "none"),
        source_url: st.source_url || undefined,
        sources:
          st.sources ??
          (st.source_url ? [st.source_url] : undefined),
        email_source: st.email ? "scraped" : undefined,
        contact_confidence:
          typeof st.contact_confidence === "number"
            ? Math.max(0, Math.min(1, st.contact_confidence))
            : st.email || st.phone || st.linkedin_url
              ? 1.0
              : st.name && st.role
                ? 0.5
                : 0.0,
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
      const firecrawlCredits = firecrawlCreditsUsed; // real API calls
      const flashInputChars = finalContext.length;
      const estimatedFlashTokens = Math.round(flashInputChars / 4);
      console.log(
        `[DeepEnrichment] COST SUMMARY for ${uniName}:\n` +
          `  Firecrawl credits: ${firecrawlCredits} (map: ${firecrawlMapCount}, scrapes: ${firecrawlScrapeCount}) | Jina fallback blocks: ${firecrawlBasedBlocks.length}\n` +
          `  LLM exact tokens: in=${llmUsage.inputTokens.toLocaleString()} out=${llmUsage.outputTokens.toLocaleString()} total=${llmUsage.totalTokens.toLocaleString()}\n` +
          `  LLM exact cost: $${llmUsage.totalCostUsd.toFixed(6)} across ${llmUsage.calls} call(s)\n` +
          `  Estimated input tokens for context guard: ${estimatedFlashTokens.toLocaleString()}\n` +
          `  Context: ${finalContext.length.toLocaleString()} chars (raw: ${rawContext.length.toLocaleString()})`,
      );

      const serperUsedDeep = serperBudget.used + thinSiteBudget.used;

      // Scheduled-orchestration continuation: hand off to the post-deep
      // phases via the scheduler (each scheduled action gets its full runtime
      // budget, avoiding the tighter nested child-action cap).
      if (args.continuation && !dryRun) {
        await ctx.scheduler.runAfter(
          0,
          internal.actions.orchestrator.finishEnrichmentChainInternal,
          {
            universityId: args.universityId,
            queue: args.queue ?? [],
            serperUsedBefore: args.serperUsedBefore ?? 0,
            serperUsedDeep,
            firecrawlCreditsUsed: firecrawlCredits,
            deepSuccess: true,
            stakeholdersSynthesized: finalStakeholders.length,
          },
        );
        console.log(
          `[DeepEnrichment] Scheduled post-deep continuation for ${uniName}`,
        );
      }

      return {
        success: true,
        stakeholdersSynthesized: finalStakeholders.length,
        contextChars: finalContext.length,
        estimatedTokens: {
          flash: estimatedFlashTokens,
          pro: 0, // legacy field — we no longer use Pro
        },
        serperQueriesUsed: serperUsedDeep,
        firecrawlCreditsUsed: firecrawlCredits,
        llmUsage,
        stakeholders: dryRun ? finalStakeholders : undefined,
      };
    } catch (e) {
      console.error("[DeepEnrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      // Even on failure, continue the sequential batch.
      if (args.continuation && !args.dryRun) {
        try {
          await ctx.scheduler.runAfter(
            0,
            internal.actions.orchestrator.finishEnrichmentChainInternal,
            {
              universityId: args.universityId,
              queue: args.queue ?? [],
              serperUsedBefore: args.serperUsedBefore ?? 0,
              serperUsedDeep: 0,
              firecrawlCreditsUsed: 0,
              deepSuccess: false,
              stakeholdersSynthesized: 0,
            },
          );
        } catch (scheduleErr) {
          console.error(
            "[DeepEnrichment] Failed to schedule continuation:",
            scheduleErr,
          );
        }
      }
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
    let externalSources: ExternalSource[] = [];
    if (serperKey) {
      try {
        const domain = url
          .replace(/^https?:\/\//, "")
          .replace(/\/$/, "")
          .replace(/^www\./, "");
        externalSources = await discoverExternalSources(
          uniName,
          domain,
          serperKey as string,
          createSerperBudget({ maxQueries: 6 }),
          {
            city: university.city,
            state: university.state,
            websitePath: new URL(url).pathname,
          },
        );
        report.phases = {
          ...(report.phases as object),
          externalSearch: {
            success: true,
            urls: externalSources.map((s) => s.url),
          },
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
    for (const extUrl of externalSources.slice(0, 3).map((s) => s.url)) {
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
