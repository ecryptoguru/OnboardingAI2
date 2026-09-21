"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { validateAuth } from "../../convex/lib/auth_utils";

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
  return adminEmails.length > 0 && adminEmails.includes(clean);
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

  it("fails closed when the admin list is empty", () => {
    assert.strictEqual(isAdmin({ email: "anyone@test.com" }, []), false);
  });

  it("rejects empty email even when admin list is set", () => {
    assert.strictEqual(isAdmin({}, admins), false);
  });
});

describe("Application access gate", () => {
  it("allows only configured operator identities", async () => {
    const previous = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "operator@example.com";
    try {
      await assert.doesNotReject(
        validateAuth({
          auth: {
            getUserIdentity: async () => ({ email: "Operator@Example.com" }),
          },
        }),
      );
      await assert.rejects(
        validateAuth({
          auth: {
            getUserIdentity: async () => ({ email: "other@example.com" }),
          },
        }),
        /Forbidden/,
      );
    } finally {
      if (previous === undefined) delete process.env.ADMIN_EMAILS;
      else process.env.ADMIN_EMAILS = previous;
    }
  });

  it("fails closed without an operator allowlist", async () => {
    const previous = process.env.ADMIN_EMAILS;
    delete process.env.ADMIN_EMAILS;
    try {
      await assert.rejects(
        validateAuth({
          auth: {
            getUserIdentity: async () => ({ email: "operator@example.com" }),
          },
        }),
        /Forbidden/,
      );
    } finally {
      if (previous !== undefined) process.env.ADMIN_EMAILS = previous;
    }
  });
});
