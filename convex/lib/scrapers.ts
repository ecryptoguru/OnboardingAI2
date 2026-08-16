"use node";

import { extractText, extractTextItems } from "unpdf";

import { normalizeIndianPhone, withRetry } from "./utils";
import { normalizeRoleText, normalizeStakeholderRole } from "./roleRegistry";
import { assertPublicTarget } from "./urlSafetyNode";

// ─── Firecrawl API Client ──────────────────────────────────────────────────
// Provides synchronous Map (sitemap discovery) and Scrape (single-page) calls.
// We use Firecrawl instead of Serper to eliminate search costs and domain-mismatch bugs.

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

export interface FirecrawlMapResult {
  success: boolean;
  links: { url: string; title?: string; description?: string }[];
  /** Number of HTTP attempts actually made (each attempt consumes a credit). */
  attempts?: number;
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  };
  /** Number of HTTP attempts actually made (each attempt consumes a credit). */
  attempts?: number;
}

function firecrawlRetryAfterMs(res: Response): number | null {
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!Number.isNaN(seconds)) return seconds * 1000;
  }
  const reset = res.headers.get("x-ratelimit-reset");
  if (reset) {
    const resetDate = new Date(reset).getTime();
    const wait = resetDate - Date.now() + 1000;
    if (wait > 0 && wait < 120_000) return wait;
  }
  return null;
}

/**
 * Firecrawl Map: Returns a domain sitemap in a single synchronous call.
 * Consumes 1 credit per request. Retries on 429 with server-provided backoff.
 */
export async function firecrawlMap(
  url: string,
  apiKey: string,
  limit = 5000,
  maxAttempts = 2,
  onAttempt?: (attempt: number) => void,
): Promise<FirecrawlMapResult> {
  let lastText = "";
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    onAttempt?.(attempt);
    const res = await fetch(`${FIRECRAWL_BASE}/map`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        search: "",
        sitemap: "include",
        includeSubdomains: true,
        ignoreQueryParameters: true,
        ignoreCache: false,
        limit,
        timeout: 60000,
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (res.ok) {
      const json = (await res.json()) as FirecrawlMapResult;
      json.attempts = attempts;
      return json;
    }

    lastText = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = firecrawlRetryAfterMs(res) ?? 1000 * 3 ** attempt;
      const bounded = Math.min(wait, 90_000);
      console.warn(`[Firecrawl] 429 on map; sleeping ${bounded}ms (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, bounded));
      continue;
    }
    if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
      const wait = 1000 * 3 ** attempt;
      console.warn(`[Firecrawl] ${res.status} on map; retrying in ${wait}ms (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    break;
  }

  throw new Error(`Firecrawl map failed after ${maxAttempts} attempts: ${lastText}`);
}

/**
 * Firecrawl Scrape: Returns clean Markdown from a single URL.
 * Consumes 1 credit per request. Retries on 429 with server-provided backoff.
 */
export async function firecrawlScrape(
  url: string,
  apiKey: string,
  maxAttempts = 4,
  onAttempt?: (attempt: number) => void,
): Promise<FirecrawlScrapeResult> {
  let lastText = "";
  let attempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    onAttempt?.(attempt);
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
      }),
      signal: AbortSignal.timeout(35000),
    });

    if (res.ok) {
      const json = (await res.json()) as FirecrawlScrapeResult;
      json.attempts = attempts;
      return json;
    }

    lastText = await res.text();
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = firecrawlRetryAfterMs(res) ?? 1000 * 3 ** attempt;
      const bounded = Math.min(wait, 90_000);
      console.warn(`[Firecrawl] 429 on scrape; sleeping ${bounded}ms (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, bounded));
      continue;
    }
    if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
      const wait = 1000 * 3 ** attempt;
      console.warn(`[Firecrawl] ${res.status} on scrape; retrying in ${wait}ms (attempt ${attempt})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    break;
  }

  throw new Error(`Firecrawl scrape failed after ${maxAttempts} attempts: ${lastText}`);
}

// ─── High-Yield URL Filters ────────────────────────────────────────────────
// Regex patterns used after `firecrawlMap()` to select the most promising
// subpages for stakeholder / demographic extraction.

export const HIGH_YIELD_PATTERNS = [
  /(?<![a-zA-Z])(contact|feedback|reach[\s-]?us|enquiry|support|help)(?![a-zA-Z])/i,
  /(?<![a-zA-Z])(admin|administration|governance|board|director|directors|executive|leadership|management|principal|registrar|vice[\s-]?chancellor|chancellor|dean|deans|head|coordinator|hod|officer|officers)(?![a-zA-Z])/i,
  /(?<![a-zA-Z])(anti[\s-]?ragging|statutory|committee|grievance|cell|welfare|student[\s-]?affairs)(?![a-zA-Z])/i,
  /(?<![a-zA-Z])(mandatory[\s-]?disclosure|iqac|naac|naac-ssr|aqar|audit|accreditation|ssr)(?![a-zA-Z])/i,
  /(?<![a-zA-Z])(about[\s-]?us|profile|overview|facts|figures|campus|at[\s-]?a[\s-]?glance)(?![a-zA-Z])/i,
  /(?<![a-zA-Z])(phone|telephone|mobile|fax|email)(?![a-zA-Z])/i,
] as const;

/**
 * Score and rank discovered URLs by how likely they are to contain contact info.
 * Uses both the URL slug and the page title / description from Firecrawl.
 * Returns URLs sorted by relevance (highest first).
 */
export function filterHighYieldUrls(
  mapResult: FirecrawlMapResult,
  maxUrls = 6,
): string[] {
  if (!mapResult.success || !Array.isArray(mapResult.links)) return [];

  const scored = mapResult.links
    .map((link) => {
      const url = link.url.toLowerCase();
      const title = (link.title || "").toLowerCase();
      const description = (link.description || "").toLowerCase();
      const combined = `${url} ${title} ${description}`;

      let score = 0;
      for (const pattern of HIGH_YIELD_PATTERNS) {
        if (pattern.test(url)) score += 1;
        if (pattern.test(title)) score += 2;
        if (pattern.test(description)) score += 1;
      }

      // Extra title signal is a strong indicator of an administration/people page
      if (/\b(administration|governance|leadership|officers?|deans?|director)\b/i.test(title)) {
        score += 3;
      }
      if (/\b(contact|phone|email|directory|telephone)\b/i.test(title)) {
        score += 3;
      }

      // NIRF / NAAC pages are good for demographics
      if (/\b(nirf|naac|iqac|ssr|mandatory disclosure|anti[-\s]?ragging)\b/i.test(combined)) {
        score += 2;
      }

      // Penalise generic news/event pages that sometimes have leadership in the URL
      if (/(news|events?|blogs?|press[-_]?release|tender|career|jobs?)/i.test(combined)) {
        score -= 3;
      }

      return { url: link.url, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxUrls)
    .map((item) => item.url);

  return scored;
}

// ─── PDF Document Patterns ───────────────────────────────────────────────
// Regex patterns used to identify AISHE / NAAC SSR / IQAC PDFs that often
// contain deep demographic data (hostelite counts, enrollment tables, etc.)

export const PDF_YIELD_PATTERNS = [
  /\.pdf$/i,
  /aishe/i,
  /naac.*ssr/i,
  /naac.*aqar/i,
  /mandatory.*disclosure/i,
  /iqac/i,
  /ssr.*report/i,
  /student.*strength/i,
  /hostel/i,
  /enrollment.*data/i,
  /criterion.*2\.1/i,
  /anti.*ragging/i,
  /statutory.*disclosure/i,
] as const;

/**
 * Filter discovered URLs to find AISHE/NAAC PDF documents.
 * Returns PDF URLs that match demographic-enrichment patterns.
 */
export function filterPdfUrls(
  mapResult: FirecrawlMapResult,
  maxUrls = 3,
): string[] {
  if (!mapResult.success || !Array.isArray(mapResult.links)) return [];

  const scored = mapResult.links
    .filter((link) => link.url.toLowerCase().endsWith(".pdf"))
    .map((link) => {
      const url = link.url.toLowerCase();
      let score = 0;
      for (const pattern of PDF_YIELD_PATTERNS) {
        if (pattern.test(url)) score += 1;
      }
      return { url: link.url, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxUrls)
    .map((item) => item.url);

  return scored;
}

/**
 * Download a PDF with retry and return its buffer.
 * Centralises fetch logic so extractPdfText + extractPdfTables can share one download.
 */
export async function downloadPdfBuffer(url: string): Promise<Buffer> {
  // SSRF guard: only fetch public http(s) targets (DNS rebinding defense).
  // Runs before the retry loop so unsafe URLs fail fast without retries.
  await assertPublicTarget(url);
  return withRetry(
    async () => {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    },
    { maxRetries: 2 },
  );
}

/**
 * Extract text from a PDF buffer using unpdf (serverless-safe PDF.js build,
 * no Web Worker / canvas requirements). Falls back to empty string on error.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    return (result.text || "").trim();
  } catch (e) {
    console.warn(
      `[PDF] Failed to extract text:`,
      e instanceof Error ? e.message : String(e),
    );
    return "";
  }
}

/**
 * Extract table-like data from a PDF buffer by grouping text items by line
 * and column position, then joining with ` | `. Falls back to empty string.
 */
export async function extractPdfTables(buffer: Buffer): Promise<string> {
  try {
    const { items } = await extractTextItems(new Uint8Array(buffer));
    const chunks: string[] = [];

    items.forEach((pageItems, pageIndex) => {
      // Group by vertical position (rounded to 2 decimals) to reconstruct rows
      const rows = new Map<number, { x: number; text: string }[]>();
      for (const it of pageItems) {
        const text = (it.str || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const y = Math.round(it.y * 100) / 100;
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y)!.push({ x: it.x, text });
      }

      const sortedRows = [...rows.entries()].sort(([a], [b]) => b - a);
      const tableRows = sortedRows
        .map(([, cells]) =>
          cells
            .sort((a, b) => a.x - b.x)
            .map((c) => c.text)
            .join(" | "),
        )
        .filter((row) => row.length > 0);

      if (tableRows.length > 1) {
        chunks.push(`=== PAGE ${pageIndex + 1} ===\n${tableRows.join("\n")}`);
      }
    });

    if (chunks.length === 0) return "";
    return `=== TABLES ===\n${chunks.join("\n\n")}\n=== END TABLES ===`;
  } catch (e) {
    console.warn(
      `[PDF] Failed to extract tables:`,
      e instanceof Error ? e.message : String(e),
    );
    return "";
  }
}

// ─── Local Regex Fallback Extractor ──────────────────────────────────────
// Zero-cost extraction of emails and Indian phone numbers from raw Markdown.
// Guarantees contacts are physically impossible to miss if they exist in the text.

export interface RegexExtractedContact {
  email?: string;
  phone?: string;
}

export interface RegexExtractionResult {
  emails: string[];
  phones: string[];
}

export interface ContactWithContext {
  value: string;
  context: string; // Surrounding text (±100 chars)
  position: number; // Character index of the contact within the context string
}

/**
 * Extract emails and Indian phone numbers from raw Markdown.
 * Returns two separate deduplicated lists — do NOT pair by index
 * because email #1 is not necessarily associated with phone #1.
 */
export function extractContactsFromMarkdown(
  markdown: string,
): RegexExtractionResult {
  // Decode common email obfuscation patterns (e.g. name[at]domain[dot]edu)
  const decoded = markdown
    .replace(/\[at\]/gi, "@")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".")
    .replace(/\(at\)/gi, "@");

  // Email regex (basic but effective for institutional emails)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Indian phone regex: matches mobiles and landlines with optional separators
  // Handles: +91-98765-43210, 09876543210, 9876543210, 011-1234-5678, 011-12345678
  const phoneRegex =
    /(?<!\d)(?:\+91[-\s]?[6-9]\d{4}[-\s]?\d{5}|0[6-9]\d{9}|[6-9]\d{9}|0\d{2,4}(?:[-\s]?\d{3,4}){2})(?!\d)/g;

  const emails = new Set(decoded.match(emailRegex) || []);
  const rawPhones = new Set(decoded.match(phoneRegex) || []);

  // Normalize Indian phone numbers and drop malformed long numeric strings.
  const validPhones = new Set<string>();
  for (const p of rawPhones) {
    const normalizedPhone = normalizeIndianPhone(p);
    if (normalizedPhone) {
      validPhones.add(normalizedPhone);
    }
  }

  return {
    emails: Array.from(emails),
    phones: Array.from(validPhones),
  };
}

/**
 * Extract contacts WITH surrounding context for proximity-based association.
 * Each contact includes ±200 characters of surrounding text so downstream
 * heuristics can match phones to nearby names.
 */
export function extractContactsWithContext(
  markdown: string,
): { emails: ContactWithContext[]; phones: ContactWithContext[] } {
  const decoded = markdown
    .replace(/\[at\]/gi, "@")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".")
    .replace(/\(at\)/gi, "@");

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex =
    /(?<!\d)(?:\+91[-\s]?[6-9]\d{4}[-\s]?\d{5}|0[6-9]\d{9}|[6-9]\d{9}|0\d{2,4}(?:[-\s]?\d{3,4}){2})(?!\d)/g;

  const emails: ContactWithContext[] = [];
  const phones: ContactWithContext[] = [];

  // Extract emails with context (±100 chars for tighter association)
  let match;
  const emailRegexClone = new RegExp(emailRegex.source, emailRegex.flags);
  while ((match = emailRegexClone.exec(decoded)) !== null) {
    const start = Math.max(0, match.index - 100);
    const end = Math.min(decoded.length, match.index + match[0].length + 100);
    const context = decoded.substring(start, end).toLowerCase();
    emails.push({
      value: match[0],
      context,
      position: match.index - start,
    });
  }

  // Extract phones with context (±100 chars for tighter association)
  const phoneRegexClone = new RegExp(phoneRegex.source, phoneRegex.flags);
  while ((match = phoneRegexClone.exec(decoded)) !== null) {
    const normalizedPhone = normalizeIndianPhone(match[0]);
    if (!normalizedPhone) continue;

    const start = Math.max(0, match.index - 100);
    const end = Math.min(decoded.length, match.index + match[0].length + 100);
    const context = decoded.substring(start, end).toLowerCase();
    phones.push({
      value: normalizedPhone,
      context,
      position: match.index - start,
    });
  }

  return { emails, phones };
}

function normalizeNameTokens(name?: string | null): string[] {
  if (!name) return [];
  const cleaned = name
    .toLowerCase()
    .replace(/\b(dr|prof|professor|mr|mrs|ms|shri|smt|er|engg|arch)\b/gi, "")
    .replace(/[.,]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(/\s+/).filter((p) => p.length > 0);
}

function buildNamePatterns(tokens: string[]): string[] {
  const patterns = new Set<string>();
  for (const token of tokens) {
    patterns.add(token);
    // Common initial variants: "K.S." → "k s" and "ks"
    const collapsed = token.replace(/[^a-z0-9]/g, "");
    if (collapsed && collapsed !== token) patterns.add(collapsed);
    if (token.length > 2) {
      patterns.add(`\\b${token}\\b`);
    }
  }
  // Whole name as a loose phrase (ignoring dots/initials)
  if (tokens.length > 1) {
    const phrase = tokens.map((t) => t.replace(/[^a-z0-9]/g, "")).join("\\s+");
    patterns.add(phrase);
  }
  return [...patterns];
}

/**
 * Match regex-extracted phones to named stakeholders using proximity heuristics.
 * Handles Indian name initials ("K. S. Singh" vs "KS Singh") and uses role
 * aliases when the name is missing or ambiguous.
 */
export function matchPhonesToStakeholders(
  phones: ContactWithContext[],
  stakeholders: Array<{ name?: string | null; role?: string | null }>,
): Map<string, string> {
  const matches = new Map<string, string>();
  if (phones.length === 0 || stakeholders.length === 0) return matches;

  // Prefer stakeholders with explicit, senior roles for tie-breaking
  const sorted = [...stakeholders].sort((a, b) => {
    const aHasName = a.name ? 1 : 0;
    const bHasName = b.name ? 1 : 0;
    if (aHasName !== bHasName) return bHasName - aHasName;
    return 0;
  });

  for (const st of sorted) {
    const nameTokens = normalizeNameTokens(st.name);
    const namePatterns = buildNamePatterns(nameTokens);
    const canonicalRole = normalizeStakeholderRole(st.role);
    const roleText = normalizeRoleText(st.role);
    const roleAliases = canonicalRole
      ? [canonicalRole.toLowerCase(), roleText]
      : [roleText];

    for (const phone of phones) {
      // Skip if this phone is already matched to a named person
      if (matches.has(phone.value)) continue;

      const ctx = phone.context;
      const phonePos =
        typeof phone.position === "number"
          ? phone.position
          : ctx.indexOf(phone.value.replace(/\D/g, ""));
      let score = 0;

      // Name proximity: count how many name tokens appear CLOSE to the phone.
      // Tokens that are on the same line or within a few words of the phone get
      // much more weight than tokens that merely appear somewhere in the block.
      if (namePatterns.length > 0) {
        for (const token of nameTokens) {
          if (token.length < 2) continue;
          const idx = ctx.indexOf(token);
          if (idx === -1) continue;
          const distance = Math.abs(idx - phonePos);
          if (distance <= 40) {
            score += 3;
          } else if (distance <= 80) {
            score += 1;
          }
        }
      }

      // Role proximity: canonical role or any alias must be close to the phone.
      if (roleText) {
        for (const alias of roleAliases) {
          if (!alias) continue;
          const idx = ctx.indexOf(alias);
          if (idx === -1) continue;
          const distance = Math.abs(idx - phonePos);
          if (distance <= 40) {
            score += 3;
            break;
          } else if (distance <= 80) {
            score += 1;
            break;
          }
        }
      }

      // Threshold: need a real name in the context AND either a strong name match
      // (surname/initials within 40 chars of the phone) or a name match plus role
      // context very close to the phone. This stops the last row of an officers
      // table from grabbing the footer phone that appears 100 chars below it.
      const hasName = nameTokens.length > 0;
      if (hasName && score >= 4) {
        const label = st.name || st.role || "unknown";
        matches.set(phone.value, label);
        break; // One phone per stakeholder pass
      }
    }
  }

  return matches;
}
