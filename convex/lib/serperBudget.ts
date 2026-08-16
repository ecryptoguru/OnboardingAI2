"use node";

export interface SerperBudgetConfig {
  maxQueries: number;
}

export interface SerperBudget {
  used: number;
  max: number;
  exhausted: boolean;
  reason?: string;
}

export interface SerperBudgetResult<T> {
  ok: boolean;
  value?: T;
  skipped?: boolean;
  reason?: string;
  quotaExhausted?: boolean;
}

function isSerperQuotaExhaustedMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not enough credits") ||
    lower.includes("quota") ||
    lower.includes("insufficient credits")
  );
}

export function createSerperBudget(
  config: SerperBudgetConfig = { maxQueries: 10 },
): SerperBudget {
  return {
    used: 0,
    // Allow maxQueries: 0 (a zero-Serper phase should spend nothing).
    max: Math.max(0, Math.floor(config.maxQueries)),
    exhausted: false,
  };
}

export function markSerperQuotaExhausted(
  budget: SerperBudget,
  reason = "serper_quota_exhausted",
): void {
  budget.exhausted = true;
  budget.reason = reason;
}

export async function runWithSerperBudget<T>(
  budget: SerperBudget,
  run: () => Promise<T>,
): Promise<SerperBudgetResult<T>> {
  if (budget.exhausted) {
    return {
      ok: false,
      skipped: true,
      reason: budget.reason || "serper_quota_exhausted",
      quotaExhausted: true,
    };
  }
  if (budget.used >= budget.max) {
    return {
      ok: false,
      skipped: true,
      reason: "serper_budget_exhausted",
      quotaExhausted: false,
    };
  }

  budget.used += 1;
  try {
    const value = await run();
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSerperQuotaExhaustedMessage(message)) {
      markSerperQuotaExhausted(budget);
      return {
        ok: false,
        reason: message,
        quotaExhausted: true,
      };
    }
    return {
      ok: false,
      reason: message,
      quotaExhausted: false,
    };
  }
}
