"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractDemographicsFromText,
  isValidIndianPhone,
  normalizeIndianPhone,
  withRetry,
} from "../../convex/lib/utils";

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

describe("normalizeIndianPhone", () => {
  it("normalizes mobile numbers into +91 format", () => {
    assert.strictEqual(normalizeIndianPhone("9876543210"), "+919876543210");
    assert.strictEqual(
      normalizeIndianPhone("+91-98765-43210"),
      "+919876543210",
    );
  });

  it("normalizes landlines with STD codes", () => {
    assert.strictEqual(
      normalizeIndianPhone("044-2235-7408"),
      "+91-44-22357408",
    );
  });

  it("rejects malformed long numeric strings", () => {
    assert.strictEqual(normalizeIndianPhone("+2025052218580"), null);
    assert.strictEqual(isValidIndianPhone("+2025052218580"), false);
  });

  it("rejects repeated dummy digits", () => {
    assert.strictEqual(normalizeIndianPhone("999999999999"), null);
  });
});

describe("extractDemographicsFromText", () => {
  it("extracts hostelite and day-scholar totals", () => {
    const parsed = extractDemographicsFromText(`
      Total Students: 12,345
      Hostelites: 4,321
      Day Scholars: 8,024
    `);
    assert.strictEqual(parsed.total_students, 12345);
    assert.strictEqual(parsed.hostelites, 4321);
    assert.strictEqual(parsed.day_scholars, 8024);
  });

  it("extracts gender splits for hostelites and day scholars", () => {
    const parsed = extractDemographicsFromText(`
      Residential Students Male 1,200 Female 800
      Day Scholars Male 2,300 Female 2,100
    `);
    assert.strictEqual(parsed.hostelites_male, 1200);
    assert.strictEqual(parsed.hostelites_female, 800);
    assert.strictEqual(parsed.hostelites, 2000);
    assert.strictEqual(parsed.day_scholars_male, 2300);
    assert.strictEqual(parsed.day_scholars_female, 2100);
    assert.strictEqual(parsed.day_scholars, 4400);
  });
});
