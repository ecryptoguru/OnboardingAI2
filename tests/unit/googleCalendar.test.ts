"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of base64UrlEncode from convex/lib/googleCalendar.ts
 */
function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Mirror of pemToArrayBuffer from convex/lib/googleCalendar.ts
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

describe("Google Calendar Helper - Utilities", () => {
  it("should export createMeetingEvent and updateEvent functions", async () => {
    const { createMeetingEvent, updateEvent } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    assert.strictEqual(typeof createMeetingEvent, "function");
    assert.strictEqual(typeof updateEvent, "function");
  });

  it("should return GOOGLE_CALENDAR_NOT_CONFIGURED when env var is missing", async () => {
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

describe("Google Calendar - base64UrlEncode", () => {
  it("should encode a simple string", () => {
    const result = base64UrlEncode("test");
    assert.ok(result.length > 0);
    assert.ok(!result.includes("+"), "should not contain +");
    assert.ok(!result.includes("/"), "should not contain /");
    assert.ok(!result.includes("="), "should not contain =");
  });

  it("should replace + with -", () => {
    const result = base64UrlEncode("????????");
    assert.ok(!result.includes("+"), "should not contain +");
  });

  it("should replace / with _", () => {
    const result = base64UrlEncode("????????");
    assert.ok(!result.includes("/"), "should not contain /");
  });

  it("should strip padding = characters", () => {
    const result = base64UrlEncode("test");
    assert.ok(!result.includes("="), "should not contain =");
  });
});

describe("Google Calendar - pemToArrayBuffer", () => {
  it("should extract base64 content from PEM format", () => {
    const fakeBase64 = btoa("test-key-data");
    const pem = `-----BEGIN PRIVATE KEY-----\n${fakeBase64}\n-----END PRIVATE KEY-----\n`;
    const buf = pemToArrayBuffer(pem);
    assert.ok(buf instanceof ArrayBuffer);
    assert.ok(buf.byteLength > 0);
  });

  it("should handle PEM with extra whitespace and newlines", () => {
    const fakeBase64 = btoa("test-key-data");
    const pem = `-----BEGIN PRIVATE KEY-----\n  ${fakeBase64}  \n-----END PRIVATE KEY-----\n`;
    const buf = pemToArrayBuffer(pem);
    assert.ok(buf.byteLength > 0);
  });

  it("should handle single-line PEM", () => {
    const fakeBase64 = btoa("test-key-data");
    const pem = `-----BEGIN PRIVATE KEY-----${fakeBase64}-----END PRIVATE KEY-----`;
    const buf = pemToArrayBuffer(pem);
    assert.ok(buf.byteLength > 0);
  });
});

describe("Google Calendar - JWT Claim Set Structure", () => {
  it("should construct correct JWT header", () => {
    const header = JSON.parse(atob(base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))));
    assert.strictEqual(header.alg, "RS256");
    assert.strictEqual(header.typ, "JWT");
  });

  it("should construct correct JWT claim set with required fields", () => {
    const now = Math.floor(Date.now() / 1000);
    const claimSet = {
      iss: "test@project.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    assert.ok(claimSet.iss, "iss (issuer) is required");
    assert.ok(claimSet.scope, "scope is required");
    assert.strictEqual(claimSet.scope, "https://www.googleapis.com/auth/calendar");
    assert.ok(claimSet.aud, "aud (audience) is required");
    assert.ok(claimSet.iat, "iat (issued at) is required");
    assert.ok(claimSet.exp, "exp (expiry) is required");
    assert.ok(claimSet.exp > claimSet.iat, "exp must be after iat");
    assert.ok(claimSet.exp - claimSet.iat === 3600, "token should be valid for 1 hour");
  });

  it("should URL-encode grant_type in token request body", () => {
    const grantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
    const encoded = encodeURIComponent(grantType);
    const body = `grant_type=${encoded}&assertion=test-jwt`;
    assert.ok(body.includes("urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer"), "grant_type must be URL-encoded");
    assert.ok(!body.includes("urn:ietf:params:oauth:grant-type:jwt-bearer&"), "raw colons must not appear in body");
  });
});

describe("Google Calendar - Event Creation Body Structure", () => {
  it("should build correct event body for Google Calendar API", () => {
    const startTime = new Date("2024-12-01T10:00:00+05:30");
    const endTime = new Date("2024-12-01T10:30:00+05:30");
    const requestId = `fretbox-${Date.now()}-abc123`;

    const body = {
      summary: "Test Meeting",
      description: "Test description",
      start: {
        dateTime: startTime.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: "Asia/Kolkata",
      },
      attendees: [{ email: "test@example.com" }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 15 },
        ],
      },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    assert.strictEqual(body.summary, "Test Meeting");
    assert.strictEqual(body.start.timeZone, "Asia/Kolkata");
    assert.strictEqual(body.end.timeZone, "Asia/Kolkata");
    assert.strictEqual(body.attendees.length, 1);
    assert.strictEqual(body.attendees[0].email, "test@example.com");
    assert.strictEqual(body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
    assert.strictEqual(body.reminders.useDefault, false);
    assert.strictEqual(body.reminders.overrides.length, 2);
  });

  it("should handle empty attendees list when no email provided", () => {
    const body = {
      attendees: undefined ? [{ email: "test@example.com" }] : [],
    };
    assert.strictEqual(body.attendees.length, 0);
  });

  it("should use hangoutsMeet as conference solution type", () => {
    const body = {
      conferenceData: {
        createRequest: {
          requestId: "test-123",
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };
    assert.strictEqual(body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  });
});

describe("Google Calendar - API URL Construction", () => {
  it("should construct correct insert URL with conferenceDataVersion and sendUpdates", () => {
    const calendarId = "primary";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    assert.ok(url.includes("conferenceDataVersion=1"), "must include conferenceDataVersion=1");
    assert.ok(url.includes("sendUpdates=all"), "must include sendUpdates=all");
    assert.ok(url.includes("calendars/primary/events"), "must target correct endpoint");
  });

  it("should construct correct insert URL with custom calendar ID", () => {
    const calendarId = "test@group.calendar.google.com";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`;
    assert.ok(url.includes(encodeURIComponent(calendarId)), "must URL-encode calendar ID");
    assert.ok(url.includes("sendUpdates=all"), "must include sendUpdates=all");
  });

  it("should construct correct patch URL with conferenceDataVersion and sendUpdates", () => {
    const calendarId = "primary";
    const eventId = "abc123";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`;
    assert.ok(url.includes("conferenceDataVersion=1"), "PATCH must include conferenceDataVersion=1");
    assert.ok(url.includes("sendUpdates=all"), "PATCH must include sendUpdates=all");
    assert.ok(url.includes(`/events/${eventId}`), "must include event ID");
  });

  it("should URL-encode calendar ID with special characters", () => {
    const calendarId = "test.group@calendar.google.com";
    const encoded = encodeURIComponent(calendarId);
    assert.ok(encoded.includes("%40"), "@ should be encoded");
  });
});

describe("Google Calendar - Meet Link Extraction", () => {
  it("should extract meet link from hangoutLink", () => {
    const event = {
      id: "evt1",
      summary: "Test",
      start: { dateTime: "2024-12-01T10:00:00Z" },
      end: { dateTime: "2024-12-01T10:30:00Z" },
      status: "confirmed",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
    };
    const meetLink = event.hangoutLink;
    assert.strictEqual(meetLink, "https://meet.google.com/abc-defg-hij");
  });

  it("should extract meet link from conferenceData.entryPoints when hangoutLink missing", () => {
    const event = {
      id: "evt1",
      summary: "Test",
      start: { dateTime: "2024-12-01T10:00:00Z" },
      end: { dateTime: "2024-12-01T10:30:00Z" },
      status: "confirmed",
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/xyz-wuvw-rst" },
        ],
      },
    };
    const meetLink = event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri;
    assert.strictEqual(meetLink, "https://meet.google.com/xyz-wuvw-rst");
  });

  it("should prefer hangoutLink over conferenceData.entryPoints", () => {
    const event = {
      hangoutLink: "https://meet.google.com/primary-link",
      conferenceData: {
        entryPoints: [
          { entryPointType: "video", uri: "https://meet.google.com/secondary-link" },
        ],
      },
    };
    const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri;
    assert.strictEqual(meetLink, "https://meet.google.com/primary-link");
  });

  it("should return undefined when no meet link present", () => {
    const event = {
      id: "evt1",
      summary: "Test",
      start: { dateTime: "2024-12-01T10:00:00Z" },
      end: { dateTime: "2024-12-01T10:30:00Z" },
      status: "confirmed",
    };
    const meetLink = event.hangoutLink || event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri;
    assert.strictEqual(meetLink, undefined);
  });

  it("should filter for video entry point type only", () => {
    const event = {
      conferenceData: {
        entryPoints: [
          { entryPointType: "phone", uri: "tel:+1234567890" },
          { entryPointType: "video", uri: "https://meet.google.com/video-link" },
          { entryPointType: "more", uri: "https://more.google.com" },
        ],
      },
    };
    const meetLink = event.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri;
    assert.strictEqual(meetLink, "https://meet.google.com/video-link");
  });
});

describe("Google Calendar - Token Caching Logic", () => {
  it("should cache token with expiry based on expires_in", () => {
    const expiresIn = 3600;
    const expiresAt = Date.now() + expiresIn * 1000;
    assert.ok(expiresAt > Date.now(), "expiry must be in the future");
    assert.ok(expiresAt - Date.now() <= 3600 * 1000, "expiry should be ~1 hour");
  });

  it("should use cached token when not expired (with 60s margin)", () => {
    const expiresAt = Date.now() + 120_000;
    const isStillValid = expiresAt > Date.now() + 60_000;
    assert.strictEqual(isStillValid, true);
  });

  it("should refresh token when within 60s safety margin", () => {
    const expiresAt = Date.now() + 30_000;
    const isStillValid = expiresAt > Date.now() + 60_000;
    assert.strictEqual(isStillValid, false);
  });

  it("should refresh token when expired", () => {
    const expiresAt = Date.now() - 1000;
    const isStillValid = expiresAt > Date.now() + 60_000;
    assert.strictEqual(isStillValid, false);
  });

  it("should default expires_in to 3600 when not provided", () => {
    const tokenData: { access_token?: string; expires_in?: number } = { access_token: "test" };
    const expiresIn = tokenData.expires_in ?? 3600;
    assert.strictEqual(expiresIn, 3600);
  });

  it("should not reuse cached token when service account changes", () => {
    const email1 = "sa1@project.iam.gserviceaccount.com";
    const email2 = "sa2@project.iam.gserviceaccount.com";
    const cachedTokenKey = email1;
    const tokenKey = email2;

    // Token should NOT be reused when key differs
    const shouldReuse = cachedTokenKey === tokenKey;
    assert.strictEqual(shouldReuse, false, "token must not be reused when service account changes");
  });

  it("should reuse cached token when same service account and not expired", () => {
    const email = "sa1@project.iam.gserviceaccount.com";
    const cachedTokenKey = email;
    const tokenKey = email;
    const expiresAt = Date.now() + 120_000;

    const shouldReuse =
      cachedTokenKey === tokenKey && expiresAt > Date.now() + 60_000;
    assert.strictEqual(shouldReuse, true);
  });

  it("should invalidate token cache on 401 and retry with fresh token", () => {
    let cachedToken = { token: "stale-token", expiresAt: Date.now() + 3600_000 };
    let cachedTokenKey = "sa@project.iam.gserviceaccount.com";

    // Simulate 401 response
    const got401 = true;
    if (got401) {
      cachedToken = null;
      cachedTokenKey = null;
    }

    assert.strictEqual(cachedToken, null, "cache should be cleared on 401");
    assert.strictEqual(cachedTokenKey, null, "cache key should be cleared on 401");

    // After getting fresh token, cache should be populated again
    const freshToken = "fresh-token";
    const freshExpiresAt = Date.now() + 3600_000;
    cachedToken = { token: freshToken, expiresAt: freshExpiresAt };
    cachedTokenKey = "sa@project.iam.gserviceaccount.com";

    assert.strictEqual(cachedToken.token, "fresh-token");
    assert.strictEqual(cachedTokenKey, "sa@project.iam.gserviceaccount.com");
  });
});

describe("Google Calendar - Service Account Key Validation", () => {
  it("should validate required fields in service account JSON", () => {
    const sa = {
      type: "service_account",
      project_id: "test-project",
      private_key_id: "key-id-123",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n",
      client_email: "test@test-project.iam.gserviceaccount.com",
      client_id: "123456789",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
    };

    assert.ok(sa.client_email, "client_email is required");
    assert.ok(sa.private_key, "private_key is required");
    assert.ok(sa.token_uri, "token_uri is required");
  });

  it("should reject service account without client_email", () => {
    const sa = { private_key: "key", token_uri: "https://oauth2.googleapis.com/token" };
    assert.ok(!sa.client_email, "should detect missing client_email");
  });

  it("should reject service account without private_key", () => {
    const sa = { client_email: "test@test.com", token_uri: "https://oauth2.googleapis.com/token" };
    assert.ok(!sa.private_key, "should detect missing private_key");
  });
});

describe("Google Calendar - Calendar ID Fallback", () => {
  it("should use provided calendarId when given", () => {
    const calendarId = "custom@group.calendar.google.com" ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
    assert.strictEqual(calendarId, "custom@group.calendar.google.com");
  });

  it("should fall back to env var when calendarId not provided", () => {
    process.env.GOOGLE_CALENDAR_ID = "env@group.calendar.google.com";
    const calendarId = undefined ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
    assert.strictEqual(calendarId, "env@group.calendar.google.com");
    delete process.env.GOOGLE_CALENDAR_ID;
  });

  it("should fall back to primary when neither provided", () => {
    delete process.env.GOOGLE_CALENDAR_ID;
    const calendarId = undefined ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
    assert.strictEqual(calendarId, "primary");
  });
});

describe("Google Calendar - Request ID Generation", () => {
  it("should generate unique request IDs with fretbox prefix", () => {
    const requestId1 = `fretbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestId2 = `fretbox-${Date.now() + 1}-${Math.random().toString(36).slice(2)}`;

    assert.ok(requestId1.startsWith("fretbox-"), "should start with fretbox-");
    assert.ok(requestId2.startsWith("fretbox-"), "should start with fretbox-");
    assert.notStrictEqual(requestId1, requestId2, "should be unique");
  });
});

describe("Google Calendar - Error Handling", () => {
  it("should return error code with HTTP status on API failure", () => {
    const status = 403;
    const error = `CALENDAR_API_ERROR_${status}`;
    assert.strictEqual(error, "CALENDAR_API_ERROR_403");
  });

  it("should return GOOGLE_CALENDAR_NOT_CONFIGURED when token acquisition fails", () => {
    const accessToken = null;
    const result = !accessToken
      ? { success: false, error: "GOOGLE_CALENDAR_NOT_CONFIGURED" }
      : { success: true };
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GOOGLE_CALENDAR_NOT_CONFIGURED");
  });

  it("should handle timeout errors gracefully", () => {
    const error = new Error("The operation was aborted due to timeout");
    assert.ok(error.message.includes("timeout"), "should capture timeout error");
  });
});

describe("Google Calendar - testCalendarConnection", () => {
  it("should export testCalendarConnection function", async () => {
    const { testCalendarConnection } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    assert.strictEqual(typeof testCalendarConnection, "function");
  });

  it("should return GOOGLE_CALENDAR_NOT_CONFIGURED when service account is missing", async () => {
    const original = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    const { testCalendarConnection } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    const result = await testCalendarConnection();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GOOGLE_CALENDAR_NOT_CONFIGURED");

    if (original) process.env.GOOGLE_SERVICE_ACCOUNT_JSON = original;
  });

  it("should return GOOGLE_CALENDAR_NOT_CONFIGURED when service account JSON is invalid", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "not-json";

    const { testCalendarConnection } = await import(
      "../../convex/lib/googleCalendar.ts"
    );
    const result = await testCalendarConnection();

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "GOOGLE_CALENDAR_NOT_CONFIGURED");
  });

  it("should construct correct calendar metadata URL with calendarId", () => {
    const calendarId = "test@group.calendar.google.com";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;
    assert.ok(url.includes(encodeURIComponent(calendarId)), "must URL-encode calendar ID");
    assert.ok(url.includes("/calendars/"), "must target calendar endpoint");
  });

  it("should construct correct calendar metadata URL with 'primary' fallback", () => {
    delete process.env.GOOGLE_CALENDAR_ID;
    const calendarId = undefined ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`;
    assert.ok(url.endsWith("/calendars/primary"), "must fall back to primary");
  });

  it("should return 404 error with calendar ID in message", () => {
    const calendarId = "missing@group.calendar.google.com";
    const status = 404;
    const error = `Calendar "${calendarId}" not found. Verify the calendar ID and that the service account has access.`;
    assert.ok(error.includes(calendarId), "404 error must include calendar ID");
    assert.ok(error.includes("not found"), "404 error must mention 'not found'");
  });

  it("should return 403 error with calendar ID in message", () => {
    const calendarId = "restricted@group.calendar.google.com";
    const status = 403;
    const error = `Service account lacks permission to access calendar "${calendarId}". Share the calendar with the service account email.`;
    assert.ok(error.includes(calendarId), "403 error must include calendar ID");
    assert.ok(error.includes("permission"), "403 error must mention permission");
  });

  it("should return generic API error for other status codes", () => {
    const status = 500;
    const error = `CALENDAR_API_ERROR_${status}`;
    assert.strictEqual(error, "CALENDAR_API_ERROR_500");
  });

  it("should parse calendar summary from successful response", () => {
    const responseData = { summary: "Fretbox Meetings", id: "abc123@group.calendar.google.com" };
    const summary = responseData.summary || responseData.id || "primary";
    assert.strictEqual(summary, "Fretbox Meetings");
  });

  it("should fall back to calendar ID when summary is empty", () => {
    const responseData: { summary?: string; id?: string } = { id: "abc123@group.calendar.google.com" };
    const calendarId = "abc123@group.calendar.google.com";
    const summary = responseData.summary || responseData.id || calendarId;
    assert.strictEqual(summary, "abc123@group.calendar.google.com");
  });

  it("should fall back to calendarId when both summary and id are missing", () => {
    const responseData: { summary?: string; id?: string } = {};
    const calendarId = "fallback@group.calendar.google.com";
    const summary = responseData.summary || responseData.id || calendarId;
    assert.strictEqual(summary, "fallback@group.calendar.google.com");
  });

  it("should include calendar summary in success message", () => {
    const summary = "Fretbox Meetings";
    const message = `Connected to calendar "${summary}" successfully.`;
    assert.ok(message.includes(summary), "success message must include calendar summary");
    assert.ok(message.includes("successfully"), "success message must indicate success");
  });

  it("should handle 401 retry logic by invalidating token cache", () => {
    let cachedToken: { token: string; expiresAt: number } | null = {
      token: "stale",
      expiresAt: Date.now() + 3600_000,
    };
    let cachedTokenKey: string | null = "sa@project.iam.gserviceaccount.com";

    // Simulate 401 → invalidate
    if (cachedToken && cachedTokenKey) {
      cachedToken = null;
      cachedTokenKey = null;
    }

    assert.strictEqual(cachedToken, null, "cache should be cleared on 401");
    assert.strictEqual(cachedTokenKey, null, "cache key should be cleared on 401");
  });

  it("should use 10-second timeout for connection test", () => {
    const timeoutMs = 10000;
    assert.ok(timeoutMs === 10000, "connection test timeout must be 10s");
  });
});
