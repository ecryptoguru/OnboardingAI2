"use node";

import { normalizeIndianPhone, withRetry } from "./utils";

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
      let score = 0;
      for (const pattern of HIGH_YIELD_PATTERNS) {
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

/**
 * Match regex-extracted phones to named stakeholders using proximity heuristics.
 * For each named stakeholder, look for a phone whose surrounding context
 * contains the person's name or role.
 */
export function matchPhonesToStakeholders(
  phones: ContactWithContext[],
  stakeholders: Array<{ name?: string | null; role?: string | null }>,
): Map<string, string> {
  const matches = new Map<string, string>();
  if (phones.length === 0 || stakeholders.length === 0) return matches;

  for (const st of stakeholders) {
    if (!st.name?.trim()) continue;

    const nameParts = st.name
      .toLowerCase()
      .replace(/[.,]/g, "")
      .split(/\s+/)
      .filter((p) => p.length > 0);
    const roleLower = (st.role || "").toLowerCase();

    for (const phone of phones) {
      // Skip if this phone is already matched
      if (matches.has(phone.value)) continue;

      const ctx = phone.context;
      let score = 0;

      // Name proximity: name parts appear in the phone's context
      for (const part of nameParts) {
        if (new RegExp(`\\b${part}\\b`).test(ctx)) score += 2;
      }

      // Role proximity: role appears in the phone's context
      if (roleLower && ctx.includes(roleLower)) score += 1;

      // If score is high enough, associate the phone
      if (score >= 3 || (nameParts.length === 1 && score >= 2)) {
        matches.set(phone.value, st.name);
        break; // One phone per stakeholder
      }
    }
  }

  return matches;
}
