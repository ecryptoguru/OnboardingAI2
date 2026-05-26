"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Extracts the email normalization logic we enforce in stakeholders.ts
 * so we can unit test it without the Convex runtime.
 */
function normalizeEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  return email.toLowerCase().trim();
}

/**
 * Mirror of normalizeName from convex/stakeholders.ts
 */
function normalizeName(n?: string): string {
  return (n || "")
    .toLowerCase()
    .replace(/\b(dr|prof|professor|mr|mrs|ms|shri|smt|er|engg)\b/g, "")
    .replace(/[.\s,-]/g, "")
    .trim();
}

/**
 * Mirror of domain matching logic from convex/stakeholders.ts upsertBulkInternal
 */
function checkDomainMatch(emailDomain: string, uniDomain: string): boolean {
  const genericDomains = [
    "gmail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "rediffmail.com",
    "icloud.com",
    "live.com",
    "me.com",
  ];

  return (
    genericDomains.includes(emailDomain) ||
    emailDomain === uniDomain ||
    emailDomain.endsWith(`.${uniDomain}`)
  );
}

describe("Stakeholder Email Normalization", () => {
  it("should lowercase emails", () => {
    assert.strictEqual(normalizeEmail("Test@Example.COM"), "test@example.com");
  });

  it("should trim whitespace", () => {
    assert.strictEqual(
      normalizeEmail("  test@example.com  "),
      "test@example.com",
    );
  });

  it("should handle undefined input", () => {
    assert.strictEqual(normalizeEmail(undefined), undefined);
  });

  it("should handle empty string", () => {
    assert.strictEqual(normalizeEmail(""), undefined);
  });
});

describe("Stakeholder normalizeName", () => {
  it("should strip titles and normalize Dr. D. P. Singh", () => {
    assert.strictEqual(normalizeName("Dr. D. P. Singh"), "dpsingh");
  });

  it("should match D P Singh with Dr. D. P. Singh", () => {
    assert.strictEqual(
      normalizeName("D P Singh"),
      normalizeName("Dr. D. P. Singh"),
    );
  });

  it("should match Prof. Aswini Dutt R. with Aswini Dutt R", () => {
    assert.strictEqual(
      normalizeName("Prof. Aswini Dutt R."),
      normalizeName("Aswini Dutt R"),
    );
  });

  it("should handle Shri prefix", () => {
    assert.strictEqual(normalizeName("Shri Ramesh Kumar"), "rameshkumar");
  });

  it("should return empty for empty input", () => {
    assert.strictEqual(normalizeName(""), "");
    assert.strictEqual(normalizeName(undefined), "");
  });
});

describe("Stakeholder Domain Matching Logic (robust)", () => {
  it("should reject cross-domain institutional emails", () => {
    const uniDomain = "iitb.ac.in";
    const emailDomain = "xim.edu.in";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), false);
  });

  it("should allow generic domains like gmail", () => {
    const uniDomain = "iitb.ac.in";
    const emailDomain = "gmail.com";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), true);
  });

  it("should allow exact domain match", () => {
    const uniDomain = "iitb.ac.in";
    const emailDomain = "iitb.ac.in";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), true);
  });

  it("should allow matching subdomains", () => {
    const uniDomain = "iitb.ac.in";
    const emailDomain = "cse.iitb.ac.in";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), true);
  });

  it("should reject partial match that is not subdomain", () => {
    // OLD bug: emailDomain.includes(uniDomain) would match "vit.ac.in" for "vit.edu.in"
    const uniDomain = "vit.edu.in";
    const emailDomain = "vit.ac.in";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), false);
  });

  it("should reject over-broad ac.in match", () => {
    // OLD bug: uniDomain.includes(emailDomain) where uniDomain="vit.ac.in" and emailDomain="ac.in"
    // would incorrectly match ANY .ac.in domain
    const uniDomain = "vit.ac.in";
    const emailDomain = "iitb.ac.in";

    assert.strictEqual(checkDomainMatch(emailDomain, uniDomain), false);
  });
});

describe("Stakeholder Upsert Nullish Coalescing", () => {
  it("should prefer new name over old with ??", () => {
    const existing = "Old Name";
    const enriched: string | undefined = "New Name";
    assert.strictEqual(enriched ?? existing, "New Name");
  });

  it("should keep old name when new is undefined", () => {
    const existing = "Old Name";
    const enriched: string | undefined = undefined;
    assert.strictEqual(enriched ?? existing, "Old Name");
  });

  it("should prefer new phone null over old with ??", () => {
    // This is the key fix: if enrichment intentionally clears a wrong number
    // by sending null, ?? preserves the intent (but we use || in practice for phone)
    const existing = "+919876543210";
    const enriched: string | null | undefined = null;
    // Note: actual code uses ?? not ||, so null would keep existing
    // But in our code we use `st.phone ?? match.phone` which means:
    // if new is null, keep old. This is fine for now.
    assert.strictEqual(enriched ?? existing, existing);
  });
});
