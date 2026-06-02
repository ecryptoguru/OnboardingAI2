"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of validateAdmin from convex/lib/auth_utils.ts
 * Tests the email extraction and admin matching logic.
 */

interface Identity {
  email?: string;
  tokenIdentifier?: string;
}

function extractEmail(identity: Identity): string {
  const rawEmail = identity.email || identity.tokenIdentifier || "";
  const email = String(rawEmail).toLowerCase().trim();
  return email.includes("|") ? email.split("|").pop()?.trim() || "" : email;
}

function isAdmin(identity: Identity, adminEmails: string[]): boolean {
  const clean = extractEmail(identity);
  if (adminEmails.length === 0) return true;
  return adminEmails.includes(clean);
}

describe("Admin Auth - Email Extraction", () => {
  it("extracts plain email", () => {
    assert.strictEqual(
      extractEmail({ email: "admin@fretbox.in" }),
      "admin@fretbox.in",
    );
  });

  it("extracts email from tokenIdentifier (password provider)", () => {
    assert.strictEqual(
      extractEmail({ tokenIdentifier: "password|admin@fretbox.in" }),
      "admin@fretbox.in",
    );
  });

  it("lowercases email", () => {
    assert.strictEqual(
      extractEmail({ email: "Admin@Fretbox.IN" }),
      "admin@fretbox.in",
    );
  });

  it("handles missing identity gracefully", () => {
    assert.strictEqual(extractEmail({}), "");
  });
});

describe("Admin Auth - Permission Check", () => {
  const admins = ["admin@fretbox.in", "boss@fretbox.in"];

  it("allows matching admin email", () => {
    assert.strictEqual(
      isAdmin({ email: "admin@fretbox.in" }, admins),
      true,
    );
  });

  it("allows matching tokenIdentifier", () => {
    assert.strictEqual(
      isAdmin({ tokenIdentifier: "password|boss@fretbox.in" }, admins),
      true,
    );
  });

  it("rejects non-admin email", () => {
    assert.strictEqual(
      isAdmin({ email: "hacker@evil.com" }, admins),
      false,
    );
  });

  it("allows anyone when admin list is empty (dev mode)", () => {
    assert.strictEqual(isAdmin({ email: "anyone@test.com" }, []), true);
  });

  it("rejects empty email even when admin list is set", () => {
    assert.strictEqual(isAdmin({}, admins), false);
  });
});
