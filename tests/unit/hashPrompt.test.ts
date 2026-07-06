"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { createHash } from "crypto";

/**
 * Mirror of hashPrompt from convex/lib/llm.ts
 * Uses SHA-256 instead of the old simple hash.
 */
function hashPrompt(inputs: string[]): string {
  const text = inputs.join("\n");
  return createHash("sha256").update(text).digest("hex");
}

describe("hashPrompt (SHA-256)", () => {
  it("produces a 64-char hex string", () => {
    const hash = hashPrompt(["gemini-3.5-flash", "0.7", "system", "user"]);
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), "should be hex string");
  });

  it("is deterministic — same inputs produce same hash", () => {
    const inputs = ["gemini-3.5-flash", "0.7", "system prompt", "user prompt"];
    assert.strictEqual(hashPrompt(inputs), hashPrompt(inputs));
  });

  it("different inputs produce different hashes", () => {
    const h1 = hashPrompt(["model-a", "0.7", "sys", "usr"]);
    const h2 = hashPrompt(["model-b", "0.7", "sys", "usr"]);
    assert.notStrictEqual(h1, h2);
  });

  it("order of inputs matters", () => {
    const h1 = hashPrompt(["a", "b", "c"]);
    const h2 = hashPrompt(["c", "b", "a"]);
    assert.notStrictEqual(h1, h2);
  });

  it("is collision-resistant — small change produces different hash", () => {
    const h1 = hashPrompt(["gemini-3.5-flash", "Hello World"]);
    const h2 = hashPrompt(["gemini-3.5-flash", "Hello world"]);
    assert.notStrictEqual(h1, h2);
  });

  it("handles empty inputs", () => {
    const hash = hashPrompt([]);
    assert.strictEqual(hash.length, 64);
  });

  it("handles single input", () => {
    const hash = hashPrompt(["only-input"]);
    assert.strictEqual(hash.length, 64);
  });

  it("matches known SHA-256 of empty string", () => {
    const hash = hashPrompt([]);
    const expected = createHash("sha256").update("").digest("hex");
    assert.strictEqual(hash, expected);
  });

  it("matches known SHA-256 of joined string", () => {
    const inputs = ["a", "b", "c"];
    const hash = hashPrompt(inputs);
    const expected = createHash("sha256").update("a\nb\nc").digest("hex");
    assert.strictEqual(hash, expected);
  });
});
