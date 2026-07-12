import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";
import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";

export const getByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();
  },
});

export const getByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .first();
  },
});

type UpsertScoreArgs = {
  university_id: Id<"universities">;
  deterministic_score: number;
  ai_score?: number;
  final_score: number;
  scoring_factors: {
    hostelite_score: number;
    student_scale_score: number;
    naac_score: number;
    agility_score: number;
    stakeholder_score: number;
    digital_signals_score: number;
    hostelites_inferred?: boolean;
  };
};

async function doUpsertScore(
  ctx: GenericMutationCtx<DataModel>,
  args: UpsertScoreArgs,
) {
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
}

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
    return await doUpsertScore(ctx, args);
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
    return await doUpsertScore(ctx, args);
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

    await doUpsertScore(ctx, scoreData);

    await ctx.db.patch(args.university_id, {
      lead_tier,
      outreach_stage: stage,
      updated_at: now,
    });
  },
});
