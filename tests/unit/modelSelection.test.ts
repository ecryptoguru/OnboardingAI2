"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  defaultThinkingLevelForModel,
  isGemini3Model,
  THINKING_LEVEL,
} from "../../convex/lib/llm";

describe("isGemini3Model", () => {
  it("returns true for gemini-3.5-flash (thinking model, non-lite)", () => {
    assert.strictEqual(isGemini3Model("gemini-3.5-flash"), true);
  });

  it("returns true for gemini-3.6-flash and gemini-3.7-flash", () => {
    assert.strictEqual(isGemini3Model("gemini-3.6-flash"), true);
    assert.strictEqual(isGemini3Model("gemini-3.7-flash"), true);
  });

  it("returns true for future 3.x versions", () => {
    assert.strictEqual(isGemini3Model("gemini-3.8-flash"), true);
  });

  it("returns false for flash-lite models (legacy behavior)", () => {
    assert.strictEqual(isGemini3Model("gemini-3.5-flash-lite"), false);
    assert.strictEqual(isGemini3Model("gemini-3.1-flash-lite"), false);
  });

  it("returns false for non-3.x models and edge names", () => {
    assert.strictEqual(isGemini3Model("gemini-2.5-flash"), false);
    assert.strictEqual(isGemini3Model("gemini-3.5-live-translate-preview"), false);
    assert.strictEqual(isGemini3Model("gemini-embedding-001"), false);
  });
});

describe("defaultThinkingLevelForModel", () => {
  it("returns LOW for gemini-3.7-flash (MINIMAL is rejected by the API)", () => {
    assert.strictEqual(
      defaultThinkingLevelForModel("gemini-3.7-flash"),
      THINKING_LEVEL.low,
    );
  });

  it("returns LOW for gemini-3.6-flash and gemini-3.5-flash", () => {
    assert.strictEqual(
      defaultThinkingLevelForModel("gemini-3.6-flash"),
      THINKING_LEVEL.low,
    );
    assert.strictEqual(
      defaultThinkingLevelForModel("gemini-3.5-flash"),
      THINKING_LEVEL.low,
    );
  });

  it("returns undefined for flash-lite models (no thinking config)", () => {
    assert.strictEqual(
      defaultThinkingLevelForModel("gemini-3.5-flash-lite"),
      undefined,
    );
    assert.strictEqual(
      defaultThinkingLevelForModel("gemini-3.1-flash-lite"),
      undefined,
    );
  });
});
