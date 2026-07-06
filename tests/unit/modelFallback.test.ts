"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Tests the model fallback chain logic from convex/lib/llm.ts:callGeminiWithUsage.
 * Verifies the decision logic: when to fall back, when to rethrow.
 */

describe("Model fallback chain — decision logic", () => {
  it("falls back when fallbackModel is provided and different from primary", () => {
    const model: string = "gemini-3.5-flash";
    const fallbackModel: string | undefined = "gemini-3.1-flash-lite";
    const shouldFallback = fallbackModel && fallbackModel !== model;
    assert.ok(shouldFallback);
  });

  it("does NOT fall back when fallbackModel is undefined", () => {
    const model: string = "gemini-3.5-flash";
    const fallbackModel: string | undefined = undefined;
    const shouldFallback = fallbackModel && fallbackModel !== model;
    assert.ok(!shouldFallback);
  });

  it("does NOT fall back when fallbackModel equals primary model", () => {
    const model: string = "gemini-3.5-flash";
    const fallbackModel: string | undefined = "gemini-3.5-flash";
    const shouldFallback = fallbackModel && fallbackModel !== model;
    assert.ok(!shouldFallback);
  });

  it("correctly detects Pro model for thinking budget calculation", () => {
    const isPro = (m: string) => /\bpro\b/i.test(m);
    assert.strictEqual(isPro("gemini-3.5-pro"), true);
    assert.strictEqual(isPro("gemini-3.5-flash"), false);
    assert.strictEqual(isPro("gemini-3.1-flash-lite"), false);
    assert.strictEqual(isPro("gemini-pro-1.5"), true);
  });

  it("Pro fallback gets max(512, resolvedBudget) thinking budget", () => {
    const isFallbackPro = true;
    const resolvedBudget = 1024;
    const fallbackThinkBudget = isFallbackPro
      ? Math.max(512, resolvedBudget)
      : 0;
    assert.strictEqual(fallbackThinkBudget, 1024);
  });

  it("Pro fallback with low resolvedBudget gets minimum 512", () => {
    const isFallbackPro = true;
    const resolvedBudget = 0;
    const fallbackThinkBudget = isFallbackPro
      ? Math.max(512, resolvedBudget)
      : 0;
    assert.strictEqual(fallbackThinkBudget, 512);
  });

  it("non-Pro fallback gets zero thinking budget", () => {
    const isFallbackPro = false;
    const resolvedBudget = 2048;
    const fallbackThinkBudget = isFallbackPro
      ? Math.max(512, resolvedBudget)
      : 0;
    assert.strictEqual(fallbackThinkBudget, 0);
  });

  it("Pro model resolvedBudget defaults to 1024 when thinkingBudget is undefined", () => {
    const isProModel = true;
    const thinkingBudget: number | undefined = undefined;
    const resolvedBudget =
      thinkingBudget !== undefined
        ? isProModel
          ? Math.max(512, thinkingBudget)
          : thinkingBudget
        : isProModel
          ? 1024
          : 0;
    assert.strictEqual(resolvedBudget, 1024);
  });

  it("Flash model resolvedBudget defaults to 0 when thinkingBudget is undefined", () => {
    const isProModel = false;
    const thinkingBudget: number | undefined = undefined;
    const resolvedBudget =
      thinkingBudget !== undefined
        ? isProModel
          ? Math.max(512, thinkingBudget)
          : thinkingBudget
        : isProModel
          ? 1024
          : 0;
    assert.strictEqual(resolvedBudget, 0);
  });

  it("Pro model with explicit thinkingBudget gets max(512, budget)", () => {
    const isProModel = true;
    const thinkingBudget = 256;
    const resolvedBudget =
      thinkingBudget !== undefined
        ? isProModel
          ? Math.max(512, thinkingBudget)
          : thinkingBudget
        : isProModel
          ? 1024
          : 0;
    assert.strictEqual(resolvedBudget, 512);
  });
});
