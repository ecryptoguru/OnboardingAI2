"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  toNum,
  toNumStrict,
  extractDemographicsFromText,
} from "../../convex/lib/utils";

describe("toNum", () => {
  it("returns undefined for null", () => {
    assert.strictEqual(toNum(null), undefined);
  });

  it("returns undefined for undefined", () => {
    assert.strictEqual(toNum(undefined), undefined);
  });

  it("returns undefined for empty string", () => {
    assert.strictEqual(toNum(""), undefined);
  });

  it("returns undefined for whitespace-only string", () => {
    assert.strictEqual(toNum("   "), undefined);
  });

  it("returns undefined for non-numeric string", () => {
    assert.strictEqual(toNum("not a number"), undefined);
  });

  it("parses a plain integer", () => {
    assert.strictEqual(toNum(42), 42);
  });

  it("parses a plain float", () => {
    assert.strictEqual(toNum(3.14), 3.14);
  });

  it("parses numeric string without commas", () => {
    assert.strictEqual(toNum("25000"), 25000);
  });

  it("strips commas from formatted numbers", () => {
    assert.strictEqual(toNum("25,000"), 25000);
  });

  it("strips multiple commas", () => {
    assert.strictEqual(toNum("1,25,000"), 125000);
  });

  it("trims whitespace before parsing", () => {
    assert.strictEqual(toNum("  25000  "), 25000);
  });

  it("returns undefined for NaN-producing strings", () => {
    assert.strictEqual(toNum("abc"), undefined);
  });

  it("extracts numbers from mixed strings", () => {
    assert.strictEqual(toNum("25,000 students"), 25000);
    assert.strictEqual(toNum("Male: 12,345"), 12345);
    assert.strictEqual(toNum("Hostelites=8765"), 8765);
  });
});

describe("toNumStrict", () => {
  it("returns undefined for 0 (common LLM hallucination)", () => {
    assert.strictEqual(toNumStrict(0), undefined);
  });

  it("returns undefined for string '0'", () => {
    assert.strictEqual(toNumStrict("0"), undefined);
  });

  it("returns undefined for '0' with commas", () => {
    assert.strictEqual(toNumStrict("0,000"), undefined);
  });

  it("returns number for positive integer", () => {
    assert.strictEqual(toNumStrict(42), 42);
  });

  it("returns number for positive string", () => {
    assert.strictEqual(toNumStrict("15000"), 15000);
  });

  it("returns number for comma-formatted positive", () => {
    assert.strictEqual(toNumStrict("15,000"), 15000);
  });

  it("passes through undefined", () => {
    assert.strictEqual(toNumStrict(undefined), undefined);
  });
});

describe("extractDemographicsFromText", () => {
  it("extracts male/female and hostel/day scholar values from mixed text", () => {
    const text = `
      Student Strength
      Male: 21,450
      Female: 18,550
      Hostelites Enrolled: 14,200
      Day Scholars: 25,800
    `;
    assert.deepStrictEqual(extractDemographicsFromText(text), {
      total_students_male: 21450,
      total_students_female: 18550,
      hostelites: 14200,
      day_scholars: 25800,
    });
  });

  it("returns empty object when no valid values exist", () => {
    const text = "No demographic numbers in this paragraph.";
    assert.deepStrictEqual(extractDemographicsFromText(text), {});
  });

  it("handles indian comma formatting and alternate hostel labels", () => {
    const text = `
      Total Students: 1,25,000
      Hostel Strength: 2,450
      Day Scholars (12,340)
    `;
    assert.deepStrictEqual(extractDemographicsFromText(text), {
      total_students: 125000,
      hostelites: 2450,
      day_scholars: 12340,
    });
  });
});
