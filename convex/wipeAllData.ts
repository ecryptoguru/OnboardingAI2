import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAdmin } from "./lib/auth_utils";

export const wipeEverything = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAdmin(ctx);

    // ── 1. Delete all related table records ────────────────────────────────
    const stakeholders = await ctx.db.query("stakeholders").collect();
    for (const s of stakeholders) {
      await ctx.db.delete(s._id);
    }

    const priorityScores = await ctx.db.query("priorityScores").collect();
    for (const s of priorityScores) {
      await ctx.db.delete(s._id);
    }

    const signals = await ctx.db.query("universitySignals").collect();
    for (const s of signals) {
      await ctx.db.delete(s._id);
    }

    const sequences = await ctx.db.query("outreachSequences").collect();
    for (const s of sequences) {
      await ctx.db.delete(s._id);
    }

    const emails = await ctx.db.query("emailsSent").collect();
    for (const e of emails) {
      await ctx.db.delete(e._id);
    }

    const replies = await ctx.db.query("replyLogs").collect();
    for (const r of replies) {
      await ctx.db.delete(r._id);
    }

    const proposals = await ctx.db.query("proposals").collect();
    for (const p of proposals) {
      await ctx.db.delete(p._id);
    }

    // ── 2. Reset enrichment fields on every university ──────────────────────
    const universities = await ctx.db.query("universities").collect();
    const now = Date.now();
    for (const u of universities) {
      await ctx.db.patch(u._id, {
        // NOTE: website and website_status are preserved —
        // re-discovering the official domain is expensive and rarely needed.
        lead_tier: undefined,
        outreach_stage: "new",
        address: undefined,
        zip_code: undefined,
        vc_name: undefined,
        registrar_name: undefined,
        student_count: undefined,
        demographics: undefined,
        notes: undefined,
        updated_at: now,
      });
    }

    return {
      success: true,
      universitiesReset: universities.length,
      stakeholdersDeleted: stakeholders.length,
      priorityScoresDeleted: priorityScores.length,
      signalsDeleted: signals.length,
      sequencesDeleted: sequences.length,
      emailsDeleted: emails.length,
      repliesDeleted: replies.length,
      proposalsDeleted: proposals.length,
    };
  },
});

/**
 * Internal mutation: wipe enrichment data for a SINGLE university.
 * Called by testEnrichmentLoop action for rapid iteration.
 */
export const wipeUniversityInternal = internalMutation({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    // Delete stakeholders
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.universityId))
      .collect();
    for (const s of stakeholders) {
      await ctx.db.delete(s._id);
    }

    // Delete signals
    const signals = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) => q.eq("university_id", args.universityId))
      .collect();
    for (const sig of signals) {
      await ctx.db.delete(sig._id);
    }

    // Delete priority scores
    const scores = await ctx.db
      .query("priorityScores")
      .withIndex("by_university", (q) => q.eq("university_id", args.universityId))
      .collect();
    for (const sc of scores) {
      await ctx.db.delete(sc._id);
    }

    // Reset university enrichment fields (keep website!)
    await ctx.db.patch(args.universityId, {
      lead_tier: undefined,
      outreach_stage: "new",
      address: undefined,
      zip_code: undefined,
      vc_name: undefined,
      registrar_name: undefined,
      student_count: undefined,
      demographics: undefined,
      notes: undefined,
      updated_at: Date.now(),
    });

    return {
      stakeholdersDeleted: stakeholders.length,
      signalsDeleted: signals.length,
      scoresDeleted: scores.length,
    };
  },
});
