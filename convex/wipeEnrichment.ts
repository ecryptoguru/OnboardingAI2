import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const wipeAll = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Wipe Demographics on Universities
    const unis = await ctx.db.query("universities").collect();
    for (const uni of unis) {
      if (uni.demographics !== undefined || uni.lead_tier !== undefined || uni.outreach_stage !== "new") {
        await ctx.db.patch(uni._id, {
          demographics: undefined,
          lead_tier: undefined,
          outreach_stage: "new",
        });
      }
    }

    // 2. Wipe ALL Signals
    const signals = await ctx.db.query("universitySignals").collect();
    for (const sig of signals) {
      await ctx.db.delete(sig._id);
    }

    // 3. Wipe Deep Enrichment / Serper Stakeholders
    const allSt = await ctx.db.query("stakeholders").collect();
    for (const st of allSt) {
      if (st.source === "deep_enrichment" || st.source === "serper") {
        await ctx.db.delete(st._id);
      }
    }

    // 4. Wipe Priority Scores (re-computed on enrichment anyway)
    const scores = await ctx.db.query("priorityScores").collect();
    for (const score of scores) {
       await ctx.db.delete(score._id);
    }

    return { success: true, unisWiped: unis.length, signalsDeleted: signals.length };
  },
});

// ── One-time cleanup: remove hostelites/day_scholars that exceed nirf_total ──
// Run this once after the sanity gate was introduced to clean stale bad data.
export const purgeBadDemographics = mutation({
  args: {},
  handler: async (ctx) => {
    const unis = await ctx.db.query("universities").collect();
    let fixed = 0;
    for (const uni of unis) {
      const demo = (uni as any).demographics;
      if (!demo) continue;

      const total: number | undefined =
        demo.total_students ?? demo.nirf_total;
      if (!total || total <= 0) continue;

      let needsPatch = false;
      const patch: Record<string, unknown> = { ...demo };

      if (demo.hostelites && demo.hostelites > total) {
        delete patch.hostelites;
        delete patch.hostelites_male;
        delete patch.hostelites_female;
        needsPatch = true;
      }
      if (demo.day_scholars && demo.day_scholars > total) {
        delete patch.day_scholars;
        delete patch.day_scholars_male;
        delete patch.day_scholars_female;
        needsPatch = true;
      }

      if (needsPatch) {
        await ctx.db.patch(uni._id, { demographics: patch, updated_at: Date.now() });
        fixed++;
      }
    }
    return { fixed, total: unis.length };
  },
});

export const resetSpecificUniversity = mutation({
  args: { nameKeyword: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("universities").collect();
    const uni = all.find(u => u.university_name.toLowerCase().includes(args.nameKeyword.toLowerCase()));
    
    if (!uni) return "University not found";

    // Revert demographics
    await ctx.db.patch(uni._id, {
      demographics: undefined,
      outreach_stage: "new",
      // Backdate updated_at so it bypasses the 30-day enrichment cooldown immediately
      updated_at: Date.now() - (35 * 24 * 60 * 60 * 1000)
    });

    // Delete associated stakeholders
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", q => q.eq("university_id", uni._id))
      .collect();

    for (const s of stakeholders) {
      await ctx.db.delete(s._id);
    }
    
    // Delete signals
    const signals = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", q => q.eq("university_id", uni._id))
      .collect();
    for (const sig of signals) {
      await ctx.db.delete(sig._id);
    }

    return `Reset enrichment data for ${uni.university_name} (${stakeholders.length} stakeholders, ${signals.length} signals deleted)`;
  }
});

export const clearSingleUniversityEnrichmentInternal = internalMutation({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    // Revert demographics and stage
    await ctx.db.patch(args.universityId, {
      demographics: undefined,
      outreach_stage: "enriching", // Since it's currently running
    });

    // Delete associated stakeholders from enrichment (only deep enrichment/serper)
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", q => q.eq("university_id", args.universityId))
      .collect();

    for (const s of stakeholders) {
      if (s.source === "deep_enrichment" || s.source === "serper") {
        await ctx.db.delete(s._id);
      }
    }
    
    // Delete signals
    const signals = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", q => q.eq("university_id", args.universityId))
      .collect();
    for (const sig of signals) {
      await ctx.db.delete(sig._id);
    }
  }
});
