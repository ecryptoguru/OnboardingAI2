"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { namesMatch } from "../../convex/lib/universityUtils";

describe("namesMatch", () => {
  it("should match exact names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Delhi"), true);
  });

  it("should match case-insensitive", () => {
    assert.strictEqual(namesMatch("iit delhi", "IIT Delhi"), true);
  });

  it("should match substring containment", () => {
    assert.strictEqual(namesMatch("VIT University", "VIT"), true);
    assert.strictEqual(namesMatch("VIT", "VIT University"), true);
  });

  it("should match via shared token", () => {
    assert.strictEqual(
      namesMatch("Vellore Institute of Technology", "VIT University"),
      true,
    );
  });

  it("should match Yenepoya variant", () => {
    assert.strictEqual(
      namesMatch("Yenepoya University", "Yenepoya"),
      true,
    );
  });

  it("should not match unrelated names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Bombay"), false);
    assert.strictEqual(namesMatch("Stanford", "MIT"), false);
  });

  it("should not match regional/sub-campuses to parent/generic universities", () => {
    assert.strictEqual(namesMatch("Anna University Coimbatore", "Anna University"), false);
    assert.strictEqual(namesMatch("Anna University", "Anna University Coimbatore"), false);
    assert.strictEqual(namesMatch("Indian Institute of Technology Bombay", "Indian Institute of Technology"), false);
    assert.strictEqual(namesMatch("University of California, Berkeley", "University of California"), false);
  });

  it("should handle extra whitespace", () => {
    assert.strictEqual(namesMatch("IIT   Delhi", "IIT Delhi"), true);
  });
});
