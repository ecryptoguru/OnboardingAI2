"use node";

import * as Sentry from "@sentry/nextjs";

/**
 * Strip adversarial / prompt-injection patterns from any text before it reaches an LLM.
 * This is defense-in-depth: responseSchema is the primary guard, but raw user content
 * (email replies, scraped web pages) can carry injection payloads.
 */
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
      return (
        status === 429 ||
        (typeof status === "number" && status >= 500 && status < 600)
      );
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
