"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { getNextSendAt, CADENCE, DAYS_TO_MS } from "../../convex/lib/cadence";

describe("Cadence Configuration", () => {
  it("should define correct day-to-ms constants", () => {
    assert.strictEqual(DAYS_TO_MS, 86_400_000);
    assert.strictEqual(CADENCE.STEP_1_TO_2, 4 * DAYS_TO_MS);
    assert.strictEqual(CADENCE.STEP_2_TO_3, 7 * DAYS_TO_MS);
    assert.strictEqual(CADENCE.STEP_3_TO_4, 10 * DAYS_TO_MS);
  });

  it("getNextSendAt should return ~4 days after step 1", () => {
    const before = Date.now();
    const result = getNextSendAt(1);
    const after = Date.now();
    assert.ok(result !== null);
    assert.ok(result! >= before + CADENCE.STEP_1_TO_2);
    assert.ok(result! <= after + CADENCE.STEP_1_TO_2 + 1000);
  });

  it("getNextSendAt should return ~7 days after step 2", () => {
    const before = Date.now();
    const result = getNextSendAt(2);
    const after = Date.now();
    assert.ok(result !== null);
    assert.ok(result! >= before + CADENCE.STEP_2_TO_3);
    assert.ok(result! <= after + CADENCE.STEP_2_TO_3 + 1000);
  });

  it("getNextSendAt should return ~10 days after step 3", () => {
    const before = Date.now();
    const result = getNextSendAt(3);
    const after = Date.now();
    assert.ok(result !== null);
    assert.ok(result! >= before + CADENCE.STEP_3_TO_4);
    assert.ok(result! <= after + CADENCE.STEP_3_TO_4 + 1000);
  });

  it("getNextSendAt should return null for step 4 (end of sequence)", () => {
    const result = getNextSendAt(4);
    assert.strictEqual(result, null);
  });

  it("getNextSendAt should return null for unknown steps", () => {
    assert.strictEqual(getNextSendAt(99), null);
    assert.strictEqual(getNextSendAt(0), null);
    assert.strictEqual(getNextSendAt(-1), null);
  });
});
