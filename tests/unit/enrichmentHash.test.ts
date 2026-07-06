"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { createHash } from "crypto";

/**
 * Tests that hashString in enrichment uses SHA-256.
 * Mirrors the function from convex/actions/enrichment.ts.
 */

function hashString(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

describe("enrichment hashString (SHA-256)", () => {
  it("produces a 64-char hex string", () => {
    const hash = hashString("news synthesis content");
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash), "should be hex string");
  });

  it("is deterministic — same input produces same hash", () => {
    const text = "University of Delhi news signal";
    assert.strictEqual(hashString(text), hashString(text));
  });

  it("different inputs produce different hashes", () => {
    const h1 = hashString("signal A");
    const h2 = hashString("signal B");
    assert.notStrictEqual(h1, h2);
  });

  it("is collision-resistant — small change produces different hash", () => {
    const h1 = hashString("NIRF 2024 data");
    const h2 = hashString("NIRF 2024 data!");
    assert.notStrictEqual(h1, h2);
  });

  it("handles empty string", () => {
    const hash = hashString("");
    assert.strictEqual(hash.length, 64);
    // Known SHA-256 of empty string
    assert.strictEqual(
      hash,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("handles long text (news synthesis)", () => {
    const longText = "This is a long news synthesis about a university. ".repeat(50);
    const hash = hashString(longText);
    assert.strictEqual(hash.length, 64);
  });

  it("handles unicode text", () => {
    const hash = hashString("Indian Institute of Technology — Delhi");
    assert.strictEqual(hash.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(hash));
  });

  it("does NOT produce the old DJB2-style hash (which was a small integer)", () => {
    const hash = hashString("test content");
    // Old hash was String(h) where h was a 32-bit integer — max 10-11 chars
    assert.ok(hash.length > 11, "SHA-256 hash should be 64 chars, not a short integer");
  });
});
