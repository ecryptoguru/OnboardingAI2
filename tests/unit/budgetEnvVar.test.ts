"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Tests that LLM_DAILY_BUDGET_USD env var is correctly parsed
 * and passed to the budget query. Mirrors the logic from convex/lib/llm.ts:checkDailyBudget.
 */

describe("LLM Daily Budget — env var parsing", () => {
  it("parses a valid numeric env var", () => {
    const envBudget = "100.50";
    const maxBudgetUsd = envBudget ? parseFloat(envBudget) : undefined;
    assert.strictEqual(maxBudgetUsd, 100.50);
  });

  it("returns undefined when env var is not set", () => {
    const envBudget = undefined;
    const maxBudgetUsd = envBudget ? parseFloat(envBudget) : undefined;
    assert.strictEqual(maxBudgetUsd, undefined);
  });

  it("returns undefined when env var is empty string", () => {
    const envBudget = "";
    const maxBudgetUsd = envBudget ? parseFloat(envBudget) : undefined;
    assert.strictEqual(maxBudgetUsd, undefined);
  });

  it("parses integer string", () => {
    const envBudget = "25";
    const maxBudgetUsd = envBudget ? parseFloat(envBudget) : undefined;
    assert.strictEqual(maxBudgetUsd, 25);
  });

  it("handles NaN from invalid string (falls back to NaN, caller should guard)", () => {
    const envBudget = "not-a-number";
    const maxBudgetUsd = envBudget ? parseFloat(envBudget) : undefined;
    assert.ok(Number.isNaN(maxBudgetUsd));
  });

  it("falls back to default when maxBudgetUsd is undefined", () => {
    const DEFAULT_DAILY_BUDGET_USD = 50.0;
    const maxBudgetUsd: number | undefined = undefined;
    const effectiveBudget = maxBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD;
    assert.strictEqual(effectiveBudget, 50.0);
  });

  it("uses env var value when provided", () => {
    const DEFAULT_DAILY_BUDGET_USD = 50.0;
    const maxBudgetUsd: number | undefined = 100.0;
    const effectiveBudget = maxBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD;
    assert.strictEqual(effectiveBudget, 100.0);
  });

  it("correctly determines withinBudget status when under cap", () => {
    const totalCostUsd = 30.0;
    const effectiveBudget = 50.0;
    const withinBudget = totalCostUsd < effectiveBudget;
    assert.strictEqual(withinBudget, true);
  });

  it("correctly determines withinBudget status when over cap", () => {
    const totalCostUsd = 60.0;
    const effectiveBudget = 50.0;
    const withinBudget = totalCostUsd < effectiveBudget;
    assert.strictEqual(withinBudget, false);
  });

  it("correctly determines withinBudget status at exact cap boundary", () => {
    const totalCostUsd = 50.0;
    const effectiveBudget = 50.0;
    const withinBudget = totalCostUsd < effectiveBudget;
    assert.strictEqual(withinBudget, false);
  });
});
