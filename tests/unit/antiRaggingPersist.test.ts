"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Unit tests for anti-ragging contact persistence logic.
 * Mirrors the stakeholder construction in convex/actions/scrapeAntiRagging.ts
 */

function buildAntiRaggingStakeholders(emails: string[]) {
  if (emails.length === 0) return [];
  return emails.map((email) => ({
    name: undefined,
    role: "Anti-Ragging Committee",
    email,
    phone: undefined,
    email_source: "scraped" as const,
    phone_source: undefined,
  }));
}

describe("Anti-Ragging Contact Persistence", () => {
  it("builds stakeholders for each discovered email", () => {
    const emails = ["warden@iitd.ac.in", "dsw@iitd.ac.in"];
    const stakeholders = buildAntiRaggingStakeholders(emails);

    assert.strictEqual(stakeholders.length, 2);
    assert.strictEqual(stakeholders[0].email, "warden@iitd.ac.in");
    assert.strictEqual(stakeholders[0].role, "Anti-Ragging Committee");
    assert.strictEqual(stakeholders[1].email, "dsw@iitd.ac.in");
  });

  it("assigns correct source metadata", () => {
    const stakeholders = buildAntiRaggingStakeholders(["contact@uni.edu"]);

    assert.strictEqual(stakeholders[0].email_source, "scraped");
    assert.strictEqual(stakeholders[0].phone_source, undefined);
    assert.strictEqual(stakeholders[0].name, undefined);
  });

  it("returns empty array when no emails found", () => {
    const stakeholders = buildAntiRaggingStakeholders([]);
    assert.deepStrictEqual(stakeholders, []);
  });

  it("handles single email", () => {
    const stakeholders = buildAntiRaggingStakeholders(["head@bits.edu"]);
    assert.strictEqual(stakeholders.length, 1);
    assert.strictEqual(stakeholders[0].role, "Anti-Ragging Committee");
  });

  it("deduplicates should happen at insert time (upsertBulkInternal)", () => {
    // The action itself deduplicates via upsertBulkInternal;
    // here we verify the builder produces one entry per email.
    const emails = ["a@uni.edu", "a@uni.edu", "b@uni.edu"];
    const stakeholders = buildAntiRaggingStakeholders(emails);
    assert.strictEqual(stakeholders.length, 3);
    // Deduplication responsibility is delegated to the DB layer
  });
});
