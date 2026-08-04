import { httpRouter } from "convex/server";
import { httpAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { getOptionalEnv } from "./lib/env";

function extractEmailAddress(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const email = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function getThreadMessageIdCandidate(
  payload: Record<string, string | undefined>,
): string | null {
  const blob = [
    payload.email_id,
    payload.in_reply_to,
    payload.references,
    payload.headers,
    payload.subject,
  ]
    .filter(Boolean)
    .join("\n");

  const explicit = payload.email_id?.trim();
  if (explicit) return explicit;

  // Only match our own Message-ID domain to avoid extracting arbitrary tokens.
  const match = blob.match(/fretbox-([a-zA-Z0-9_-]+)@reply\.fretbox\.in\b/i);
  return match?.[1] ?? null;
}
/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Verifies HMAC-SHA256 signature. Returns true if valid. */
async function verifyHmac(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // ZeptoMail signatures are Base64-encoded (e.g., "dN0yVozgabP5NPlxMDfP1r5u65bVO9kTGEZMIQlqI2o=")
    const sigBase64 = signature.replace(/^v1=/, "");
    const sigBytes = Uint8Array.from(atob(sigBase64), (c) => c.charCodeAt(0));

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

const http = httpRouter();

// ─── Convex Auth routes (sign-in, sign-out, session) ──────────────────────────
auth.addHttpRoutes(http);

// ─── ZeptoMail delivery event webhook ─────────────────────────────────────────
http.route({
  path: "/webhooks/zeptomail",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = getOptionalEnv("ZEPTOMAIL_WEBHOOK_SECRET");
    if (!secret) {
      console.warn("[ZeptoMail] Webhook not configured — ignoring.");
      return new Response("Webhook not configured", { status: 401 });
    }

    const rawBody = await req.text();
    // ZeptoMail uses producer-signature header: ts=...;s=...;s-algorithm=HmacSHA256
    const sigHeader = req.headers.get("producer-signature") ?? "";
    // Match ;s= or s= at start, not the s= inside ts=
    const sigMatch = sigHeader.match(/(?:^|;)s=([^;]+)/);
    const sig = sigMatch ? decodeURIComponent(sigMatch[1]) : "";
    if (!(await verifyHmac(secret, rawBody, sig))) {
      console.warn("[ZeptoMail] Invalid signature. Rejecting webhook.");
      return new Response("Unauthorized", { status: 401 });
    }
    // Re-parse from text since body was consumed above
    let payload: ZeptoMailWebhookPayload;
    try {
      payload = JSON.parse(rawBody) as ZeptoMailWebhookPayload;
    } catch {
      console.error("[ZeptoMail] Failed to parse webhook JSON body");
      return new Response("Bad Request", { status: 400 });
    }
    return handleZeptomailEvents(ctx, payload);
  }),
});

interface ZeptoMailWebhookPayload {
  event_name?: string[];
  event_message?: Array<{
    email_info?: {
      email_reference?: string;
      client_reference?: string;
    };
    event_data?: Array<{
      details?: Array<{
        time?: string;
        modified_time?: string;
      }>;
      object?: string;
    }>;
    request_id?: string;
  }>;
  mailagent_key?: string;
  webhook_request_id?: string;
}

async function handleZeptomailEvents(
  ctx: ActionCtx,
  payload: ZeptoMailWebhookPayload,
) {
  const eventNames = payload.event_name ?? [];
  const messages = payload.event_message ?? [];

  for (let i = 0; i < messages.length; i++) {
    try {
      const msg = messages[i];
      const eventName = eventNames[i] ?? "";
      const messageId = msg.email_info?.email_reference || msg.request_id;
      const clientReference = msg.email_info?.client_reference;
      if (!messageId && !clientReference) continue;

      const status =
        eventName === "email_open"
          ? "opened"
          : eventName === "email_link_click"
            ? "clicked"
            : eventName === "email_delivered" || eventName === "delivered"
              ? "delivered"
              : eventName === "hardbounce" || eventName === "softbounce"
                ? "bounced"
                : null;

      if (status) {
        const eventTimeStr = msg.event_data?.[0]?.details?.[0]?.time
          || msg.event_data?.[0]?.details?.[0]?.modified_time;
        const eventTime = eventTimeStr ? new Date(eventTimeStr).getTime() : undefined;

        await ctx.runMutation(internal.emails.updateStatusByZeptomailIdInternal, {
          zeptomail_message_id: messageId ?? "",
          client_reference: clientReference,
          status: status as "delivered" | "opened" | "clicked" | "bounced",
          opened_at:
            (eventName === "email_open" || eventName === "email_link_click") && eventTime
              ? eventTime
              : undefined,
        });
      }
    } catch (e) {
      console.error(`[ZeptoMail] Failed to process event ${i}:`, e);
    }
  }
  return new Response(null, { status: 200 });
}

// ─── Inbound email reply webhook ───────────────────────────────────────────────
http.route({
  path: "/webhooks/email-reply",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Shared-secret verification (set EMAIL_WEBHOOK_SECRET in Convex env vars)
    const secret = getOptionalEnv("EMAIL_WEBHOOK_SECRET");
    if (!secret) {
      console.warn("[Inbound Reply] Webhook not configured — ignoring.");
      return new Response("Webhook not configured", { status: 401 });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!timingSafeEqual(provided, secret)) {
      console.warn("[Inbound Reply] Invalid webhook secret. Rejecting.");
      return new Response("Unauthorized", { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    let body: Record<string, string | undefined> = {};

    if (contentType.includes("application/json")) {
      body = (await req.json()) as Record<string, string | undefined>;
    } else {
      const form = await req.formData();
      const parsed: Record<string, string | undefined> = {};
      form.forEach((value: FormDataEntryValue, key: string) => {
        parsed[key] = typeof value === "string" ? value : undefined;
      });
      body = parsed;
    }

    const rawReply = (body.raw_reply ?? body.text ?? body.html ?? "").trim();
    if (!rawReply) {
      return new Response("Missing reply body", { status: 400 });
    }

    let resolvedEmailId: Id<"emailsSent"> | undefined;
    let resolvedUniversityId: Id<"universities"> | undefined;
    let resolvedStakeholderId: Id<"stakeholders"> | undefined;

    const threadMessageId = getThreadMessageIdCandidate(body);
    if (threadMessageId) {
      try {
        const email = await ctx.runQuery(internal.emails.getInternal, {
          id: threadMessageId as Id<"emailsSent">,
        });
        if (email) {
          resolvedEmailId = email._id;
          resolvedUniversityId = email.university_id;
          resolvedStakeholderId = email.stakeholder_id;
        }
      } catch {
        // Fall back to sender/manual mapping below.
      }
    }

    if (!resolvedUniversityId && body.university_id) {
      try {
        const university = await ctx.runQuery(internal.universities.getInternal, {
          universityId: body.university_id as Id<"universities">,
        });
        if (university) {
          resolvedUniversityId = university._id;
        }
      } catch {
        // body.university_id is not a valid Convex ID or the record does not exist.
      }
    }
    if (!resolvedStakeholderId && body.stakeholder_id) {
      try {
        const stakeholder = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
          id: body.stakeholder_id as Id<"stakeholders">,
        });
        if (stakeholder) {
          resolvedStakeholderId = stakeholder._id;
        }
      } catch {
        // body.stakeholder_id is not a valid Convex ID or the record does not exist.
      }
    }

    if (!resolvedUniversityId || !resolvedStakeholderId) {
      const fromEmail = extractEmailAddress(
        body.from_email ?? body.from ?? body.sender,
      );
      if (fromEmail) {
        const stakeholder = await ctx.runQuery(
          internal.stakeholders.getByEmailInternal,
          {
            email: fromEmail,
          },
        );

        if (stakeholder) {
          resolvedUniversityId = stakeholder.university_id;
          resolvedStakeholderId = stakeholder._id;
        }
      }
    }

    if (!resolvedUniversityId || !resolvedStakeholderId) {
      console.warn("[Inbound Reply] Unable to resolve stakeholder/university", {
        from: body.from ?? body.from_email,
        hasThreadHint: !!threadMessageId,
      });
      return new Response("Unable to resolve stakeholder context", {
        status: 400,
      });
    }

    const replyId = await ctx.runMutation(internal.replies.insertInternal, {
      university_id: resolvedUniversityId,
      stakeholder_id: resolvedStakeholderId,
      email_id: resolvedEmailId,
      raw_reply: rawReply,
      received_at: Date.now(),
    });

    // Schedule reply classification action (Phase 4)
    await ctx.scheduler.runAfter(0, internal.actions.replyClassifier.classifyReplyInternal, {
      replyId: replyId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ─── Google Calendar push notification webhook (optional) ────────────────────
// Google Calendar sends sync notifications when watched events change.
// Enable by setting up a watch via the Google Calendar API.
http.route({
  path: "/webhooks/google-calendar",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    // Google Calendar push notifications include a channel token for verification
    const channelToken = req.headers.get("x-goog-channel-token") ?? "";
    const expectedToken = getOptionalEnv("GOOGLE_CALENDAR_WEBHOOK_TOKEN");
    if (!expectedToken) {
      console.warn("[GoogleCalendar] Webhook not configured — ignoring.");
      return new Response("Webhook not configured", { status: 401 });
    }

    if (!timingSafeEqual(channelToken, expectedToken)) {
      console.warn("[GoogleCalendar] Invalid channel token. Rejecting.");
      return new Response("Unauthorized", { status: 401 });
    }

    // The notification body is empty; we use the channel ID + resource state
    // to know *that* something changed, then poll the calendar for details.
    const channelId = req.headers.get("x-goog-channel-id") ?? "";
    const resourceState = req.headers.get("x-goog-resource-state") ?? "";

    console.log(
      `[GoogleCalendar] Push notification: channelId=${channelId}, state=${resourceState}`,
    );

    // Acknowledge immediately (per Google requirements)
    return new Response(null, { status: 200 });
  }),
});

// ─── Health Check ────────────────────────────────────────────────────────────
http.route({
  path: "/test/ping",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true, timestamp: Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ─── Real-World Pipeline Test Trigger ────────────────────────────────────────
// curl -X POST http://localhost:3001/api/test/run-pipeline \
//   -H "Content-Type: application/json" \
//   -d '{"universityName":"Anna University","state":"Tamil Nadu","stages":["ingestion","discovery","scraper","enrichment","scoring","outreach","reply","proposal"]}'
http.route({
  path: "/test/run-pipeline",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Test endpoints are disabled by default. Set DISABLE_TEST_ENDPOINTS=false
    // and provide TEST_WEBHOOK_SECRET to enable.
    const testEnabled = getOptionalEnv("DISABLE_TEST_ENDPOINTS") === "false";
    if (!testEnabled) {
      console.error("[Pipeline Test] Test endpoints are disabled. Forbidden.");
      return new Response("Forbidden", { status: 403 });
    }

    const secret = getOptionalEnv("TEST_WEBHOOK_SECRET");
    if (!secret) {
      console.error("[Pipeline Test] TEST_WEBHOOK_SECRET not configured.");
      return new Response("Unauthorized", { status: 401 });
    }
    const authHeader = req.headers.get("authorization") ?? "";
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!timingSafeEqual(provided, secret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const result = await ctx.runAction(internal.actions.realWorldVerify.runFullPipeline, {
      universityName: String(body.universityName || "Test University"),
      state: body.state ? String(body.state) : undefined,
      city: body.city ? String(body.city) : undefined,
      website: body.website ? String(body.website) : undefined,
      studentCount: typeof body.studentCount === "number" ? body.studentCount : undefined,
      type: body.type ? String(body.type) : undefined,
      naacGrade: body.naacGrade ? String(body.naacGrade) : undefined,
      stages: Array.isArray(body.stages)
        ? body.stages.filter(
            (s): s is string => typeof s === "string",
          )
        : undefined,
      cleanup: body.cleanup === true,
    });

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
