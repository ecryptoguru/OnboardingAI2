"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Unit test for the checkEmailExists query logic in convex/auth.ts.
 *
 * The query normalizes the email (trim + lowercase) before doing an
 * exact-match lookup on the "email" index of the users table.
 * This test mirrors that logic without needing a Convex deployment.
 */

// Mirror of the checkEmailExists handler logic
function checkEmailExistsLogic(
  email: string,
  existingEmails: string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return existingEmails.includes(normalized);
}

describe("checkEmailExists — with normalization (trim + lowercase)", () => {
  // All stored emails are lowercased (as the auth flow normalizes before storing)
  const existing = ["alice@fretbox.in", "bob@gmail.com", "carol@test.com"];

  it("returns true for an existing email (exact match)", () => {
    assert.strictEqual(checkEmailExistsLogic("alice@fretbox.in", existing), true);
  });

  it("returns true for existing email with different casing", () => {
    assert.strictEqual(checkEmailExistsLogic("ALICE@Fretbox.IN", existing), true);
  });

  it("returns true for existing email with leading/trailing spaces", () => {
    assert.strictEqual(checkEmailExistsLogic("  alice@fretbox.in  ", existing), true);
  });

  it("returns false for a non-existent email", () => {
    assert.strictEqual(checkEmailExistsLogic("nobody@nowhere.com", existing), false);
  });

  it("returns false for empty string", () => {
    assert.strictEqual(checkEmailExistsLogic("", existing), false);
  });

  it("returns false for whitespace-only string", () => {
    assert.strictEqual(checkEmailExistsLogic("   ", existing), false);
  });

  it("allows any email domain (gmail, test, etc.)", () => {
    assert.strictEqual(checkEmailExistsLogic("bob@gmail.com", existing), true);
    assert.strictEqual(checkEmailExistsLogic("carol@test.com", existing), true);
  });

  it("returns false for non-existent gmail address", () => {
    assert.strictEqual(checkEmailExistsLogic("random@gmail.com", existing), false);
  });
});
