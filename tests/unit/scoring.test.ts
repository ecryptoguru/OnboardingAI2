"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { calculateDeterministicScore } from "../../convex/lib/scoring";

describe("calculateDeterministicScore", () => {
  it("should score a large private university highly", () => {
    const result = calculateDeterministicScore(
      {
        student_count: 25000,
        type: "Private",
        naac_grade: "A++",
        demographics: { hostelites: 6000, total_students: 25000 },
      },
      [
        { signal_type: "linkedin" },
        { signal_type: "news" },
      ],
      5,
    );

    // hostelite_score = 30, student_scale = 20, naac = 15, agility = 15, stakeholders = 10, signals = 10
    // Total = 100 (capped)
    assert.strictEqual(result.deterministic_score, 100);
    assert.strictEqual(result.factors.hostelite_score, 30);
    assert.strictEqual(result.factors.student_scale_score, 20);
    assert.strictEqual(result.factors.naac_score, 15);
    assert.strictEqual(result.factors.agility_score, 15);
    assert.strictEqual(result.factors.stakeholder_score, 10);
    assert.strictEqual(result.factors.digital_signals_score, 10);
  });

  it("should score a small state university lower", () => {
    const result = calculateDeterministicScore(
      {
        student_count: 1500,
        type: "State",
        naac_grade: "B++",
        demographics: { hostelites: 300, total_students: 1500 },
      },
      [],
      1,
    );

    // hostelite_score = 5, student_scale = 0, naac = 3, agility = 5, stakeholders = 3, signals = 0
    // Total = 16
    assert.strictEqual(result.deterministic_score, 16);
    assert.strictEqual(result.factors.hostelite_score, 5);
    assert.strictEqual(result.factors.student_scale_score, 0);
    assert.strictEqual(result.factors.naac_score, 3);
    assert.strictEqual(result.factors.agility_score, 5);
    assert.strictEqual(result.factors.stakeholder_score, 3);
    assert.strictEqual(result.factors.digital_signals_score, 0);
  });

  it("should use nirf_total when total_students is absent", () => {
    const result = calculateDeterministicScore(
      {
        type: "Deemed",
        demographics: { nirf_total: 12000 },
      },
      [{ signal_type: "news" }],
      3,
    );

    // student_scale should be 15 (12000 students)
    assert.strictEqual(result.factors.student_scale_score, 15);
    assert.strictEqual(result.factors.agility_score, 15);
  });

  it("should infer hostelites from nirf_total when actual hostelites missing", () => {
    const result = calculateDeterministicScore(
      {
        type: "Deemed",
        demographics: { nirf_total: 12000 },
      },
      [{ signal_type: "news" }],
      3,
    );

    // 12000 students * 50% inferred ratio = 6000 hostelites → score 30
    assert.strictEqual(result.factors.hostelite_score, 30);
    assert.strictEqual(result.factors.hostelites_inferred, true);
    assert.strictEqual(result.factors.student_scale_score, 15);
    assert.strictEqual(result.factors.agility_score, 15);
  });

  it("should infer hostelites for private universities with student count", () => {
    const result = calculateDeterministicScore(
      { student_count: 5000, type: "Private" },
      [],
      0,
    );

    // 5000 students * 50% inferred ratio = 2500 hostelites → score 20
    assert.strictEqual(result.factors.hostelite_score, 20);
    assert.strictEqual(result.factors.hostelites_inferred, true);
    assert.strictEqual(result.factors.student_scale_score, 10);
    assert.strictEqual(result.factors.stakeholder_score, 0);
  });
});
