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
    await validateAuth(ctx);
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

// ─── Migration: remove legacy scoring factor fields from old records ──────────
// Legacy fields (student_count_score, digital_presence_score, news_activity_score,
// location_score) are no longer written, but old documents may still contain them.
// Run this mutation in batches from the Convex dashboard or CLI until `done` is true.

export const CURRENT_SCORING_FACTOR_KEYS = [
  "hostelite_score",
  "student_scale_score",
  "naac_score",
  "agility_score",
  "stakeholder_score",
  "digital_signals_score",
  "hostelites_inferred",
] as const;

type CleanedScoringFactors = {
  hostelite_score?: number;
  student_scale_score?: number;
  naac_score?: number;
  agility_score?: number;
  stakeholder_score?: number;
  digital_signals_score?: number;
  hostelites_inferred?: boolean;
};

export function cleanScoringFactors(input: Record<string, unknown>): CleanedScoringFactors {
  const out: CleanedScoringFactors = {};
  for (const key of CURRENT_SCORING_FACTOR_KEYS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (key === "hostelites_inferred") {
      if (typeof value === "boolean") out[key] = value;
    } else if (typeof value === "number") {
      (out as Record<string, number | boolean | undefined>)[key] = value;
    }
  }
  return out;
}

export const cleanupLegacyScoringFactors = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    const page = await ctx.db
      .query("priorityScores")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    let cleaned = 0;
    for (const score of page.page) {
      const factors = score.scoring_factors as Record<string, unknown>;
      const hasLegacyField = Object.keys(factors).some(
        (key) => !(CURRENT_SCORING_FACTOR_KEYS as readonly string[]).includes(key),
      );
      if (hasLegacyField) {
        await ctx.db.patch(score._id, { scoring_factors: cleanScoringFactors(factors) });
        cleaned++;
      }
    }

    return {
      done: page.isDone,
      continueCursor: page.continueCursor,
      cleaned,
    };
  },
});
