import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { validateAuth } from "./lib/auth_utils";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();
  },
});

export const listByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();
  },
});

// Returns active sequences that are due (next_send_at <= now).
// Capped at 50 to avoid "too many system operations" timeout.
// The cron runs every minute, so backlog clears across multiple runs.
export const getDueInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("outreachSequences")
      .withIndex("by_status_next_send", (q) =>
        q.eq("status", "active").lte("next_send_at", now),
      )
      .take(50);
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
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("pending_approval"),
        v.literal("completed"),
        v.literal("opted_out"),
      ),
    ),
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
    await ctx.db.patch(args.id, {
      status: "opted_out",
      updated_at: Date.now(),
    });
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
      v.literal("pending_approval"),
      v.literal("completed"),
      v.literal("opted_out"),
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

export const resumeInternal = internalMutation({
  args: {
    id: v.id("outreachSequences"),
    next_send_at: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("completed")),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, {
      ...fields,
      updated_at: Date.now(),
    });
  },
});

async function doEnroll(
  ctx: GenericMutationCtx<DataModel>,
  args: { university_id: Id<"universities">; stakeholder_id?: Id<"stakeholders"> },
) {
  let stakeholder = null;

  if (args.stakeholder_id) {
    stakeholder = await ctx.db.get(args.stakeholder_id);
  }

  if (!stakeholder) {
    // 1. Find primary stakeholder or fallback to any valid stakeholder
    stakeholder = await ctx.db
      .query("stakeholders")
      .withIndex("by_university_primary", (q) =>
        q.eq("university_id", args.university_id).eq("is_primary", true),
      )
      .first();
  }

  if (!stakeholder) {
    // Fallback: get the first stakeholder with an email
    const allStakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    stakeholder =
      allStakeholders.find(
        (s) =>
          s.email &&
          s.email.trim() !== "" &&
          s.email.trim().toLowerCase() !== "null",
      ) ?? null;
  }

  if (!stakeholder) {
    throw new ConvexError(
      "No valid stakeholder found for this university with a valid email address.",
    );
  }

  // 2. Check if sequence already exists
  const existing = await ctx.db
    .query("outreachSequences")
    .withIndex("by_university", (q) =>
      q.eq("university_id", args.university_id),
    )
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
    next_send_at: now,
    created_at: now,
    updated_at: now,
  });

  // 4. Schedule the first email immediately — this is what kicks off the outreach pipeline
  await ctx.scheduler.runAfter(0, api.actions.outreach.processSequenceStep, {
    sequenceId,
  });

  return sequenceId;
}

export const enroll = mutation({
  args: {
    university_id: v.id("universities"),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await doEnroll(ctx, args);
  },
});

export const enrollInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholder_id: v.optional(v.id("stakeholders")),
  },
  handler: async (ctx, args) => {
    return await doEnroll(ctx, args);
  },
});
