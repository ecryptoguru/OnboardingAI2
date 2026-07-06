"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of timingSafeEqual from convex/http.ts
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    assert.strictEqual(timingSafeEqual("secret-token", "secret-token"), true);
  });

  it("returns false for different strings of same length", () => {
    assert.strictEqual(timingSafeEqual("secret-token", "secret-tokem"), false);
  });

  it("returns false for different strings of different lengths", () => {
    assert.strictEqual(timingSafeEqual("short", "much-longer-string"), false);
  });

  it("returns true for empty strings", () => {
    assert.strictEqual(timingSafeEqual("", ""), true);
  });

  it("returns false when one is empty and other is not", () => {
    assert.strictEqual(timingSafeEqual("", "a"), false);
    assert.strictEqual(timingSafeEqual("a", ""), false);
  });

  it("returns true for strings with special characters", () => {
    const token = "Bearer abc-123_xyz!@#";
    assert.strictEqual(timingSafeEqual(token, token), true);
  });

  it("is case-sensitive", () => {
    assert.strictEqual(timingSafeEqual("Token", "token"), false);
  });

  it("returns false for single-char mismatch", () => {
    assert.strictEqual(timingSafeEqual("a", "b"), false);
  });

  it("returns true for single-char match", () => {
    assert.strictEqual(timingSafeEqual("a", "a"), true);
  });

  it("handles unicode strings correctly", () => {
    const token = "sëcret-töken";
    assert.strictEqual(timingSafeEqual(token, token), true);
    assert.strictEqual(timingSafeEqual(token, "secret-token"), false);
  });
});
