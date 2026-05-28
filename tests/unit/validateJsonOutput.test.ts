"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

function validateJsonOutput<T extends Record<string, unknown>>(
  parsed: unknown,
  requiredFields: (keyof T)[],
  label = "LLM output",
): T {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} is not a valid object`);
  }
  const obj = parsed as T;
  for (const field of requiredFields) {
    if (!(field in obj)) {
      throw new Error(`${label} missing required field: ${String(field)}`);
    }
  }
  return obj;
}

describe("validateJsonOutput", () => {
  it("accepts a valid object with all required fields", () => {
    const result = validateJsonOutput(
      { demographics: {}, stakeholders: [] },
      ["demographics", "stakeholders"],
      "DeepEnrichment output",
    );
    assert.deepStrictEqual(result, { demographics: {}, stakeholders: [] });
  });

  it("throws when a required field is missing", () => {
    assert.throws(
      () =>
        validateJsonOutput(
          { demographics: {} },
          ["demographics", "stakeholders"],
          "DeepEnrichment output",
        ),
      /missing required field: stakeholders/,
    );
  });

  it("throws for null input", () => {
    assert.throws(
      () => validateJsonOutput(null, ["name"]),
      /is not a valid object/,
    );
  });

  it("throws for array input", () => {
    assert.throws(
      () => validateJsonOutput([1, 2, 3], ["name"]),
      /is not a valid object/,
    );
  });

  it("throws for primitive input", () => {
    assert.throws(
      () => validateJsonOutput("string", ["name"]),
      /is not a valid object/,
    );
  });

  it("accepts empty required fields array", () => {
    const result = validateJsonOutput({ any: "value" }, []);
    assert.deepStrictEqual(result, { any: "value" });
  });

  it("includes custom label in error message", () => {
    assert.throws(
      () => validateJsonOutput({}, ["agenda"], "Proposal output"),
      /Proposal output missing required field: agenda/,
    );
  });
});
