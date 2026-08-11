"use node";

import * as Sentry from "@sentry/node";
import {
  isValidIndianPhone as isValidIndianPhoneShared,
  normalizeIndianPhone as normalizeIndianPhoneShared,
} from "./phone";
import { getOptionalBoolean } from "./env";

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

function getRateLimitResetDelay(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const resetMatch = msg.match(/resets at ([^\s,]+ [^\s,]+(?:\s[+-]\d{4})?)/i);
  if (!resetMatch) return null;
  const resetTs = new Date(resetMatch[1]);
  if (Number.isNaN(resetTs.getTime())) return null;
  const waitMs = resetTs.getTime() - Date.now() + 1000; // 1s buffer
  if (waitMs <= 0 || waitMs > 120_000) return null;
  return waitMs;
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
      const status =
        (err as Record<string, unknown>)?.status ||
        (err as Record<string, unknown>)?.statusCode;

      // Structured status codes are the single source of truth when present.
      if (typeof status === "number") {
        if (status === 429 || (status >= 500 && status < 600)) return true;
        if (status === 400 || status === 401 || status === 403 || status === 404)
          return false;
        // For other codes (e.g. 408) fall through to message analysis.
      }

      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();

      // Do NOT retry on safety/policy blocks or quota/credit exhaustion
      if (
        msgLower.includes("halted") ||
        msgLower.includes("blockreason") ||
        msgLower.includes("safety")
      ) {
        return false;
      }
      if (
        msgLower.includes("not enough credits") ||
        msgLower.includes("insufficient credits") ||
        msgLower.includes("quota") ||
        msgLower.includes("billing")
      ) {
        return false;
      }

      // Only regex-scan messages when there is NO structured status.
      if (typeof status !== "number") {
        const httpCodeMatch = msgLower.match(/\b(429|500|502|503|504)\b/);
        if (httpCodeMatch) return true;
        if (/\b(400|401|403|404)\b/.test(msgLower)) return false;
      }

      // Look for typical transient/network/timeout indicators
      const transientKeywords = [
        "timeout",
        "etimedout",
        "fetch failed",
        "network error",
        "socket hang up",
        "econnrefused",
        "econnreset",
        "abort",
        "aborted",
      ];
      return transientKeywords.some((keyword) => msgLower.includes(keyword));
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

      const rateLimitDelay = getRateLimitResetDelay(error);
      const waitMs = rateLimitDelay ?? delay;
      console.warn(
        `[Retry] Attempt ${i + 1} failed. Retrying in ${waitMs}ms...`,
        error instanceof Error ? error.message : String(error),
      );
      if (!getOptionalBoolean("SKIP_RATE_LIMITS")) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
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
export function validateRange(
  value: number,
  min: number,
  max: number,
  label = "Value",
): number {
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

export function normalizeIndianPhone(phone: string): string | null {
  return normalizeIndianPhoneShared(phone);
}

/**
 * Validate Indian phone numbers.
 * Accepts: +91XXXXXXXXXX, +91-XXXX-XXXXXX, 0XXXXXXXXXX, XXXXXXXXXX (10-digit mobile)
 * Also accepts landlines with STD code.
 */
export function isValidIndianPhone(phone: string): boolean {
  return isValidIndianPhoneShared(phone);
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
    const trimmed = val.trim();
    if (trimmed === "") return undefined;

    // Fast path: plain numeric strings
    const noComma = trimmed.replace(/,/g, "");
    if (/^-?\d+(\.\d+)?$/.test(noComma)) {
      normalized = noComma;
    } else {
      // Recovery path: extract first numeric token from mixed strings
      // e.g. "25,000 students", "Male: 12,345", "Hostelites=8765"
      const token = trimmed.match(/-?\d[\d,]*(?:\.\d+)?/)?.[0];
      if (!token) return undefined;
      normalized = token.replace(/,/g, "");
    }
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

export interface ParsedDemographics {
  total_students?: number;
  total_students_male?: number;
  total_students_female?: number;
  hostelites?: number;
  hostelites_male?: number;
  hostelites_female?: number;
  day_scholars?: number;
  day_scholars_male?: number;
  day_scholars_female?: number;
}

const MAX_PLAUSIBLE_STUDENT_COUNT = 2_000_000; // Upper bound for any demographic count

function isPlausibleStudentCount(n?: number): n is number {
  return typeof n === "number" && n > 0 && n <= MAX_PLAUSIBLE_STUDENT_COUNT;
}

/**
 * Parse common demographics fields from mixed/tabular text.
 * This is a deterministic fallback for cases where LLM extraction returns nulls.
 */
export function extractDemographicsFromText(text: string): ParsedDemographics {
  const out: ParsedDemographics = {};
  const compactText = text.replace(/\s+/g, " ");

  function assignGenderSplit(
    label: "hostelites" | "day_scholars",
    maleValue?: number,
    femaleValue?: number,
  ) {
    const safeMale = isPlausibleStudentCount(maleValue) ? maleValue : undefined;
    const safeFemale = isPlausibleStudentCount(femaleValue) ? femaleValue : undefined;
    if (safeMale && safeMale > 50) {
      out[`${label}_male` as "hostelites_male" | "day_scholars_male"] =
        safeMale;
    }
    if (safeFemale && safeFemale > 50) {
      out[`${label}_female` as "hostelites_female" | "day_scholars_female"] =
        safeFemale;
    }
    if (safeMale && safeFemale) {
      const derivedTotal = safeMale + safeFemale;
      if (
        !out[label] ||
        typeof out[label] !== "number" ||
        out[label]! < derivedTotal
      ) {
        out[label] = derivedTotal;
      }
    }
  }

  const maleFemalePair = text.match(
    /male[^0-9]{0,25}([\d,]+)[^a-zA-Z0-9]{0,30}female[^0-9]{0,25}([\d,]+)/i,
  );
  const male = maleFemalePair ? toNum(maleFemalePair[1]) : undefined;
  const female = maleFemalePair ? toNum(maleFemalePair[2]) : undefined;
  if (isPlausibleStudentCount(male) && male > 100) out.total_students_male = male;
  if (isPlausibleStudentCount(female) && female > 100) out.total_students_female = female;

  const totalMatch = text.match(
    /(total\s+(?:students|enrol+ed|enrollment|student\s+strength)|overall\s+students?)[^0-9]{0,25}([\d,]+)/i,
  );
  const total = totalMatch ? toNum(totalMatch[2]) : undefined;
  if (isPlausibleStudentCount(total) && total > 500) out.total_students = total;

  const hostelMatch = text.match(
    /(hostel(?:ite|er)?s?|hostellers?|hostel\s+strength|residential\s+students?)[^0-9]{0,25}([\d,]+)/i,
  );
  const hostel = hostelMatch ? toNumStrict(hostelMatch[2]) : undefined;
  if (isPlausibleStudentCount(hostel) && hostel > 100) out.hostelites = hostel;

  const dayMatch = text.match(
    /(day[\s-]*scholars?|non[\s-]*residential)[^0-9]{0,25}([\d,]+)/i,
  );
  const day = dayMatch ? toNumStrict(dayMatch[2]) : undefined;
  if (isPlausibleStudentCount(day) && day > 100) out.day_scholars = day;

  const hostelSplitMatch = compactText.match(
    /(hostel(?:ite|er)?s?|hostellers?|residential students?)[^0-9]{0,40}(?:male|boys)[^0-9]{0,20}([\d,]+)[^a-zA-Z0-9]{0,30}(?:female|girls)[^0-9]{0,20}([\d,]+)/i,
  );
  assignGenderSplit(
    "hostelites",
    hostelSplitMatch ? toNumStrict(hostelSplitMatch[2]) : undefined,
    hostelSplitMatch ? toNumStrict(hostelSplitMatch[3]) : undefined,
  );

  const dayScholarSplitMatch = compactText.match(
    /(day[\s-]*scholars?|non[\s-]*residential(?: students?)?)[^0-9]{0,40}male[^0-9]{0,20}([\d,]+)[^a-zA-Z0-9]{0,30}female[^0-9]{0,20}([\d,]+)/i,
  );
  assignGenderSplit(
    "day_scholars",
    dayScholarSplitMatch ? toNumStrict(dayScholarSplitMatch[2]) : undefined,
    dayScholarSplitMatch ? toNumStrict(dayScholarSplitMatch[3]) : undefined,
  );

  return out;
}

/**
 * Lightweight runtime validator for parsed LLM JSON output.
 * Throws a descriptive error instead of letting malformed data propagate.
 */
/**
 * Lightweight safety filter for LLM-generated output before persistence or email.
 * Strips injection artifacts, unexpected contact info, and placeholder text.
 */
export function sanitizeLlmOutput(text: string): string {
  let cleaned = text;

  // Strip any remaining injection artifacts
  cleaned = sanitizeLlmInput(cleaned);

  // Remove common LLM placeholder markers
  cleaned = cleaned.replace(/\[Name\]/gi, "").replace(/\[University\]/gi, "").replace(/\[Role\]/gi, "");

  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  return cleaned;
}

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
