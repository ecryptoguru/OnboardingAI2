"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { raceWithTimeout } from "../../convex/lib/async";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../../convex/lib/serperBudget";

describe("raceWithTimeout", () => {
  it("returns completed when the promise settles before timeout", async () => {
    const result = await raceWithTimeout(Promise.resolve("ok"), 50);
    assert.deepStrictEqual(result, {
      status: "completed",
      value: "ok",
    });
  });

  it("returns failed when the promise rejects before timeout", async () => {
    const result = await raceWithTimeout(
      Promise.reject(new Error("boom")),
      50,
    );
    assert.deepStrictEqual(result, {
      status: "failed",
      error: "boom",
    });
  });

  it("returns timed_out when the promise does not settle in time", async () => {
    const result = await raceWithTimeout(
      new Promise((resolve) => setTimeout(() => resolve("late"), 30)),
      5,
    );
    assert.deepStrictEqual(result, { status: "timed_out" });
  });
});

describe("serper budget", () => {
  it("enforces a hard query cap", async () => {
    const budget = createSerperBudget({ maxQueries: 2 });
    const r1 = await runWithSerperBudget(budget, async () => "ok1");
    const r2 = await runWithSerperBudget(budget, async () => "ok2");
    const r3 = await runWithSerperBudget(budget, async () => "ok3");

    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r2.ok, true);
    assert.strictEqual(r3.ok, false);
    assert.strictEqual(r3.skipped, true);
    assert.strictEqual(r3.reason, "serper_budget_exhausted");
    assert.strictEqual(budget.used, 2);
  });

  it("marks quota exhaustion and short-circuits subsequent calls", async () => {
    const budget = createSerperBudget({ maxQueries: 10 });
    const quotaErr = await runWithSerperBudget(budget, async () => {
      throw new Error("Serper failed: 400 {\"message\":\"Not enough credits\"}");
    });
    const blocked = await runWithSerperBudget(budget, async () => "should_not_run");

    assert.strictEqual(quotaErr.ok, false);
    assert.strictEqual(quotaErr.quotaExhausted, true);
    assert.strictEqual(blocked.ok, false);
    assert.strictEqual(blocked.skipped, true);
    assert.strictEqual(blocked.quotaExhausted, true);
  });
});
