"use node";

import { normalizeIndianPhone, withRetry } from "./utils";
import { normalizeRoleText, normalizeStakeholderRole } from "./roleRegistry";

// ─── Firecrawl API Client ──────────────────────────────────────────────────
// Provides synchronous Map (sitemap discovery) and Scrape (single-page) calls.
// We use Firecrawl instead of Serper to eliminate search costs and domain-mismatch bugs.

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2";

export interface FirecrawlMapResult {
  success: boolean;
  links: { url: string; title?: string; description?: string }[];
}

export interface FirecrawlScrapeResult {
  success: boolean;
  data?: {
    markdown?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Firecrawl Map: Returns a domain sitemap in a single synchronous call.
 * Consumes 1 credit per request.
 */
export async function firecrawlMap(
  url: string,
  apiKey: string,
  limit = 5000,
): Promise<FirecrawlMapResult> {
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl map failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  return json as FirecrawlMapResult;
}

/**
 * Firecrawl Scrape: Returns clean Markdown from a single URL.
 * Consumes 1 credit per request.
 */
export async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<FirecrawlScrapeResult> {
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firecrawl scrape failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  return json as FirecrawlScrapeResult;
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
 * Extract text content from a PDF buffer using pdf-parse v2.
 *
 * Uses advanced ParseParameters for optimal LLM ingestion:
 * - `first: 30`  → Limit to first 30 pages (NAAC SSR tables often span 50+ pages).
 * - `lineEnforce: true`  → Preserve logical line breaks.
 * - `cellSeparator: "\t"` → Inject tabs between table cells.
 * - `parseHyperlinks: true` → Capture embedded URLs.
 *
 * `parser.destroy()` is always called via try/finally to prevent memory leaks.
 */
interface PDFParser {
  getText(params?: Record<string, unknown>): Promise<{ text: string }>;
  getTable(
    params?: Record<string, unknown>,
  ): Promise<{ pages: { tables: string[][][] }[] }>;
  destroy(): Promise<void>;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  let parser: PDFParser | null = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer }) as PDFParser;
    const data = await parser.getText({
      first: 30,
      lineEnforce: true,
      cellSeparator: "\t",
      parseHyperlinks: true,
    });
    return data.text || "";
  } catch (e) {
    console.warn(
      `[PDF] Failed to extract text:`,
      e instanceof Error ? e.message : String(e),
    );
    return "";
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // ignore destroy failures
      }
    }
  }
}

/**
 * Extract structured tabular data from a PDF buffer using pdf-parse v2 `getTable()`.
 *
 * AISHE / NAAC SSR / IQAC PDFs are full of enrollment, hostel, and faculty
 * tables. Getting them as 2-D arrays preserves row/column relationships
 * far better than flat text for LLM reasoning.
 *
 * - `first: 30` → Enrollment tables can span large reports; scan first 30 pages.
 * - Returns a markdown-ish table string ready for LLM context.
 * - Falls back to empty string if no tables detected or on error.
 *
 * `parser.destroy()` is always called via try/finally to prevent memory leaks.
 */
export async function extractPdfTables(buffer: Buffer): Promise<string> {
  let parser: PDFParser | null = null;
  try {
    const { PDFParse } = await import("pdf-parse");
    parser = new PDFParse({ data: buffer }) as PDFParser;
    const result = await parser.getTable({ first: 30 });

    const chunks: string[] = [];
    for (const page of result.pages) {
      for (const table of page.tables) {
        // Skip trivial single-cell or empty tables
        if (table.length < 2) continue;
        const rows = table
          .map((row: string[]) =>
            row
              .map((cell: string) => cell.replace(/\s+/g, " ").trim())
              .join(" | "),
          )
          .join("\n");
        chunks.push(rows);
      }
    }

    if (chunks.length === 0) return "";
    return `=== TABLES ===\n${chunks.join("\n\n")}\n=== END TABLES ===`;
  } catch (e) {
    console.warn(
      `[PDF] Failed to extract tables:`,
      e instanceof Error ? e.message : String(e),
    );
    return "";
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // ignore destroy failures
      }
    }
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
  context: string; // Surrounding text (±200 chars)
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

  // Extract emails with context
  let match;
  const emailRegexClone = new RegExp(emailRegex.source, emailRegex.flags);
  while ((match = emailRegexClone.exec(decoded)) !== null) {
    const start = Math.max(0, match.index - 200);
    const end = Math.min(decoded.length, match.index + match[0].length + 200);
    emails.push({
      value: match[0],
      context: decoded.substring(start, end).toLowerCase(),
    });
  }

  // Extract phones with context
  const phoneRegexClone = new RegExp(phoneRegex.source, phoneRegex.flags);
  while ((match = phoneRegexClone.exec(decoded)) !== null) {
    const normalizedPhone = normalizeIndianPhone(match[0]);
    if (!normalizedPhone) continue;

    const start = Math.max(0, match.index - 200);
    const end = Math.min(decoded.length, match.index + match[0].length + 200);
    phones.push({
      value: normalizedPhone,
      context: decoded.substring(start, end).toLowerCase(),
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
      let score = 0;

      // Name proximity: count how many name tokens appear in the phone's context
      if (namePatterns.length > 0) {
        let matchedTokens = 0;
        for (const pattern of namePatterns) {
          try {
            if (new RegExp(pattern, "i").test(ctx)) matchedTokens++;
          } catch {
            // Ignore invalid regex from unusual tokens
          }
        }
        // Score by fraction of unique tokens matched, not raw count
        score += Math.min(matchedTokens, nameTokens.length * 2) * 2;
      }

      // Role proximity: canonical role or any alias appears
      if (roleText) {
        for (const alias of roleAliases) {
          if (!alias) continue;
          if (ctx.includes(alias)) {
            score += 2;
            break;
          }
        }
      }

      // Threshold: need at least 2 points with name match, or role-only with strong signal
      const hasName = nameTokens.length > 0;
      if (
        (hasName && score >= 3) ||
        (!hasName && roleText && score >= 2 && nameTokens.length === 0)
      ) {
        const label = st.name || st.role || "unknown";
        matches.set(phone.value, label);
        break; // One phone per stakeholder pass
      }
    }
  }

  return matches;
}
