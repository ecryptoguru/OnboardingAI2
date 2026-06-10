export type TimeoutRaceResult<T> =
  | { status: "completed"; value: T }
  | { status: "timed_out" }
  | { status: "failed"; error: string };

/**
 * Races a promise against a timer. Returns a structured result so callers can
 * distinguish completion, failure, and timeout without unhandled rejections.
 *
 * ⚠️ CRITICAL: This helper does **not** cancel the underlying promise.
 * The promise keeps running even after the timer fires. You must therefore
 * NEVER wrap a Convex `ctx.runAction(...)` call with this helper.
 * If the parent action returns while the sub-action is still in-flight, Convex
 * reports an "outstanding action call" warning and downstream work can silently
 * continue, producing misleading timeout/status results.
 *
 * Safe uses: local timers, in-memory computations, and tests.
 * Unsafe uses: any Convex action or mutation invocation.
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<TimeoutRaceResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrappedPromise = promise
    .then(
      (value) => ({ status: "completed", value }) as const,
      (error) =>
        ({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        }) as const,
    );

  try {
    const result = await Promise.race([
      wrappedPromise,
      new Promise<TimeoutRaceResult<T>>((resolve) => {
        timer = setTimeout(() => resolve({ status: "timed_out" }), timeoutMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
