"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

// We test the pure utility parts of googleCalendar.ts
// Full JWT + API tests require env vars and network; those are integration tests.

describe("Google Calendar Helper - Utilities", () => {
  it("should export createMeetingEvent and updateEvent functions", async () => {
    const { createMeetingEvent, updateEvent } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    assert.strictEqual(typeof createMeetingEvent, "function");
    assert.strictEqual(typeof updateEvent, "function");
  });

  it("should return GOOGLE_CALENDAR_NOT_CONFIGURED when env var is missing", async () => {
    // Save original env var if present
    const original = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    const { createMeetingEvent } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    const result = await createMeetingEvent({
      summary: "Test",
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GOOGLE_CALENDAR_NOT_CONFIGURED");

    // Restore
    if (original) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = original;
  });

  it("should return correct error when service account JSON is invalid", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "not-json";
    delete process.env.GOOGLE_CALENDAR_ID;

    const { createMeetingEvent } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    const result = await createMeetingEvent({
      summary: "Test",
      startTime: new Date(),
      endTime: new Date(Date.now() + 3600000),
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GOOGLE_CALENDAR_NOT_CONFIGURED");
  });
});
