import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});

export const listByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});

// Returns all active sequences that are due (next_send_at <= now)
export const getDue = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_status_next_send", (q) =>
        q.eq("status", "active").lte("next_send_at", now)
      )
      .collect();
  },
});

export const create = mutation({
  args: {
    university_id: v.id("universities"),
    stakeholder_id: v.id("stakeholders"),
    total_steps: v.number(),
    next_send_at: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const now = Date.now();
    return await ctx.db.insert("outreachSequences", {
      ...args,
      status: "active",
      current_step: 1,
      created_at: now,
      updated_at: now,
    });
  },
});

export const advance = mutation({
  args: {
    id: v.id("outreachSequences"),
    next_send_at: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("opted_out")
    )),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    const seq = await ctx.db.get(id);
    if (!seq) return;

    await ctx.db.patch(id, {
      ...fields,
      current_step: seq.current_step + 1,
      updated_at: Date.now(),
    });
  },
});

export const pause = mutation({
  args: { id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, { status: "paused", updated_at: Date.now() });
  },
});

export const optOut = mutation({
  args: { id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, { status: "opted_out", updated_at: Date.now() });
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("outreachSequences") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const advanceInternal = internalMutation({
  args: {
    id: v.id("outreachSequences"),
    next_send_at: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("opted_out")
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    const seq = await ctx.db.get(id);
    if (!seq) return;

    await ctx.db.patch(id, {
      ...fields,
      current_step: seq.current_step + 1,
      updated_at: Date.now(),
    });
  },
});
export const enroll = mutation({
  args: {
    university_id: v.id("universities"),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    // 1. Find primary stakeholder
    const stakeholder = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .filter((q) => q.eq(q.field("is_primary"), true))
      .first();

    if (!stakeholder) {
      throw new ConvexError("No primary stakeholder found for this university.");
    }

    // 2. Check if sequence already exists
    const existing = await ctx.db
      .query("outreachSequences")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .filter((q) => q.eq(q.field("stakeholder_id"), stakeholder._id))
      .first();

    if (existing) {
      return existing._id;
    }

    // 3. Create sequence
    const now = Date.now();
    const sequenceId = await ctx.db.insert("outreachSequences", {
      university_id: args.university_id,
      stakeholder_id: stakeholder._id,
      status: "active",
      current_step: 1,
      total_steps: 4,
      next_send_at: now, // Send immediately (or schedule via action)
      created_at: now,
      updated_at: now,
    });

    // 4. Update university stage
    await ctx.db.patch(args.university_id, {
      outreach_stage: "sequencing",
      updated_at: now,
    });

    return sequenceId;
  },
});
