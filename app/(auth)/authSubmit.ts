/**
 * Shared helpers for the auth forms (sign-in / sign-up).
 */

export type AuthFlow = "signIn" | "signUp";

const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Run a promise but reject with a friendly timeout error if it doesn't
 * settle in time. This prevents the submit button from staying disabled
 * forever when the Convex action hangs (e.g. flaky network).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Request timed out. Check your internet connection and try again.",
        ),
      );
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Map an error thrown by `useAuthActions().signIn` to a user-facing message.
 *
 * Convex masks plain backend errors as "Server Error" on the client, so for
 * those cases we keep the message generic instead of claiming the email or
 * password is wrong. If the backend throws a `ConvexError`, its `data` field
 * is available and may carry a more specific message.
 */
export function getAuthErrorMessage(err: unknown, flow: AuthFlow): string {
  const withData = err as { data?: unknown };
  const data = withData?.data;
  const raw =
    data !== undefined
      ? typeof data === "string"
        ? data
        : JSON.stringify(data)
      : (err as Error | undefined)?.message ?? "";
  const message = String(raw);

  if (message.includes("Server Error") || message.includes("[CONVEX")) {
    return flow === "signIn"
      ? "Could not sign in. Please check your email and password and try again."
      : "Could not create your account. It may already be registered — try signing in, or use a different email.";
  }
  if (flow === "signUp") {
    if (/already exists|already registered/i.test(message)) {
      return "An account with this email already exists. Please sign in instead.";
    }
    if (/password/i.test(message)) {
      return "Password must be at least 8 characters.";
    }
  }
  if (message) return message;
  return flow === "signIn"
    ? "Invalid email or password."
    : "Could not create your account. Try a different email.";
}
