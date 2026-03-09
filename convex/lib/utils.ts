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
      return status === 429 || (status >= 500 && status < 600);
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
