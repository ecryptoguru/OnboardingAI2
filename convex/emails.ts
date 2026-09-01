import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import {
  validateAuth,
  getCurrentUserId,
  isAdmin,
} from "./lib/auth_utils";
import { claimEmailStatus, canFinalizeEmailSend, canReleaseEmailSend, canFailEmailSend } from "./lib/sendState";
import {
  validateBodyLength,
  validateSubjectLength,
} from "./lib/limits";
import { Id } from "./_generated/dataModel";

const MAX_ANALYTICS_ROWS = 5000;

export const listBySequence = query({
  args: { sequence_id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("emailsSent")
      .withIndex("by_sequence", (q) => q.eq("sequence_id", args.sequence_id))
      .take(MAX_ANALYTICS_ROWS);
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    // Use parallel index-scoped queries instead of full-table scan.
    const [, , opened, clicked, bounced] = await Promise.all([
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "queued"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "opened"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "clicked"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "bounced"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
    ]);

    // total_sent counts all dispatched emails (sent, delivered, opened, clicked, bounced)
    // queued and failed are intentionally excluded from this metric.
    // For accuracy, also fetch sent and delivered separately.
    const [sent, delivered] = await Promise.all([
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "sent"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "delivered"))
        .take(MAX_ANALYTICS_ROWS)
        .then((r) => r.length),
    ]);

    const total_sent = sent + delivered + opened + clicked + bounced;
    const total_opened = opened + clicked;
    return { total_sent, total_opened, total_bounced: bounced };
  },
});

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const emails = await ctx.db
      .query("emailsSent")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .order("desc")
      .take(MAX_ANALYTICS_ROWS);
    return await Promise.all(
      emails.map(async (e) => {
        const st = e.stakeholder_id ? await ctx.db.get(e.stakeholder_id) : null;
        return {
          ...e,
          stakeholder_name: st?.name,
          stakeholder_email: st?.email ?? e.recipient_email,
          stakeholder_role: st?.role,
        };
      }),
    );
  },
});

export const getDetailedStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    // Use index query with a safety cap to prevent OOM at massive scale.
    const emails = await ctx.db
      .query("emailsSent")
      .withIndex("by_step_number")
      .take(MAX_ANALYTICS_ROWS);

    const byStep: Record<
      number,
      { sent: number; opened: number; clicked: number; bounced: number }
    > = {};
    for (const e of emails) {
      if (!byStep[e.step_number])
        byStep[e.step_number] = { sent: 0, opened: 0, clicked: 0, bounced: 0 };
      if (
        e.status === "sent" ||
        e.status === "delivered" ||
        e.status === "opened" ||
        e.status === "clicked"
      )
        byStep[e.step_number].sent++;
      if (e.status === "opened" || e.status === "clicked")
        byStep[e.step_number].opened++;
      if (e.status === "clicked") byStep[e.step_number].clicked++;
      if (e.status === "bounced") byStep[e.step_number].bounced++;
    }
    return byStep;
  },
});

export const getByZeptomailId = query({
  args: { zeptomail_message_id: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("emailsSent")
      .withIndex("by_zeptomail_id", (q) =>
        q.eq("zeptomail_message_id", args.zeptomail_message_id),
      )
      .first();
  },
});

export const create = mutation({
  args: {
    sequence_id: v.optional(v.id("outreachSequences")),
    university_id: v.id("universities"),
    stakeholder_id: v.optional(v.id("stakeholders")),
    recipient_email: v.optional(v.string()),
    step_number: v.number(),
    subject: v.string(),
    body: v.string(),
    html_body: v.optional(v.string()),
    document_storage_id: v.optional(v.id("_storage")),
    attachments: v.optional(
      v.array(
        v.object({
          storage_id: v.id("_storage"),
          filename: v.string(),
          mime_type: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    // Enforce the same operational limits the UI applies (defense in depth
    // against oversized client payloads).
    const subjectError = validateSubjectLength(args.subject);
    if (subjectError) throw new Error(subjectError);
    const bodyError = validateBodyLength(args.body);
    if (bodyError) throw new Error(bodyError);
    const owner_id = await getCurrentUserId(ctx);
    return await ctx.db.insert("emailsSent", {
      ...args,
      owner_id,
      status: "queued",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("emailsSent"),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("sending"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    zeptomail_message_id: v.optional(v.string()),
    sent_at: v.optional(v.number()),
    opened_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    const email = await ctx.db.get(id);
    if (!email) throw new Error("Email not found");
    const userId = await getCurrentUserId(ctx);
    const admin = await isAdmin(ctx);
    if (!admin && (email.owner_id === undefined || email.owner_id !== userId)) {
      throw new Error("Forbidden: Not your email");
    }
    await ctx.db.patch(id, fields);
  },
});

export const updateStatusByZeptomailId = mutation({
  args: {
    zeptomail_message_id: v.string(),
    status: v.union(
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    opened_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const email = await ctx.db
      .query("emailsSent")
      .withIndex("by_zeptomail_id", (q) =>
        q.eq("zeptomail_message_id", args.zeptomail_message_id),
      )
      .first();
    if (!email) return;
    const userId = await getCurrentUserId(ctx);
    const admin = await isAdmin(ctx);
    if (!admin && (email.owner_id === undefined || email.owner_id !== userId)) {
      throw new Error("Forbidden: Not your email");
    }
    await ctx.db.patch(email._id, {
      status: args.status,
      opened_at: args.opened_at,
    });
  },
});

export const updateStatusByZeptomailIdInternal = internalMutation({
  args: {
    zeptomail_message_id: v.string(),
    client_reference: v.optional(v.string()),
    status: v.union(
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    opened_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let email = null;

    // 1. Try matching by zeptomail_message_id (stores request_id from API response)
    if (args.zeptomail_message_id) {
      email = await ctx.db
        .query("emailsSent")
        .withIndex("by_zeptomail_id", (q) =>
          q.eq("zeptomail_message_id", args.zeptomail_message_id),
        )
        .first();
    }

    // 2. Try converting email_reference to request_id format
    //    email_reference: "xxx.m1.UUID@domain" → request_id: "xxx.t1.UUID"
    if (!email && args.zeptomail_message_id) {
      const requestIdFromEmailRef = args.zeptomail_message_id
        .replace(/\.m1\./, ".t1.")
        .replace(/@[^@]+$/, "");
      if (requestIdFromEmailRef !== args.zeptomail_message_id) {
        email = await ctx.db
          .query("emailsSent")
          .withIndex("by_zeptomail_id", (q) =>
            q.eq("zeptomail_message_id", requestIdFromEmailRef),
          )
          .first();
      }
    }

    // 3. Try matching by client_reference (Convex document ID)
    if (!email && args.client_reference) {
      email = await ctx.db.get(args.client_reference as Id<"emailsSent">);
    }

    if (!email) return;
    await ctx.db.patch(email._id, {
      status: args.status,
      opened_at: args.opened_at,
    });
  },
});

export const insertInternal = internalMutation({
  args: {
    sequence_id: v.optional(v.id("outreachSequences")),
    university_id: v.id("universities"),
    stakeholder_id: v.optional(v.id("stakeholders")),
    recipient_email: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    html_body: v.optional(v.string()),
    document_storage_id: v.optional(v.id("_storage")),
    attachments: v.optional(
      v.array(
        v.object({
          storage_id: v.id("_storage"),
          filename: v.string(),
          mime_type: v.string(),
        }),
      ),
    ),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("sending"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    // Deprecated: ZeptoMail migration complete. Use zeptomail_message_id for new emails.
    sendgrid_message_id: v.optional(v.string()),
    zeptomail_message_id: v.optional(v.string()),
    owner_id: v.optional(v.id("users")),
    step_number: v.number(),
    drafted_at: v.optional(v.number()),
    sent_at: v.optional(v.number()),
    send_attempts: v.optional(v.number()),
    last_error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailsSent", args);
  },
});

export const listBySequenceInternal = internalQuery({
  args: { sequence_id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailsSent")
      .withIndex("by_sequence", (q) => q.eq("sequence_id", args.sequence_id))
      .take(MAX_ANALYTICS_ROWS);
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("emailsSent") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateStatusInternal = internalMutation({
  args: {
    id: v.id("emailsSent"),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("sending"),
      v.literal("queued"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("opened"),
      v.literal("clicked"),
      v.literal("bounced"),
      v.literal("failed"),
    ),
    zeptomail_message_id: v.optional(v.string()),
    sent_at: v.optional(v.number()),
    last_error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

/**
 * Atomically claim a `pending_approval` draft for sending.
 * Only one concurrent caller can win; terminal statuses are never re-sent.
 * Returns the full email document to the caller so the action can proceed
 * without a second read.
 */
export const claimForSendingInternal = internalMutation({
  args: { id: v.id("emailsSent") },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email) return { claimed: false as const, reason: "not_pending", email: null };
    const decision = claimEmailStatus(email.status);
    if (!decision.allowed) {
      return { claimed: false as const, reason: decision.reason, email };
    }
    await ctx.db.patch(args.id, {
      status: "sending",
      send_attempts: (email.send_attempts ?? 0) + 1,
      last_error: undefined,
    });
    return { claimed: true as const, reason: "ok", email };
  },
});

/** Finalize a claimed email as successfully sent. */
export const finalizeSentInternal = internalMutation({
  args: {
    id: v.id("emailsSent"),
    zeptomail_message_id: v.optional(v.string()),
    sent_at: v.number(),
  },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email || !canFinalizeEmailSend(email.status)) return;
    await ctx.db.patch(args.id, {
      status: "sent",
      zeptomail_message_id: args.zeptomail_message_id,
      sent_at: args.sent_at,
    });
  },
});

/** Release a claimed email back to the approval queue after a transient failure. */
export const releaseForRetryInternal = internalMutation({
  args: { id: v.id("emailsSent"), error: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email || !canReleaseEmailSend(email.status)) return;
    await ctx.db.patch(args.id, {
      status: "pending_approval",
      last_error: args.error,
    });
  },
});

/** Mark a claimed email as permanently failed (no silent queue loss). */
export const failPermanentlyInternal = internalMutation({
  args: { id: v.id("emailsSent"), error: v.string() },
  handler: async (ctx, args) => {
    const email = await ctx.db.get(args.id);
    if (!email || !canFailEmailSend(email.status)) return;
    await ctx.db.patch(args.id, {
      status: "failed",
      last_error: args.error,
    });
  },
});

// HITL Approval Queue Endpoints
//
// The queue surfaces `pending_approval` AND transient `sending` records so a
// claimed draft stays visible with a "Sending…" state instead of vanishing
// mid-flight (and so concurrent tabs see it is already in flight).

async function listQueueEmails(
  ctx: QueryCtx,
  admin: boolean,
  userId: Id<"users">,
) {
  if (admin) {
    const [pending, sending] = await Promise.all([
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "pending_approval"))
        .take(MAX_ANALYTICS_ROWS),
      ctx.db
        .query("emailsSent")
        .withIndex("by_status", (q) => q.eq("status", "sending"))
        .take(MAX_ANALYTICS_ROWS),
    ]);
    return [...sending, ...pending];
  }
  const [pending, sending] = await Promise.all([
    ctx.db
      .query("emailsSent")
      .withIndex("by_owner_status", (q) =>
        q.eq("owner_id", userId).eq("status", "pending_approval"),
      )
      .take(MAX_ANALYTICS_ROWS),
    ctx.db
      .query("emailsSent")
      .withIndex("by_owner_status", (q) =>
        q.eq("owner_id", userId).eq("status", "sending"),
      )
      .take(MAX_ANALYTICS_ROWS),
  ]);
  return [...sending, ...pending];
}

export const pendingCount = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const admin = await isAdmin(ctx);
    const userId = await getCurrentUserId(ctx);
    const queue = await listQueueEmails(ctx, admin, userId);
    return queue.length;
  },
});

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const admin = await isAdmin(ctx);
    const userId = await getCurrentUserId(ctx);
    const queue = await listQueueEmails(ctx, admin, userId);
    return await Promise.all(
      queue.map(async (email) => {
        const uni = await ctx.db.get(email.university_id);
        const st = email.stakeholder_id
          ? await ctx.db.get(email.stakeholder_id)
          : null;
        return {
          ...email,
          university_name: uni?.university_name,
          stakeholder_email: st?.email ?? email.recipient_email,
          stakeholder_name: st?.name,
        };
      }),
    );
  },
});

export const updateDraft = mutation({
  args: {
    id: v.id("emailsSent"),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, subject, body } = args;
    const subjectError = validateSubjectLength(subject);
    if (subjectError) throw new Error(subjectError);
    const bodyError = validateBodyLength(body);
    if (bodyError) throw new Error(bodyError);
    const email = await ctx.db.get(id);
    if (!email) throw new Error("Email not found");
    const userId = await getCurrentUserId(ctx);
    const admin = await isAdmin(ctx);
    if (!admin && (email.owner_id === undefined || email.owner_id !== userId)) {
      throw new Error("Forbidden: Not your draft");
    }
    if (email.status !== "pending_approval") {
      throw new Error("Can only edit pending drafts");
    }
    await ctx.db.patch(id, { subject, body });
  },
});

export const rejectDraft = mutation({
  args: { id: v.id("emailsSent") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const email = await ctx.db.get(args.id);
    if (!email || email.status !== "pending_approval") {
      throw new Error("Draft not found or not pending approval");
    }

    const userId = await getCurrentUserId(ctx);
    const admin = await isAdmin(ctx);
    if (!admin && (email.owner_id === undefined || email.owner_id !== userId)) {
      throw new Error("Forbidden: Not your draft");
    }

    await ctx.db.patch(args.id, { status: "failed" });

    // Resume sequence if applicable
    if (email.sequence_id) {
      await ctx.db.patch(email.sequence_id, { status: "paused" });
    }
  },
});

// NOTE: This is a capped count for the dashboard. Once a university has more
// than MAX_ANALYTICS_ROWS emails, this returns the cap and `capped: true`.
// The long-term fix is a per-university counter table or pagination.
export const countByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const rows = await ctx.db
      .query("emailsSent")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .take(MAX_ANALYTICS_ROWS);
    return { count: rows.length, capped: rows.length >= MAX_ANALYTICS_ROWS };
  },
});
