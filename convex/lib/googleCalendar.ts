"use node";

/**
 * Google Calendar API helper for Fretbox Outreach AI.
 * Uses a service account (JWT) to create calendar events with Google Meet links.
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — JSON string of the service account key file
 *   GOOGLE_CALENDAR_ID          — Calendar ID to create events on (default: primary)
 */

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;
let cachedTokenKey: string | null = null;

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  conferenceData?: {
    entryPoints?: Array<{ entryPointType: string; uri: string }>;
  };
  hangoutLink?: string;
  status: string;
}

function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

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

async function getAccessToken(serviceAccountJson?: string): Promise<string | null> {
  const saJson = serviceAccountJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.warn("[GoogleCalendar] GOOGLE_SERVICE_ACCOUNT_JSON not set");
    return null;
  }

  let sa: ServiceAccountKey;
  try {
    sa = JSON.parse(saJson);
  } catch {
    console.warn("[GoogleCalendar] Invalid GOOGLE_SERVICE_ACCOUNT_JSON JSON");
    return null;
  }

  // Return cached token if still valid (with 60s safety margin)
  // Key by service account email to avoid stale token after config change
  const tokenKey = sa.client_email;
  if (
    cachedToken &&
    cachedTokenKey === tokenKey &&
    cachedToken.expiresAt > Date.now() + 60_000
  ) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const toSign = `${header}.${claimSet}`;

  try {
    const keyData = pemToArrayBuffer(sa.private_key);
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(toSign),
    );

    const sigBytes = new Uint8Array(signature);
    let sigBinary = "";
    for (let i = 0; i < sigBytes.length; i++) {
      sigBinary += String.fromCharCode(sigBytes[i]);
    }
    const sigB64 = btoa(sigBinary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const jwt = `${toSign}.${sigB64}`;

    const tokenRes = await fetch(
      sa.token_uri || "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`,
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.warn("[GoogleCalendar] Token exchange failed:", err);
      return null;
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string; expires_in?: number };
    const token = tokenData.access_token || null;
    if (token) {
      const expiresIn = tokenData.expires_in ?? 3600;
      cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
      cachedTokenKey = sa.client_email;
    }
    return token;
  } catch (e) {
    console.warn("[GoogleCalendar] JWT signing failed:", e);
    return null;
  }
}

/**
 * Clears the cached access token. Called when an API call returns 401,
 * indicating the token may have been revoked.
 */
function invalidateTokenCache(): void {
  cachedToken = null;
  cachedTokenKey = null;
}

/**
 * Creates a Google Calendar event with a Google Meet link.
 * Returns the created event including the Meet URI.
 */
export async function createMeetingEvent(options: {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmail?: string;
  timeZone?: string;
  serviceAccountJson?: string;
  calendarId?: string;
}): Promise<{
  success: boolean;
  eventId?: string;
  meetLink?: string;
  error?: string;
}> {
  const accessToken = await getAccessToken(options.serviceAccountJson);
  if (!accessToken) {
    return { success: false, error: "GOOGLE_CALENDAR_NOT_CONFIGURED" };
  }

  const calendarId = options.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";
  const requestId = `fretbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const body = {
    summary: options.summary,
    description: options.description || "",
    start: {
      dateTime: options.startTime.toISOString(),
      timeZone: options.timeZone || "Asia/Kolkata",
    },
    end: {
      dateTime: options.endTime.toISOString(),
      timeZone: options.timeZone || "Asia/Kolkata",
    },
    attendees: options.attendeeEmail
      ? [{ email: options.attendeeEmail }]
      : [],
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

  try {
    let res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );

    // If 401, token may be revoked — invalidate cache and retry once
    if (res.status === 401) {
      invalidateTokenCache();
      const freshToken = await getAccessToken(options.serviceAccountJson);
      if (freshToken) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${freshToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
          },
        );
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[GoogleCalendar] Event creation failed:", res.status, errText);
      return { success: false, error: `CALENDAR_API_ERROR_${res.status}` };
    }

    const event = (await res.json()) as GoogleCalendarEvent;
    const meetLink =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video",
      )?.uri;

    return {
      success: true,
      eventId: event.id,
      meetLink: meetLink || undefined,
    };
  } catch (e) {
    console.warn("[GoogleCalendar] Exception creating event:", e);
    return { success: false, error: String(e) };
  }
}

/**
 * Validates the Google Calendar service account by acquiring an access token
 * and making a lightweight GET call to the calendar metadata endpoint.
 * Returns success with the calendar summary if credentials are valid.
 */
export async function testCalendarConnection(options?: {
  serviceAccountJson?: string;
  calendarId?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
  const accessToken = await getAccessToken(options?.serviceAccountJson);
  if (!accessToken) {
    return { success: false, error: "GOOGLE_CALENDAR_NOT_CONFIGURED" };
  }

  const calendarId =
    options?.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";

  try {
    let res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );

    // If 401, token may be revoked — invalidate cache and retry once
    if (res.status === 401) {
      invalidateTokenCache();
      const freshToken = await getAccessToken(options?.serviceAccountJson);
      if (freshToken) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${freshToken}`,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[GoogleCalendar] Connection test failed:", res.status, errText);
      if (res.status === 404) {
        return {
          success: false,
          error: `Calendar "${calendarId}" not found. Verify the calendar ID and that the service account has access.`,
        };
      }
      if (res.status === 403) {
        return {
          success: false,
          error: `Service account lacks permission to access calendar "${calendarId}". Share the calendar with the service account email.`,
        };
      }
      return { success: false, error: `CALENDAR_API_ERROR_${res.status}` };
    }

    const data = (await res.json()) as { summary?: string; id?: string };
    const summary = data.summary || data.id || calendarId;
    return {
      success: true,
      message: `Connected to calendar "${summary}" successfully.`,
    };
  } catch (e) {
    console.warn("[GoogleCalendar] Connection test exception:", e);
    return { success: false, error: String(e) };
  }
}

/**
 * Updates an existing Google Calendar event (e.g., to cancel).
 */
export async function updateEvent(
  eventId: string,
  patch: { status?: string },
  options?: { serviceAccountJson?: string; calendarId?: string },
): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getAccessToken(options?.serviceAccountJson);
  if (!accessToken) {
    return { success: false, error: "GOOGLE_CALENDAR_NOT_CONFIGURED" };
  }

  const calendarId = options?.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "primary";

  try {
    let res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
        signal: AbortSignal.timeout(15000),
      },
    );

    // If 401, token may be revoked — invalidate cache and retry once
    if (res.status === 401) {
      invalidateTokenCache();
      const freshToken = await getAccessToken(options?.serviceAccountJson);
      if (freshToken) {
        res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1&sendUpdates=all`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${freshToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(patch),
            signal: AbortSignal.timeout(15000),
          },
        );
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      console.warn("[GoogleCalendar] Event update failed:", res.status, errText);
      return { success: false, error: `CALENDAR_API_ERROR_${res.status}` };
    }

    return { success: true };
  } catch (e) {
    console.warn("[GoogleCalendar] Exception updating event:", e);
    return { success: false, error: String(e) };
  }
}
