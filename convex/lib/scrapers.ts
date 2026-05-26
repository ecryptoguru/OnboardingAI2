"use node";

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
      sitemap: true,
      includeSubdomains: true,
      ignoreQueryParameters: true,
      ignoreCache: false,
      limit,
      timeout: 60000,
    }),
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
  /(contact|feedback|reach[\s-]?us|enquiry|support|help)/i,
  /(admin|administration|governance|board|director|executive|leadership|management|principal|registrar|vice[\s-]?chancellor|chancellor|dean|head|coordinator|hod)/i,
  /(anti[\s-]?ragging|statutory|committee|grievance|cell|welfare|student[\s-]?affairs)/i,
  /(mandatory[\s-]?disclosure|iqac|naac|naac-ssr|aqar|audit|accreditation|ssr)/i,
  /(about[\s-]?us|profile|overview|facts|figures|campus|at[\s-]?a[\s-]?glance)/i,
  /(phone|telephone|mobile|fax|email)/i,
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

/**
 * Extract emails and Indian phone numbers from raw Markdown.
 * Returns two separate deduplicated lists — do NOT pair by index
 * because email #1 is not necessarily associated with phone #1.
 */
export function extractContactsFromMarkdown(
  markdown: string,
): RegexExtractionResult {
  // Email regex (basic but effective for institutional emails)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  // Indian phone regex: matches mobiles and landlines with optional separators
  // Handles: +91-98765-43210, 09876543210, 9876543210, 011-1234-5678, 011-12345678
  const phoneRegex = /(?:\+91[-\s]?|0[-\s]?)?\d(?:[\d\s-]){8,12}/g;

  const emails = new Set(markdown.match(emailRegex) || []);
  const rawPhones = new Set(markdown.match(phoneRegex) || []);

  // Normalize Indian phone numbers: keep any valid 10+ digit number
  const validPhones = new Set<string>();
  for (const p of rawPhones) {
    const digits = p.replace(/\D/g, "");
    if (digits.length >= 10) {
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        // Standard 10-digit mobile
        validPhones.add(`+91${digits}`);
      } else if (
        digits.length === 11 &&
        digits.startsWith("0") &&
        /^[6-9]/.test(digits.slice(1))
      ) {
        // 0-prefixed mobile: 09876543210 → +919876543210
        validPhones.add(`+91${digits.slice(1)}`);
      } else if (digits.length === 11 && digits.startsWith("0")) {
        // Landline with STD code: 01112345678 → +91-11-12345678
        validPhones.add(`+91-${digits.slice(1, 3)}-${digits.slice(3)}`);
      } else if (digits.startsWith("91") && digits.length === 12) {
        // Already has country code
        validPhones.add(`+${digits}`);
      } else if (digits.length > 10) {
        // Other multi-digit numbers (international, PBX, etc.)
        validPhones.add(`+${digits}`);
      }
      // Skip 10-digit numbers not starting with 6-9 (false positives)
    }
  }

  return {
    emails: Array.from(emails),
    phones: Array.from(validPhones),
  };
}
