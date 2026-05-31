"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

import { namesMatch } from "../../convex/lib/universityUtils";

describe("namesMatch", () => {
  it("matches exact names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Delhi"), true);
  });

  it("matches substring inclusion", () => {
    assert.strictEqual(namesMatch("Indian Institute of Technology Delhi", "IIT Delhi"), true);
  });

  it("matches acronym VIT ↔ Vellore Institute of Technology", () => {
    assert.strictEqual(
      namesMatch("Vellore Institute of Technology", "VIT"),
      true,
    );
  });

  it("matches shared distinctive tokens", () => {
    assert.strictEqual(
      namesMatch("Birla Institute of Technology", "Birla Institute"),
      true,
    );
  });

  it("does not match unrelated names", () => {
    assert.strictEqual(namesMatch("IIT Delhi", "IIT Bombay"), false);
  });

  it("rejects substring match when city name indicates a branch", () => {
    // "Coimbatore" is a single extra token but it indicates a regional campus
    assert.strictEqual(
      namesMatch("Anna University Coimbatore", "Anna University"),
      false,
    );
  });

  it("rejects match when campus keyword is present", () => {
    // "Campus" is an explicit campus keyword — must block
    assert.strictEqual(
      namesMatch("IIT Delhi Campus", "IIT Delhi"),
      false,
    );
  });

  it("rejects match when multi-token location descriptor is present", () => {
    // "Greater Noida" is two extra tokens — treat as branch/campus
    assert.strictEqual(
      namesMatch("Amity University Greater Noida", "Amity University"),
      false,
    );
  });

  it("still matches acronym even when city name differs", () => {
    // VIT ↔ Vellore Institute of Technology should match via shared tokens,
    // even though "Vellore" would block a pure substring match
    assert.strictEqual(
      namesMatch("Vellore Institute of Technology", "VIT"),
      true,
    );
  });
});
