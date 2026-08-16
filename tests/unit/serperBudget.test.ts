import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../../convex/lib/serperBudget";

test("zero-max Serper budget spends nothing", async () => {
  const budget = createSerperBudget({ maxQueries: 0 });
  let ran = 0;
  const result = await runWithSerperBudget(budget, async () => {
    ran += 1;
    return "x";
  });

  assert.equal(result.ok, false);
  assert.equal(result.skipped, true);
  assert.equal(ran, 0);
  assert.equal(budget.used, 0);
});

test("budget allows exactly max queries then skips", async () => {
  const budget = createSerperBudget({ maxQueries: 2 });

  const a = await runWithSerperBudget(budget, async () => 1);
  const b = await runWithSerperBudget(budget, async () => 2);
  const c = await runWithSerperBudget(budget, async () => 3);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(c.ok, false);
  assert.equal(c.skipped, true);
  assert.equal(budget.used, 2);
});
