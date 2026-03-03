import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

// ─── Convex Auth routes (sign-in, sign-out, session) ──────────────────────────
auth.addHttpRoutes(http);

// ─── SendGrid delivery event webhook ─────────────────────────────────────────
http.route({
  path: "/webhooks/sendgrid",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    // SendGrid sends an array of events
    const events = await req.json() as Array<{
      event: string;
      sg_message_id?: string;
      timestamp?: number;
    }>;

    for (const event of events) {
      if (!event.sg_message_id) continue;
      const messageId = event.sg_message_id.split(".")[0]; // strip suffix

      const status = event.event === "open" ? "opened"
        : event.event === "click" ? "clicked"
        : event.event === "bounce" ? "bounced"
        : event.event === "delivered" ? "delivered"
        : null;

      if (status) {
        await ctx.runMutation(api.emails.updateStatusBySendgridId, {
          sendgrid_message_id: messageId,
          status: status as any,
          opened_at: event.event === "open" && event.timestamp
            ? event.timestamp * 1000
            : undefined,
        });
      }
    }

    return new Response(null, { status: 200 });
  }),
});

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
      university_id: body.university_id as any,
      stakeholder_id: body.stakeholder_id as any,
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
    const body = await req.json() as any;

    if (body.event !== "invitee.created" || !body.payload) {
      return new Response(null, { status: 200 });
    }

    // Phase 5: schedule proposal generation
    const inviteeEmail = body.payload.invitee?.email;
    if (!inviteeEmail) return new Response(null, { status: 200 });

    const startTime = body.payload.event_start_time 
      ? new Date(body.payload.event_start_time).getTime() 
      : Date.now();

    // Import internal to access internal queries/mutations
    const { internal } = await import("./_generated/api");

    // 1. Find the university/stakeholder
    const stakeholder = await ctx.runQuery(internal.stakeholders.getByEmailInternal, {
      email: inviteeEmail,
    });

    if (stakeholder) {
      console.log(`[Calendly] Meeting booked for ${inviteeEmail}. Triggering proposal...`);
      
      // 2. Update University Stage
      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: stakeholder.university_id,
        stage: "meeting_booked",
      });

      // 3. Create Proposal Record
      const { api: dynamicApi } = await import("./_generated/api");
      const proposalId = await ctx.runMutation(dynamicApi.proposals.create, {
        university_id: stakeholder.university_id,
        meeting_date: startTime,
      });

      // 4. Schedule AI Proposal Generation
      await ctx.scheduler.runAfter(0, (dynamicApi.actions as any).proposals.generateProposal, {
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
