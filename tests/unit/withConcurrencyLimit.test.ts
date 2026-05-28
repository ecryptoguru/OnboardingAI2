"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

describe("withConcurrencyLimit", () => {
  it("runs all tasks and returns results in order", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 2);
    const results = await withConcurrencyLimit(tasks, 2);
    assert.deepStrictEqual(results, [2, 4, 6, 8, 10]);
  });

  it("respects the concurrency limit", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      running++;
      if (running > maxRunning) maxRunning = running;
      await new Promise((r) => setTimeout(r, 10));
      running--;
      return "ok";
    });

    await withConcurrencyLimit(tasks, 3);
    assert.strictEqual(maxRunning, 3);
  });

  it("rejects immediately on first failure", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    const tasks = [
      async () => "ok",
      async () => {
        throw new Error("boom");
      },
      async () => "ok",
    ];

    await assert.rejects(
      async () => withConcurrencyLimit(tasks, 2),
      /boom/,
    );
  });

  it("handles an empty task array", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    const results = await withConcurrencyLimit<string>([], 5);
    assert.deepStrictEqual(results, []);
  });

  it("handles limit greater than task count", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    const tasks = [1, 2].map((n) => async () => n);
    const results = await withConcurrencyLimit(tasks, 10);
    assert.deepStrictEqual(results, [1, 2]);
  });

  it("handles limit of 1 (sequential execution)", async () => {
    const { withConcurrencyLimit } = await import("../../convex/lib/utils.js");
    let lastEnd = 0;
    const tasks = [1, 2, 3].map((n) => async () => {
      const start = Date.now();
      if (lastEnd > 0) {
        assert.ok(start >= lastEnd, "Tasks should not overlap with limit 1");
      }
      await new Promise((r) => setTimeout(r, 5));
      lastEnd = Date.now();
      return n;
    });

    const results = await withConcurrencyLimit(tasks, 1);
    assert.deepStrictEqual(results, [1, 2, 3]);
  });
});
