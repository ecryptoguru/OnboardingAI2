"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isDecisionMakerRole,
  isLikelyAcademicNonDecisionRole,
} from "../../convex/lib/stakeholderQuality";

describe("stakeholderQuality role classification", () => {
  it("identifies core decision maker roles", () => {
    assert.strictEqual(isDecisionMakerRole("Vice Chancellor"), true);
    assert.strictEqual(isDecisionMakerRole("Registrar"), true);
    assert.strictEqual(isDecisionMakerRole("Dean Student Affairs"), true);
    assert.strictEqual(isDecisionMakerRole("Controller of Examinations"), true);
  });

  it("rejects purely academic profile roles", () => {
    assert.strictEqual(
      isLikelyAcademicNonDecisionRole("Assistant Professor Sr. Grade 1"),
      true,
    );
    assert.strictEqual(
      isLikelyAcademicNonDecisionRole("Associate Professor"),
      true,
    );
    assert.strictEqual(isDecisionMakerRole("Assistant Professor"), false);
  });

  it("keeps mixed admin-academic roles as decision roles", () => {
    const role = "Dean and Professor";
    assert.strictEqual(isDecisionMakerRole(role), true);
    assert.strictEqual(isLikelyAcademicNonDecisionRole(role), false);
  });
});
