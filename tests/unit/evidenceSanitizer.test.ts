import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitiseEvidence } from "../../convex/lib/evidenceSanitizer";
import type { StakeholderLike } from "../../convex/lib/validateDeepEnrichment";

function stakeholder(overrides: Partial<StakeholderLike>): StakeholderLike {
  return {
    name: "Dr. Test Person",
    role: "Registrar",
    ...overrides,
  };
}

test("keeps emails that literally appear in the source block", () => {
  const block =
    "Prof. Anil Kumar, Registrar, anil.kumar@university.ac.in, 01234567890";
  const result = sanitiseEvidence(
    [stakeholder({ email: "anil.kumar@university.ac.in" })],
    block,
  );
  assert.equal(result[0].email, "anil.kumar@university.ac.in");
  assert.equal(result[0].email_source, "scraped");
});

test("drops injected emails not present in the source block", () => {
  const block = "Prof. Anil Kumar, Registrar, +91-1234567890";
  const result = sanitiseEvidence(
    [stakeholder({ email: "attacker@evil.com" })],
    block,
  );
  assert.equal(result[0].email, undefined);
  assert.equal(result[0].email_source, "none");
});

test("keeps phones that literally appear in the source block", () => {
  const block = "Prof. Anil Kumar, Registrar, +911234567890";
  const result = sanitiseEvidence(
    [stakeholder({ phone: "+91 12345 67890" })],
    block,
  );
  assert.equal(result[0].phone, "+91 12345 67890");
  assert.equal(result[0].phone_source, "scraped");
});

test("drops phones not present in the source block", () => {
  const block = "Prof. Anil Kumar, Registrar, anil@university.ac.in";
  const result = sanitiseEvidence(
    [stakeholder({ phone: "9999999999" })],
    block,
  );
  assert.equal(result[0].phone, undefined);
  assert.equal(result[0].phone_source, "none");
});

test("drops LinkedIn URLs not present in the source block", () => {
  const block = "Prof. Anil Kumar, Registrar";
  const result = sanitiseEvidence(
    [stakeholder({ linkedin_url: "https://linkedin.com/in/anil" })],
    block,
  );
  assert.equal(result[0].linkedin_url, undefined);
  assert.equal(result[0].linkedin_source, "none");
});

test("leaves empty contact channels as none", () => {
  const result = sanitiseEvidence(
    [stakeholder({ name: "Prof. Anil Kumar" })],
    "Prof. Anil Kumar",
  );
  assert.equal(result[0].email_source, "none");
  assert.equal(result[0].phone_source, "none");
  assert.equal(result[0].linkedin_source, "none");
});
