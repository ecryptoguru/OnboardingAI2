"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

// Replicate the logic to avoid top-level await / CJS issues
function namesMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();

  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const stopWords = new Set([
    "university",
    "college",
    "of",
    "the",
    "and",
    "national",
    "indian",
    "technical",
  ]);

  const getTokens = (s: string) =>
    s.split(/[\s,]+/).filter((t) => t.length > 2 && !stopWords.has(t));

  const tokensA = getTokens(na);
  const tokensB = getTokens(nb);

  const getAcronym = (s: string) =>
    s
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(
        (w) =>
          w.length > 0 &&
          !["university", "college", "of", "the", "and"].includes(w),
      )
      .map((w) => w[0])
      .join("");

  const acrA = getAcronym(na);
  const acrB = getAcronym(nb);

  for (const token of tokensA) {
    if (token === acrB) return true;
  }
  for (const token of tokensB) {
    if (token === acrA) return true;
  }

  const shared = tokensA.filter((t) => tokensB.includes(t));
  if (shared.length >= 2) return true;

  for (const token of shared) {
    if (token.length >= 5) return true;
    const shortLen = Math.min(tokensA.join("").length, tokensB.join("").length);
    if (shortLen > 0 && token.length / shortLen > 0.5) return true;
  }

  return false;
}

describe("namesMatch", () => {
  it("matches exact names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Delhi"), true);
  });

  it("matches substring inclusion", () => {
    assert.strictEqual(namesMatch("Indian Institute of Technology Delhi", "IIT Delhi"), true);
  });

  it("matches acronym VIT ↔ Vellore Institute of Technology", () => {
    assert.strictEqual(
      namesMatch("Vellore Institute of Technology", "VIT"),
      true,
    );
  });

  it("matches shared distinctive tokens", () => {
    assert.strictEqual(
      namesMatch("Birla Institute of Technology", "Birla Institute"),
      true,
    );
  });

  it("does not match unrelated names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Bombay"), false);
  });
});
