"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { embed } from "../../convex/lib/llm";

describe("Embedding integration sanity", () => {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  it(
    "returns a 768-dim float array for a real text",
    { skip: !apiKey },
    async () => {
      const vector = await embed(
        "Kalinga Institute of Industrial Technology is a university in Odisha, India.",
        apiKey,
      );

      assert.ok(Array.isArray(vector), "Result should be an array");
      assert.strictEqual(vector.length, 768, "Should have 768 dimensions");

      const hasInvalid = vector.some((v) => !Number.isFinite(v));
      assert.strictEqual(hasInvalid, false, "Vector should not contain non-finite values");
    },
  );

  it("returns a zero vector when no API key is provided", async () => {
    const vector = await embed("Some text", null);
    assert.strictEqual(vector.length, 768);
    assert.ok(vector.every((v) => v === 0), "All values should be zero");
  });
});
