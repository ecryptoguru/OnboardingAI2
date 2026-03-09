import { httpRouter } from "convex/server";
import { httpAction, ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { auth } from "./auth";
/** Verifies HMAC-SHA256 signature. Returns true if valid. */
async function verifyHmac(secret: string, payload: string, signature: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const sigHex = signature.replace(/^v1=/, "");
    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    
    return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
  } catch {
    return false;
  }
}

const http = httpRouter();

// ─── Convex Auth routes (sign-in, sign-out, session) ──────────────────────────
auth.addHttpRoutes(http);

// ─── SendGrid delivery event webhook ─────────────────────────────────────────
http.route({
  path: "/webhooks/sendgrid",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Signature verification (optional — enable by setting SENDGRID_WEBHOOK_SECRET)
    const secret = process.env.SENDGRID_WEBHOOK_SECRET;
    if (secret) {
      const rawBody = await req.text();
      const sig = req.headers.get("x-sendgrid-signature-v1") ?? "";
      if (!(await verifyHmac(secret, rawBody, sig))) {
        console.warn("[SendGrid] Invalid signature. Rejecting webhook.");
        return new Response("Unauthorized", { status: 401 });
      }
      // Re-parse from text since body was consumed above
      const events = JSON.parse(rawBody) as Array<{ event: string; sg_message_id?: string; timestamp?: number }>;
      return handleSendGridEvents(ctx, events);
    }

    // No secret configured — accept all (dev mode)
    const events = await req.json() as Array<{ event: string; sg_message_id?: string; timestamp?: number }>;
    return handleSendGridEvents(ctx, events);
  }),
});

async function handleSendGridEvents(ctx: ActionCtx, events: Array<{ event: string; sg_message_id?: string; timestamp?: number }>) {
  for (const event of events) {
    if (!event.sg_message_id) continue;
    const messageId = event.sg_message_id.split(".")[0];
    const status = event.event === "open" ? "opened"
      : event.event === "click" ? "clicked"
      : event.event === "bounce" ? "bounced"
      : event.event === "delivered" ? "delivered"
      : null;
    if (status) {
      await ctx.runMutation(api.emails.updateStatusBySendgridId, {
        sendgrid_message_id: messageId,
        status: status as "opened" | "clicked" | "bounced" | "delivered",
        opened_at: event.event === "open" && event.timestamp ? event.timestamp * 1000 : undefined,
      });
    }
  }
  return new Response(null, { status: 200 });
}

// ─── Inbound email reply webhook ───────────────────────────────────────────────
http.route({
  path: "/webhooks/email-reply",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.json() as {
      university_id?: string;
      stakeholder_id?: string;
      raw_reply: string;
    };

    if (!body.raw_reply || !body.university_id || !body.stakeholder_id) {
      return new Response("Missing fields", { status: 400 });
    }

    // Insert the raw reply — classification runs as a scheduled action
    const replyId = await ctx.runMutation(api.replies.create, {
      university_id: body.university_id as Id<"universities">,
      stakeholder_id: body.stakeholder_id as Id<"stakeholders">,
      raw_reply: body.raw_reply,
    });

    // Schedule reply classification action (Phase 4)
    await ctx.scheduler.runAfter(0, api.actions.replyClassifier.classifyReply, {
      replyId: replyId,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

// ─── Calendly meeting booked webhook ─────────────────────────────────────────
http.route({
  path: "/webhooks/calendly",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // Signature verification (set CALENDLY_WEBHOOK_SECRET in Convex env vars)
    const secret = process.env.CALENDLY_WEBHOOK_SECRET;
    let body: Record<string, unknown>;
    if (secret) {
      const rawBody = await req.text();
      const sig = req.headers.get("calendly-webhook-signature") ?? "";
      if (!(await verifyHmac(secret, rawBody, sig))) {
        console.warn("[Calendly] Invalid signature. Rejecting webhook.");
        return new Response("Unauthorized", { status: 401 });
      }
      body = JSON.parse(rawBody);
    } else {
      body = await req.json();
    }

    const payload = body.payload as {
      invitee?: { email?: string };
      event_start_time?: string;
    };
    
    if (body.event !== "invitee.created" || !payload) {
      return new Response(null, { status: 200 });
    }

    const inviteeEmail = payload.invitee?.email;
    if (!inviteeEmail) return new Response(null, { status: 200 });

    const startTime = payload.event_start_time
      ? new Date(payload.event_start_time).getTime()
      : Date.now();

    const stakeholder = await ctx.runQuery(internal.stakeholders.getByEmailInternal, {
      email: inviteeEmail as string,
    });

    if (stakeholder) {
      console.log(`[Calendly] Meeting booked for ${inviteeEmail}. Triggering proposal...`);

      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: stakeholder.university_id,
        stage: "meeting_booked",
      });

      const proposalId = await ctx.runMutation(api.proposals.create, {
        university_id: stakeholder.university_id,
        meeting_date: startTime,
      });

      await ctx.scheduler.runAfter(0, (api.actions as any).proposals.generateProposal, {
        universityId: stakeholder.university_id,
        proposalId,
      });
    } else {
      console.warn(`[Calendly] No stakeholder found for email: ${inviteeEmail}`);
    }

    return new Response(null, { status: 200 });
  }),
});

export default http;
