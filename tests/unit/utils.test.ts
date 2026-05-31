"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { withRetry } from "../../convex/lib/utils";

describe("withRetry", () => {
  it("retries on transient errors up to maxRetries", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("status code: 503");
        }
        return "success";
      },
      { maxRetries: 3, initialDelay: 10 },
    );
    assert.strictEqual(result, "success");
    assert.strictEqual(attempts, 3);
  });

  it("does NOT retry on 400 errors", async () => {
    let attempts = 0;
    await assert.rejects(
      async () =>
        withRetry(
          async () => {
            attempts++;
            throw new Error("Bad Request: status code 400");
          },
          { maxRetries: 3, initialDelay: 10 },
        ),
      /Bad Request/,
    );
    assert.strictEqual(attempts, 1);
  });

  it("does NOT retry on 401 errors", async () => {
    let attempts = 0;
    await assert.rejects(
      async () =>
        withRetry(
          async () => {
            attempts++;
            throw new Error("Unauthorized: status code 401");
          },
          { maxRetries: 3, initialDelay: 10 },
        ),
      /Unauthorized/,
    );
    assert.strictEqual(attempts, 1);
  });

  it("does NOT retry on safety/halted errors", async () => {
    let attempts = 0;
    await assert.rejects(
      async () =>
        withRetry(
          async () => {
            attempts++;
            throw new Error("Request halted due to safety policy block");
          },
          { maxRetries: 3, initialDelay: 10 },
        ),
      /halted/,
    );
    assert.strictEqual(attempts, 1);
  });

  it("retries on network timeout keywords", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("fetch failed: ETIMEDOUT");
        }
        return "ok";
      },
      { maxRetries: 2, initialDelay: 10 },
    );
    assert.strictEqual(result, "ok");
    assert.strictEqual(attempts, 2);
  });
});
