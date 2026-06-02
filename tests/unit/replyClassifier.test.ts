"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of reply classification validation logic from convex/actions/replyClassifier.ts.
 * Tests the deterministic post-LLM parsing, fallback, and confidence logic.
 */

const VALID_CATEGORIES = [
  "meeting_request",
  "positive_interest",
  "request_info",
  "not_interested",
  "opt_out",
  "out_of_office",
  "other",
] as const;

function validateClassification(result: string | undefined): {
  category: string;
  confidence: number;
} {
  if (!result || !VALID_CATEGORIES.includes(result as typeof VALID_CATEGORIES[number])) {
    return { category: "other", confidence: 0.5 };
  }
  return { category: result, confidence: 0.9 };
}

describe("Reply Classifier - Category Validation", () => {
  it("should accept all valid categories with high confidence", () => {
    for (const cat of VALID_CATEGORIES) {
      const { category, confidence } = validateClassification(cat);
      assert.strictEqual(category, cat);
      assert.strictEqual(confidence, 0.9);
    }
  });

  it("should fallback to 'other' for null input", () => {
    const { category, confidence } = validateClassification(undefined);
    assert.strictEqual(category, "other");
    assert.strictEqual(confidence, 0.5);
  });

  it("should fallback to 'other' for empty string", () => {
    const { category, confidence } = validateClassification("");
    assert.strictEqual(category, "other");
    assert.strictEqual(confidence, 0.5);
  });

  it("should fallback to 'other' for unknown categories", () => {
    const { category, confidence } = validateClassification("spam");
    assert.strictEqual(category, "other");
    assert.strictEqual(confidence, 0.5);
  });

  it("should fallback to 'other' for case-mismatched categories", () => {
    const { category, confidence } = validateClassification("Meeting_Request");
    assert.strictEqual(category, "other");
    assert.strictEqual(confidence, 0.5);
  });

  it("should fallback to 'other' for whitespace-padded categories", () => {
    const { category, confidence } = validateClassification(" meeting_request ");
    assert.strictEqual(category, "other");
    assert.strictEqual(confidence, 0.5);
  });
});

/**
 * Mirror of the university stage mapping from replyClassifier.ts
 */
function mapClassificationToStage(classification: string): string {
  if (classification === "meeting_request") return "meeting_booked";
  if (classification === "opt_out" || classification === "not_interested")
    return "not_interested";
  return "replied";
}

/**
 * Mirror of auto-reply trigger logic from replyClassifier.ts
 */
function shouldTriggerAutoReply(triggerAutoReply?: boolean): boolean {
  return triggerAutoReply !== false;
}

describe("Reply Classifier - Stage Mapping", () => {
  it("should map meeting_request to meeting_booked", () => {
    assert.strictEqual(mapClassificationToStage("meeting_request"), "meeting_booked");
  });

  it("should map opt_out to not_interested", () => {
    assert.strictEqual(mapClassificationToStage("opt_out"), "not_interested");
  });

  it("should map not_interested to not_interested", () => {
    assert.strictEqual(mapClassificationToStage("not_interested"), "not_interested");
  });

  it("should map positive_interest to replied", () => {
    assert.strictEqual(mapClassificationToStage("positive_interest"), "replied");
  });

  it("should map request_info to replied", () => {
    assert.strictEqual(mapClassificationToStage("request_info"), "replied");
  });

  it("should map out_of_office to replied", () => {
    assert.strictEqual(mapClassificationToStage("out_of_office"), "replied");
  });

  it("should map other to replied", () => {
    assert.strictEqual(mapClassificationToStage("other"), "replied");
  });

  it("should map unknown classifications to replied", () => {
    assert.strictEqual(mapClassificationToStage("spam"), "replied");
  });
});

describe("Reply Classifier - Auto Reply Trigger", () => {
  it("should enable auto-reply by default when arg is omitted", () => {
    assert.strictEqual(shouldTriggerAutoReply(undefined), true);
  });

  it("should enable auto-reply when explicitly true", () => {
    assert.strictEqual(shouldTriggerAutoReply(true), true);
  });

  it("should suppress auto-reply when explicitly false", () => {
    assert.strictEqual(shouldTriggerAutoReply(false), false);
  });
});
