"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  cleanScoringFactors,
  CURRENT_SCORING_FACTOR_KEYS,
} from "../../convex/priorityScores";

describe("priorityScores - cleanScoringFactors", () => {
  it("keeps all current scoring factor fields with valid values", () => {
    const input = {
      hostelite_score: 25,
      student_scale_score: 20,
      naac_score: 15,
      agility_score: 10,
      stakeholder_score: 10,
      digital_signals_score: 5,
      hostelites_inferred: true,
    };

    const result = cleanScoringFactors(input);

    assert.strictEqual(result.hostelite_score, 25);
    assert.strictEqual(result.student_scale_score, 20);
    assert.strictEqual(result.naac_score, 15);
    assert.strictEqual(result.agility_score, 10);
    assert.strictEqual(result.stakeholder_score, 10);
    assert.strictEqual(result.digital_signals_score, 5);
    assert.strictEqual(result.hostelites_inferred, true);
  });

  it("strips legacy scoring factor fields", () => {
    const input = {
      hostelite_score: 25,
      student_count_score: 99,
      digital_presence_score: 88,
      news_activity_score: 77,
      location_score: 66,
    };

    const result = cleanScoringFactors(input);

    assert.strictEqual(result.hostelite_score, 25);
    assert.strictEqual("student_count_score" in result, false);
    assert.strictEqual("digital_presence_score" in result, false);
    assert.strictEqual("news_activity_score" in result, false);
    assert.strictEqual("location_score" in result, false);
  });

  it("drops undefined and null values", () => {
    const input = {
      hostelite_score: 25,
      student_scale_score: undefined,
      naac_score: null,
    };

    const result = cleanScoringFactors(input);

    assert.strictEqual(result.hostelite_score, 25);
    assert.strictEqual("student_scale_score" in result, false);
    assert.strictEqual("naac_score" in result, false);
  });

  it("only keeps numeric values for score fields", () => {
    const input = {
      hostelite_score: 25,
      student_scale_score: "20",
      naac_score: true,
    };

    const result = cleanScoringFactors(input);

    assert.strictEqual(result.hostelite_score, 25);
    assert.strictEqual("student_scale_score" in result, false);
    assert.strictEqual("naac_score" in result, false);
  });

  it("only keeps boolean values for hostelites_inferred", () => {
    const input = {
      hostelites_inferred: true,
      hostelite_score: 25,
    };

    const result = cleanScoringFactors(input);
    assert.strictEqual(result.hostelites_inferred, true);

    const numericInferred = cleanScoringFactors({
      hostelites_inferred: 1,
      hostelite_score: 25,
    });
    assert.strictEqual("hostelites_inferred" in numericInferred, false);
  });

  it("returns an empty object for empty input", () => {
    const result = cleanScoringFactors({});
    assert.deepStrictEqual(result, {});
  });

  it("CURRENT_SCORING_FACTOR_KEYS contains the expected keys", () => {
    assert.deepStrictEqual(CURRENT_SCORING_FACTOR_KEYS, [
      "hostelite_score",
      "student_scale_score",
      "naac_score",
      "agility_score",
      "stakeholder_score",
      "digital_signals_score",
      "hostelites_inferred",
    ]);
  });
});
