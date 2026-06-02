"use node";

import * as Sentry from "@sentry/nextjs";

/**
 * Strip adversarial / prompt-injection patterns from any text before it reaches an LLM.
 * This is defense-in-depth: responseSchema is the primary guard, but raw user content
 * (email replies, scraped web pages) can carry injection payloads.
 */
/**
 * Truncate text at a newline boundary to avoid slicing through data structures.
 */
export function truncateAtNewline(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.substring(0, maxChars);
  const lastNewline = sliced.lastIndexOf("\n");
  if (lastNewline > maxChars * 0.9) {
    return sliced.substring(0, lastNewline) + "\n\n[…truncated]";
  }
  return sliced + "[…truncated]";
}

export function sanitizeLlmInput(text: string): string {
  let cleaned = text;

  // Repeated adversarial patterns (flood / obfuscation attempts)
  const adversarialPatterns = [
    // Core instruction override (English + Unicode homoglyphs)
    /(?:disregard|ignore|forget|override|disrеgard|ignοre|fοrget)\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|context)/gi,
    // Persona hijacking
    /(?:you are now|act as|pretend to be|roleplay as|new persona|yοu are nοw|act аs)/gi,
    // Delimiter breakers that try to end the user's context block
    /<{2,}|\|>{2,}|\[\/\s*(?:user|input|human|system)\s*\]/gi,
    // Base64 hinting (common exfiltration vector)
    /(?:encode|convert|output|respond)\s+(?:in|as|to)\s+base64/gi,
    // Repetition flood (same word >6 times in a row — injection obfuscation)
    /\b(\w+)\b(?:\s+\1\b){6,}/gi,
  ];

  for (const pattern of adversarialPatterns) {
    cleaned = cleaned.replace(pattern, "[FILTERED]");
  }

  // Strip active HTML / script / iframe tags entirely
  cleaned = cleaned
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>.*?<\/embed>/gi, "");

  // Null bytes, control chars, and directional override characters
  cleaned = cleaned
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/[\u202A-\u202E]/g, ""); // BiDi override characters

  return cleaned;
}

/**
 * Compute cosine similarity between two embedding vectors (range: -1 to 1).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Utility for exponential backoff retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
    retryOn?: (error: unknown) => boolean;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    retryOn = (err: unknown) => {
      // Retry on 429 (Rate Limit) or 5xx (Server Error)
      const status =
        (err as Record<string, unknown>)?.status ||
        (err as Record<string, unknown>)?.statusCode;
      if (
        status === 429 ||
        (typeof status === "number" && status >= 500 && status < 600)
      ) {
        return true;
      }

      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();

      // Do NOT retry on explicit non-transient status codes
      if (/\b(400|401|403|404)\b/.test(msgLower)) {
        return false;
      }

      // Do NOT retry on safety/policy blocks
      if (msgLower.includes("halted") || msgLower.includes("blockreason") || msgLower.includes("safety")) {
        return false;
      }

      // Look for explicit transient HTTP status codes inside message strings
      const httpCodeMatch = msgLower.match(/\b(429|500|502|503|504)\b/);
      if (httpCodeMatch) return true;

      // Look for typical transient/network/timeout indicators
      const transientKeywords = [
        "timeout",
        "etimedout",
        "fetch failed",
        "network error",
        "socket hang up",
        "econnrefused",
        "econnreset",
      ];
      return transientKeywords.some(keyword => msgLower.includes(keyword));
    },
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (i === maxRetries || !retryOn(error)) {
        throw error;
      }

      console.warn(
        `[Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`,
        error instanceof Error ? error.message : String(error),
      );
      if (process.env.SKIP_RATE_LIMITS !== "true") {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      delay = Math.min(delay * factor, maxDelay);
    }
  }

  if (lastError) {
    Sentry.captureException(lastError);
  }
  throw lastError;
}

/**
 * Validate that a number lies within a specified range.
 */
export function validateRange(value: number, min: number, max: number, label = "Value"): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}, got ${value}`);
  }
  return value;
}

/**
 * Run an array of async tasks with a concurrency limit.
 * Prevents firing unlimited parallel HTTP requests (e.g. 20+ Serper calls).
 */
export async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  if (tasks.length === 0) {
    return [];
  }

  const results: T[] = new Array(tasks.length);

  return new Promise((resolve, reject) => {
    let running = 0;
    let completed = 0;
    let index = 0;

    function runNext() {
      if (index >= tasks.length) {
        if (running === 0) resolve(results);
        return;
      }

      const i = index++;
      running++;

      tasks[i]()
        .then((value) => {
          results[i] = value;
          running--;
          completed++;
          if (completed === tasks.length) {
            resolve(results);
          } else {
            runNext();
          }
        })
        .catch((err) => {
          reject(err);
        });
    }

    for (let i = 0; i < Math.min(limit, tasks.length); i++) {
      runNext();
    }
  });
}

/**
 * Lightweight email validation for scraped data before DB insertion.
 */
export function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

/**
 * Validate Indian phone numbers.
 * Accepts: +91XXXXXXXXXX, +91-XXXX-XXXXXX, 0XXXXXXXXXX, XXXXXXXXXX (10-digit mobile)
 * Also accepts landlines with STD code.
 */
export function isValidIndianPhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const digits = phone.replace(/\D/g, "");
  // +91XXXXXXXXXX (12 digits starting with 91)
  if (digits.length === 12 && digits.startsWith("91")) {
    return /^[6-9]/.test(digits.slice(2));
  }
  // 0XXXXXXXXXX (11 digits starting with 0) — mobile with trunk prefix
  if (digits.length === 11 && digits.startsWith("0")) {
    return /^[6-9]/.test(digits.slice(1));
  }
  // XXXXXXXXXX (10 digits) — standard mobile
  if (digits.length === 10) {
    return /^[6-9]/.test(digits);
  }
  // Landline: 0 + 2-4 digit STD + 6-8 digit number
  if (digits.length >= 8 && digits.length <= 11 && digits.startsWith("0")) {
    return true;
  }
  return false;
}

/**
 * Convert an LLM-extracted value to a number, handling comma-formatted strings.
 * Returns undefined for null/undefined/NaN. Strips commas and whitespace from strings
 * — NIRF/AISHE reports often format numbers as "25,000" which Number() cannot parse.
 */
export function toNum(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  let normalized = val;
  if (typeof val === "string") {
    normalized = val.replace(/,/g, "").trim();
    if (normalized === "") return undefined;
  }
  const n = Number(normalized);
  return isNaN(n) ? undefined : n;
}

/**
 * Same as toNum but also rejects 0 — useful for fields like hostelites or day_scholars
 * that are NEVER legitimately 0 for large universities (LLMs frequently return 0
 * for unfound fields instead of null despite instructions).
 */
export function toNumStrict(val: unknown): number | undefined {
  const n = toNum(val);
  return n === 0 ? undefined : n;
}

/**
 * Lightweight runtime validator for parsed LLM JSON output.
 * Throws a descriptive error instead of letting malformed data propagate.
 */
export function validateJsonOutput<T extends Record<string, unknown>>(
  parsed: unknown,
  requiredFields: (keyof T)[],
  label = "LLM output",
): T {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not a valid object`);
  }
  const obj = parsed as T;
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(`${label} missing required field: ${String(field)}`);
    }
  }
  return obj;
}
