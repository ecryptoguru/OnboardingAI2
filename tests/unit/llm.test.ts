"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createLlmUsageEntry,
  summarizeLlmUsage,
} from "../../convex/lib/llm";

describe("createLlmUsageEntry", () => {
  it("uses API usage metadata when present", () => {
    const usage = createLlmUsageEntry({
      label: "test",
      model: "gemini-3.1-flash-lite",
      response: {
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 250,
          totalTokenCount: 1250,
        },
      },
      fallbackInputTokens: 1,
      fallbackOutputTokens: 1,
    });

    assert.strictEqual(usage.inputTokens, 1000);
    assert.strictEqual(usage.outputTokens, 250);
    assert.strictEqual(usage.totalTokens, 1250);
    assert.strictEqual(usage.tokenSource, "api_usage");
    assert.strictEqual(usage.totalCostUsd, 0.000625);
  });

  it("bills thinking tokens at the output rate for 3.x models", () => {
    const usage = createLlmUsageEntry({
      label: "test",
      model: "gemini-3.7-flash",
      response: {
        usageMetadata: {
          promptTokenCount: 1000,
          candidatesTokenCount: 200,
          thoughtsTokenCount: 500,
          totalTokenCount: 1700,
        },
      },
      fallbackInputTokens: 1,
      fallbackOutputTokens: 1,
    });

    assert.strictEqual(usage.inputTokens, 1000);
    assert.strictEqual(usage.outputTokens, 200);
    assert.strictEqual(usage.thoughtsTokenCount, 500);
    assert.strictEqual(usage.totalTokens, 1700);
    // billed output = 200 candidates + 500 thoughts = 700 @ $3.75/M
    assert.strictEqual(usage.outputCostUsd, 0.002625);
    // input 1000 @ $0.75/M
    assert.strictEqual(usage.inputCostUsd, 0.00075);
    assert.strictEqual(usage.totalCostUsd, 0.003375);
  });

  it("falls back to estimated token counts when metadata is absent", () => {
    const usage = createLlmUsageEntry({
      label: "test",
      model: "gemini-3.5-flash",
      fallbackInputTokens: 400,
      fallbackOutputTokens: 100,
    });

    assert.strictEqual(usage.inputTokens, 400);
    assert.strictEqual(usage.outputTokens, 100);
    assert.strictEqual(usage.totalTokens, 500);
    assert.strictEqual(usage.tokenSource, "estimated");
    assert.strictEqual(usage.totalCostUsd, 0.0015);
  });
});

describe("summarizeLlmUsage", () => {
  it("aggregates token and USD totals across calls", () => {
    const summary = summarizeLlmUsage([
      createLlmUsageEntry({
        label: "a",
        model: "gemini-3.1-flash-lite",
        response: {
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
      }),
      createLlmUsageEntry({
        label: "b",
        model: "gemini-3.1-flash-lite",
        response: {
          usageMetadata: {
            promptTokenCount: 200,
            candidatesTokenCount: 80,
            totalTokenCount: 280,
          },
        },
      }),
    ]);

    assert.strictEqual(summary.calls, 2);
    assert.strictEqual(summary.inputTokens, 300);
    assert.strictEqual(summary.outputTokens, 130);
    assert.strictEqual(summary.totalTokens, 430);
    assert.strictEqual(summary.totalCostUsd, 0.00027);
  });
});
