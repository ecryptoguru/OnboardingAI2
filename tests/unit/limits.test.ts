"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  BULK_LIST_LIMIT,
  MAX_ATTACHMENT_BYTES_TOTAL,
  MAX_ATTACHMENT_COUNT,
  MAX_BODY_LENGTH,
  MAX_PROPOSAL_RECIPIENTS,
  MAX_RECIPIENTS_PER_BATCH,
  MAX_SUBJECT_LENGTH,
  MAX_VECTOR_SEARCH_LIMIT,
  clampVectorSearchLimit,
  validateAttachmentLimits,
  validateBodyLength,
  validateRecipientCount,
  validateSubjectLength,
} from "../../convex/lib/limits";

describe("validateSubjectLength", () => {
  it("rejects empty subjects", () => {
    assert.ok(validateSubjectLength(""));
    assert.ok(validateSubjectLength("   "));
  });

  it("accepts normal subjects", () => {
    assert.strictEqual(validateSubjectLength("Partnership proposal"), null);
  });

  it("rejects subjects over the limit", () => {
    assert.ok(validateSubjectLength("x".repeat(MAX_SUBJECT_LENGTH + 1)));
    assert.strictEqual(
      validateSubjectLength("x".repeat(MAX_SUBJECT_LENGTH)),
      null,
    );
  });
});

describe("validateBodyLength", () => {
  it("rejects empty bodies", () => {
    assert.ok(validateBodyLength(""));
  });

  it("accepts normal bodies", () => {
    assert.strictEqual(validateBodyLength("Hello registrar,"), null);
  });

  it("rejects bodies over the limit", () => {
    assert.ok(validateBodyLength("x".repeat(MAX_BODY_LENGTH + 1)));
  });
});

describe("validateRecipientCount", () => {
  it("rejects zero recipients", () => {
    assert.ok(validateRecipientCount(0));
  });

  it("accepts a normal batch", () => {
    assert.strictEqual(validateRecipientCount(10), null);
  });

  it("rejects batches over the limit", () => {
    assert.ok(validateRecipientCount(MAX_RECIPIENTS_PER_BATCH + 1));
    assert.strictEqual(
      validateRecipientCount(MAX_RECIPIENTS_PER_BATCH),
      null,
    );
  });
});

describe("validateAttachmentLimits", () => {
  it("rejects too many attachments", () => {
    assert.ok(validateAttachmentLimits(MAX_ATTACHMENT_COUNT + 1, 100));
  });

  it("accepts exactly the attachment count limit", () => {
    assert.strictEqual(
      validateAttachmentLimits(MAX_ATTACHMENT_COUNT, 100),
      null,
    );
  });

  it("rejects oversized attachment totals", () => {
    assert.ok(
      validateAttachmentLimits(1, MAX_ATTACHMENT_BYTES_TOTAL + 1),
    );
  });

  it("accepts totals exactly at the byte limit", () => {
    assert.strictEqual(
      validateAttachmentLimits(1, MAX_ATTACHMENT_BYTES_TOTAL),
      null,
    );
  });

  it("accepts an in-bounds attachment set", () => {
    assert.strictEqual(validateAttachmentLimits(2, 1024), null);
  });
});

describe("clampVectorSearchLimit", () => {
  it("defaults to 10", () => {
    assert.strictEqual(clampVectorSearchLimit(undefined), 10);
  });

  it("caps at the maximum", () => {
    assert.strictEqual(
      clampVectorSearchLimit(MAX_VECTOR_SEARCH_LIMIT * 10),
      MAX_VECTOR_SEARCH_LIMIT,
    );
  });

  it("floors at 1", () => {
    assert.strictEqual(clampVectorSearchLimit(0), 1);
    assert.strictEqual(clampVectorSearchLimit(-5), 1);
  });

  it("passes through in-bounds values", () => {
    assert.strictEqual(clampVectorSearchLimit(25), 25);
  });
});

describe("MAX_PROPOSAL_RECIPIENTS", () => {
  it("is a sane bounded constant", () => {
    assert.ok(MAX_PROPOSAL_RECIPIENTS > 0);
    assert.ok(MAX_PROPOSAL_RECIPIENTS <= MAX_RECIPIENTS_PER_BATCH);
  });
});

describe("BULK_LIST_LIMIT", () => {
  it("is a sane bounded constant", () => {
    assert.ok(BULK_LIST_LIMIT > 0);
    // Must stay comfortably below Convex query result limits while covering
    // the current production dataset (1,357 universities) with headroom.
    assert.ok(BULK_LIST_LIMIT >= 1_000);
    assert.ok(BULK_LIST_LIMIT <= 10_000);
  });
});
