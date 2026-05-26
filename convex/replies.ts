import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const list = query({
  args: {},
  handler: async (ctx, args) => {
    const logs = await ctx.db.query("replyLogs").order("desc").take(50);
    return await Promise.all(
      logs.map(async (log) => {
        const uni = await ctx.db.get(log.university_id);
        return { ...log, university_name: uni?.university_name ?? "Unknown" };
      }),
    );
  },
});

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("replyLogs")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    email_id: v.optional(v.id("emailsSent")),
    raw_reply: v.string(),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db.insert("replyLogs", {
      ...args,
      received_at: Date.now(),
    });
  },
});

export const classify = internalMutation({
  args: {
    id: v.id("replyLogs"),
    classification: v.union(
      v.literal("meeting_request"),
      v.literal("positive_interest"),
      v.literal("request_info"),
      v.literal("not_interested"),
      v.literal("opt_out"),
      v.literal("out_of_office"),
      v.literal("other"),
    ),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, classified_at: Date.now() });
  },
});

export const insertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    email_id: v.optional(v.id("emailsSent")),
    raw_reply: v.string(),
    received_at: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("replyLogs", args);
  },
});

export const updateClassificationInternal = internalMutation({
  args: {
    id: v.id("replyLogs"),
    classification: v.union(
      v.literal("meeting_request"),
      v.literal("positive_interest"),
      v.literal("request_info"),
      v.literal("not_interested"),
      v.literal("opt_out"),
      v.literal("out_of_office"),
      v.literal("other"),
    ),
    action_taken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});
export const getInternal = internalQuery({
  args: { id: v.id("replyLogs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
