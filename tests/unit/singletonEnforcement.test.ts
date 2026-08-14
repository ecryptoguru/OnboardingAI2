"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { enforceSingletonRoles } from "../../convex/lib/validateDeepEnrichment";

describe("enforceSingletonRoles", () => {
  it("keeps a single holder per singleton role", () => {
    const { kept, dropped } = enforceSingletonRoles([
      { name: "Dr. A Sharma", role: "Vice Chancellor", contact_confidence: 1 },
      { name: "Dr. B Rao", role: "Registrar", contact_confidence: 1 },
      { name: "Prof. C Nair", role: "Dean, School of Science", contact_confidence: 1 },
    ]);
    assert.strictEqual(kept.length, 3);
    assert.strictEqual(dropped.length, 0);
  });

  it("drops competing holders of the same singleton role, preferring the leaf page", () => {
    const { kept, dropped } = enforceSingletonRoles([
      {
        name: "Dr. Old",
        role: "Vice Chancellor",
        source_url: "https://uni.edu/prospectus.pdf",
        contact_confidence: 1,
      },
      {
        name: "Dr. New",
        role: "Vice Chancellor (Offg.)",
        source_url: "https://uni.edu/vice-chancellor",
        contact_confidence: 0.8,
      },
    ]);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0].name, "Dr. New");
    assert.strictEqual(dropped.length, 1);
    assert.strictEqual(dropped[0].name, "Dr. Old");
  });

  it("falls back to highest confidence when no leaf source exists", () => {
    const { kept } = enforceSingletonRoles([
      { name: "Dr. A", role: "Registrar", contact_confidence: 0.6 },
      { name: "Dr. B", role: "Registrar", contact_confidence: 1 },
    ]);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(kept[0].name, "Dr. B");
  });

  it("treats same-name duplicates as one person (upsert dedups)", () => {
    const { kept, dropped } = enforceSingletonRoles([
      { name: "Dr. A Sharma", role: "Vice Chancellor" },
      { name: "Dr. A. Sharma", role: "Vice Chancellor" },
    ]);
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(dropped.length, 0);
  });
});
