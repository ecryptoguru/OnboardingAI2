"use node";

import * as Sentry from "@sentry/nextjs";


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
    retryOn?: (error: any) => boolean;
  } = {}
): Promise<T> {

  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    retryOn = (err: any) => {
      // Retry on 429 (Rate Limit) or 5xx (Server Error)
      const status = err?.status || err?.statusCode;
      if (status === 429 || (status >= 500 && status < 600)) return true;
      
      // Also retry on common network errors/timeouts
      const msg = String(err?.message || "").toLowerCase();
      return (
        msg.includes("timeout") || 
        msg.includes("fetch failed") || 
        msg.includes("network error") ||
        err?.code === 'UND_ERR_HEADERS_TIMEOUT'
      );
    },
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (i === maxRetries || !retryOn(error)) {
        throw error;
      }

      console.warn(`[Retry] Attempt ${i + 1} failed. Retrying in ${delay}ms...`, error.message);
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
 * Fetch with a mandatory timeout to prevent hanging actions.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}
