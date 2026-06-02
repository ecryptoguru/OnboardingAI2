import { mutation } from "./_generated/server";

export const resetEnrichmentData = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Delete all Stakeholders
    const stakeholders = await ctx.db.query("stakeholders").collect();
    await Promise.all(stakeholders.map((s) => ctx.db.delete(s._id)));

    // 2. Delete all Priority Scores
    const scores = await ctx.db.query("priorityScores").collect();
    await Promise.all(scores.map((s) => ctx.db.delete(s._id)));

    // 3. Delete all University Signals
    const signals = await ctx.db.query("universitySignals").collect();
    await Promise.all(signals.map((s) => ctx.db.delete(s._id)));

    // 4. Reset University Fields
    const universities = await ctx.db.query("universities").collect();
    await Promise.all(universities.map((u) =>
      ctx.db.patch(u._id, {
        outreach_stage: "new",
        demographics: undefined,
        lead_tier: undefined,
        student_count: undefined,
        updated_at: Date.now()
      })
    ));

    return {
      deletedStakeholders: stakeholders.length,
      deletedScores: scores.length,
      deletedSignals: signals.length,
      resetUniversities: universities.length
    };
  }
});
