import { mutation, query, internalMutation } from "./_generated/server";
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
