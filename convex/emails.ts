import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listBySequence = query({
  args: { sequence_id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailsSent")
      .withIndex("by_sequence", (q) => q.eq("sequence_id", args.sequence_id))
      .collect();
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const emails = await ctx.db.query("emailsSent").collect();
    return {
      total_sent: emails.filter((e) => e.status !== "queued" && e.status !== "failed").length,
      total_opened: emails.filter((e) => e.status === "opened" || e.status === "clicked").length,
      total_bounced: emails.filter((e) => e.status === "bounced").length,
    };
  },
});

export const getBySendgridId = query({
  args: { sendgrid_message_id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("emailsSent")
      .withIndex("by_sendgrid_id", (q) =>
        q.eq("sendgrid_message_id", args.sendgrid_message_id)
      )
      .first();
  },
});

export const create = mutation({
  args: {
    sequence_id: v.optional(v.id("outreachSequences")),
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    step_number: v.number(),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db.insert("emailsSent", {
      ...args,
      status: "queued",
    });
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("emailsSent"),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("queued"), v.literal("sent"), v.literal("delivered"),
      v.literal("opened"), v.literal("clicked"),
      v.literal("bounced"), v.literal("failed")
    ),
    sendgrid_message_id: v.optional(v.string()),
    sent_at: v.optional(v.number()),
    opened_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const updateStatusBySendgridId = mutation({
  args: {
    sendgrid_message_id: v.string(),
    status: v.union(
      v.literal("delivered"), v.literal("opened"),
      v.literal("clicked"), v.literal("bounced"), v.literal("failed")
    ),
    opened_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const email = await ctx.db
      .query("emailsSent")
      .withIndex("by_sendgrid_id", (q) =>
        q.eq("sendgrid_message_id", args.sendgrid_message_id)
      )
      .first();
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
    stakeholder_id: v.id("stakeholders"),
    subject: v.string(),
    body: v.string(),
    status: v.union(
      v.literal("pending_approval"),
      v.literal("queued"), v.literal("sent"), v.literal("delivered"),
      v.literal("opened"), v.literal("clicked"),
      v.literal("bounced"), v.literal("failed")
    ),
    step_number: v.number(),
    sent_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("emailsSent", args);
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
      v.literal("queued"), v.literal("sent"), v.literal("delivered"),
      v.literal("opened"), v.literal("clicked"),
      v.literal("bounced"), v.literal("failed")
    ),
    sent_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

// HITL Approval Queue Endpoints

export const listPending = query({
  args: {},
  handler: async (ctx) => {
    const pendingEmails = await ctx.db
      .query("emailsSent")
      .filter((q) => q.eq(q.field("status"), "pending_approval"))
      .collect();
      
    // Join with university and stakeholder
    return await Promise.all(
      pendingEmails.map(async (email) => {
        const uni = await ctx.db.get(email.university_id);
        const st = await ctx.db.get(email.stakeholder_id);
        return {
          ...email,
          university_name: uni?.university_name,
          stakeholder_email: st?.email,
          stakeholder_name: st?.name,
        };
      })
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
    await ctx.db.patch(id, { subject, body });
  },
});

export const rejectDraft = mutation({
  args: { id: v.id("emailsSent") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const email = await ctx.db.get(args.id);
    if (!email || email.status !== "pending_approval") return;
    
    await ctx.db.patch(args.id, { status: "failed" });
    
    // Resume sequence if applicable
    if (email.sequence_id) {
       await ctx.db.patch(email.sequence_id, { status: "paused" });
    }
  },
});
