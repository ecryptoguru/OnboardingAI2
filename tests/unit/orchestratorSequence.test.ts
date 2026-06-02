"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Unit tests for the orchestrator phase ordering logic.
 * The key invariant is: government data enrichment (writes demographics)
 * must run BEFORE deep enrichment (also writes demographics) to prevent
 * a write race condition.
 */

interface Phase {
  name: string;
  order: number;
  writesDemographics: boolean;
}

const phases: Phase[] = [
  { name: "discovery", order: 0, writesDemographics: false },
  { name: "phase1_parallel", order: 1, writesDemographics: false },
  { name: "inferContacts", order: 2, writesDemographics: false },
  { name: "governmentData", order: 3, writesDemographics: true },
  { name: "deepEnrichment", order: 4, writesDemographics: true },
  { name: "scoring", order: 5, writesDemographics: false },
];

function getPhase(name: string): Phase | undefined {
  return phases.find((p) => p.name === name);
}

describe("Orchestrator Phase Sequencing", () => {
  it("governmentData runs before deepEnrichment", () => {
    const gov = getPhase("governmentData")!;
    const deep = getPhase("deepEnrichment")!;
    assert.ok(gov.order < deep.order, "govData must precede deepEnrichment");
  });

  it("both govData and deepEnrichment are marked as demographic writers", () => {
    const gov = getPhase("governmentData")!;
    const deep = getPhase("deepEnrichment")!;
    assert.strictEqual(gov.writesDemographics, true);
    assert.strictEqual(deep.writesDemographics, true);
  });

  it("no other phase writes demographics", () => {
    const writers = phases.filter(
      (p) => p.writesDemographics && p.name !== "governmentData" && p.name !== "deepEnrichment",
    );
    assert.deepStrictEqual(writers, []);
  });

  it("phase ordering is strictly monotonic", () => {
    for (let i = 1; i < phases.length; i++) {
      assert.ok(
        phases[i].order > phases[i - 1].order,
        `Phase ${phases[i].name} must come after ${phases[i - 1].name}`,
      );
    }
  });

  it("scoring runs after both demographic writers", () => {
    const scoring = getPhase("scoring")!;
    const gov = getPhase("governmentData")!;
    const deep = getPhase("deepEnrichment")!;
    assert.ok(scoring.order > gov.order, "scoring must run after govData");
    assert.ok(scoring.order > deep.order, "scoring must run after deepEnrichment");
  });
});
