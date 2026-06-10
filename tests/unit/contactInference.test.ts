"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canonicalizeInstitutionEmail,
  choosePreferredRoleEmail,
  inferRoleFromContactContext,
  inferPreferredRoleEmail,
  inferRoleFromInstitutionEmail,
  isRoleBasedInstitutionEmail,
  normalizeInstitutionDomain,
  normalizeStakeholderRole,
} from "../../convex/lib/contactInference";

describe("contactInference", () => {
  it("normalizes institution domains from full URLs", () => {
    assert.strictEqual(
      normalizeInstitutionDomain("https://www.snu.edu.in/admissions"),
      "snu.edu.in",
    );
  });

  it("prefers canonical aliases for singleton roles", () => {
    assert.strictEqual(
      inferPreferredRoleEmail("Registrar", "annauniv.edu"),
      "registrar@annauniv.edu",
    );
    assert.strictEqual(
      inferPreferredRoleEmail("Vice Chancellor", "snu.edu.in"),
      "vc@snu.edu.in",
    );
  });

  it("detects role-based institutional aliases on the same domain", () => {
    assert.strictEqual(
      isRoleBasedInstitutionEmail(
        "reg@annauniv.edu",
        "Registrar",
        "annauniv.edu",
      ),
      true,
    );
    assert.strictEqual(
      isRoleBasedInstitutionEmail(
        "reg@gmail.com",
        "Registrar",
        "annauniv.edu",
      ),
      false,
    );
  });

  it("keeps the canonical alias when merging inferred duplicates", () => {
    assert.strictEqual(
      choosePreferredRoleEmail(
        "Registrar",
        "reg@annauniv.edu",
        "registrar@annauniv.edu",
        "annauniv.edu",
      ),
      "registrar@annauniv.edu",
    );
  });

  it("normalizes role variants to canonical singleton roles", () => {
    assert.strictEqual(
      normalizeStakeholderRole("Vice-Chancellor"),
      "Vice Chancellor",
    );
    assert.strictEqual(
      normalizeStakeholderRole("Dean of Student Welfare"),
      "Dean Student Welfare",
    );
  });

  it("canonicalizes www subdomain institutional emails", () => {
    assert.strictEqual(
      canonicalizeInstitutionEmail("vc@www.annauniv.edu", "annauniv.edu"),
      "vc@annauniv.edu",
    );
    assert.strictEqual(
      canonicalizeInstitutionEmail("registrar@mail.annauniv.edu", "annauniv.edu"),
      "registrar@annauniv.edu",
    );
  });

  it("infers role from institution email local part", () => {
    assert.strictEqual(
      inferRoleFromInstitutionEmail("registrar@bhu.ac.in", "bhu.ac.in"),
      "Registrar",
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("vc@kiit.ac.in", "kiit.ac.in"),
      "Vice Chancellor",
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("dsw@snu.edu.in", "snu.edu.in"),
      "Dean Student Welfare",
    );
  });

  it("returns undefined for non-matching or foreign-domain emails", () => {
    assert.strictEqual(
      inferRoleFromInstitutionEmail("random@gmail.com", "bhu.ac.in"),
      undefined,
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("info@bhu.ac.in", "bhu.ac.in"),
      undefined,
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("registrar@bhu.ac.in", "kiit.ac.in"),
      undefined,
    );
  });

  it("handles local-part prefixes and separators", () => {
    assert.strictEqual(
      inferRoleFromInstitutionEmail("registrar.office@bhu.ac.in", "bhu.ac.in"),
      "Registrar",
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("vc_1@kiit.ac.in", "kiit.ac.in"),
      "Vice Chancellor",
    );
    assert.strictEqual(
      inferRoleFromInstitutionEmail("dsw-affairs@snu.edu.in", "snu.edu.in"),
      "Dean Student Welfare",
    );
  });

  it("infers role from nearby contact context when email local part is not role-based", () => {
    assert.strictEqual(
      inferRoleFromContactContext(
        "Office of the Vice Chancellor email: someone@bhu.ac.in",
      ),
      "Vice Chancellor",
    );
    assert.strictEqual(
      inferRoleFromContactContext(
        "Student Welfare Dean contact for hostel administration",
      ),
      "Dean Student Welfare",
    );
    assert.strictEqual(
      inferRoleFromContactContext("General enquiries and admissions helpdesk"),
      undefined,
    );
  });
});
