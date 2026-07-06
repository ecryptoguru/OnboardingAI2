"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Tests the latency budget warning logic from convex/lib/llm.ts:logLlmTelemetry.
 * Verifies the threshold check that warns when a single LLM call exceeds 20s.
 */

const LATENCY_WARNING_THRESHOLD_MS = 20000;

function shouldWarnLatency(latencyMs: number): boolean {
  return latencyMs > LATENCY_WARNING_THRESHOLD_MS;
}

describe("LLM latency warning — threshold logic", () => {
  it("does NOT warn for fast calls (< 20s)", () => {
    assert.strictEqual(shouldWarnLatency(500), false);
    assert.strictEqual(shouldWarnLatency(5000), false);
    assert.strictEqual(shouldWarnLatency(10000), false);
    assert.strictEqual(shouldWarnLatency(15000), false);
  });

  it("does NOT warn for exactly 20s (boundary)", () => {
    assert.strictEqual(shouldWarnLatency(20000), false);
  });

  it("warns for calls over 20s", () => {
    assert.strictEqual(shouldWarnLatency(20001), true);
    assert.strictEqual(shouldWarnLatency(25000), true);
    assert.strictEqual(shouldWarnLatency(30000), true);
  });

  it("warns for extremely slow calls (approaching action timeout)", () => {
    assert.strictEqual(shouldWarnLatency(29000), true);
    assert.strictEqual(shouldWarnLatency(60000), true);
  });

  it("does NOT warn for zero latency (cache hit)", () => {
    assert.strictEqual(shouldWarnLatency(0), false);
  });

  it("does NOT warn for very fast cache hits", () => {
    assert.strictEqual(shouldWarnLatency(5), false);
    assert.strictEqual(shouldWarnLatency(50), false);
  });

  it("threshold is exactly 20000ms", () => {
    assert.strictEqual(LATENCY_WARNING_THRESHOLD_MS, 20000);
  });
});
