import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const getByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();
  },
});

export const upsert = mutation({
  args: {
    university_id: v.id("universities"),
    deterministic_score: v.number(),
    ai_score: v.optional(v.number()),
    final_score: v.number(),
    scoring_factors: v.object({
      hostelite_score: v.number(),
      student_scale_score: v.number(),
      naac_score: v.number(),
      agility_score: v.number(),
      stakeholder_score: v.number(),
      digital_signals_score: v.number(),
      hostelites_inferred: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();

    const data = { ...args, scored_at: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("priorityScores", data);
  },
});

export const upsertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    deterministic_score: v.number(),
    ai_score: v.optional(v.number()),
    final_score: v.number(),
    scoring_factors: v.object({
      hostelite_score: v.number(),
      student_scale_score: v.number(),
      naac_score: v.number(),
      agility_score: v.number(),
      stakeholder_score: v.number(),
      digital_signals_score: v.number(),
      hostelites_inferred: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();

    const data = { ...args, scored_at: Date.now() };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    }
    return await ctx.db.insert("priorityScores", data);
  },
});

export const completeScoringInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    deterministic_score: v.number(),
    ai_score: v.optional(v.number()),
    final_score: v.number(),
    scoring_factors: v.object({
      hostelite_score: v.number(),
      student_scale_score: v.number(),
      naac_score: v.number(),
      agility_score: v.number(),
      stakeholder_score: v.number(),
      digital_signals_score: v.number(),
      hostelites_inferred: v.optional(v.boolean()),
    }),
    lead_tier: v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
    stage: v.union(
      v.literal("new"), v.literal("enriching"), v.literal("enriched"),
      v.literal("sequencing"), v.literal("outreach_active"), v.literal("replied"), 
      v.literal("meeting_booked"), v.literal("proposal_sent"), v.literal("closed"), v.literal("not_interested")
    ),
  },
  handler: async (ctx, args) => {
    const { lead_tier, stage, ...scoreData } = args;
    const now = Date.now();

    // 1. Update priority score
    const existing = await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();

    const data = { ...scoreData, scored_at: now };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("priorityScores", data);
    }

    // 2. Update university status
    await ctx.db.patch(args.university_id, {
      lead_tier: args.lead_tier,
      outreach_stage: args.stage,
      updated_at: now,
    });
  },
});
