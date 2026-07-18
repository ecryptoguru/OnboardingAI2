import * as Sentry from "@sentry/nextjs";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const dsn = process.env.SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        tracesSampleRate: 1.0,
        debug: false,
      });
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (dsn) {
      Sentry.init({
        dsn,
        tracesSampleRate: 1.0,
        debug: false,
      });
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
