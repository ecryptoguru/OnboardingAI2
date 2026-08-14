"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { namesEquivalent } from "../../convex/lib/contactInference";

describe("namesEquivalent", () => {
  it("matches exact names and title differences", () => {
    assert.strictEqual(namesEquivalent("Prof. Asgar Ali", "Prof. Asgar Ali"), true);
    assert.strictEqual(namesEquivalent("Dr. Uma Bhandari", "Uma Bhandari"), true);
    assert.strictEqual(namesEquivalent("Ms. Veena Sharma", "Prof. Veena Sharma"), true);
  });

  it("matches dotted initials against full names", () => {
    assert.strictEqual(namesEquivalent("Sohrab A. Khan", "Sohrab Ahmed Khan"), true);
    assert.strictEqual(namesEquivalent("Dr. D. P. Singh", "D P Singh"), true);
    assert.strictEqual(namesEquivalent("K.S. Gangadhara Somaji", "K S Gangadhara Somaji"), true);
    assert.strictEqual(namesEquivalent("Prof. Aswini Dutt R.", "Aswini Dutt R"), true);
  });

  it("does not match unrelated names", () => {
    assert.strictEqual(namesEquivalent("Prof. Uma Bhandari", "Prof. Sohrab Khan"), false);
    assert.strictEqual(namesEquivalent("Dr. Arif Anwar", "Dr. Naheed Mustafa"), false);
  });

  it("is conservative when token counts differ beyond initials", () => {
    assert.strictEqual(namesEquivalent("K S Singh", "Krishna Singh"), false);
    assert.strictEqual(namesEquivalent("Veena Sharma", "Veena"), false);
    assert.strictEqual(namesEquivalent(undefined, "Veena Sharma"), false);
    assert.strictEqual(namesEquivalent(null, null), false);
  });
});
