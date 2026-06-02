"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";

/**
 * Debug action: Wipe a single university's enrichment data,
 * run the full enrichment chain, and return a detailed report.
 * Use this to iterate quickly on extraction quality.
 */
interface StakeholderItem {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  email_source?: string;
  phone_source?: string;
  source?: string;
}

interface TestReport {
  university: string;
  website?: string;
  elapsedMs: number;
  enrichmentSteps: Record<string, boolean>;
  enrichmentSuccess: boolean;
  demographics: Record<string, unknown>;
  stakeholderSummary: Record<string, number>;
  stakeholders: StakeholderItem[];
}

export const wipeAndEnrich = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<TestReport | { error: string }> => {
    const t0 = Date.now();

    // ── 1. Get university details ──────────────────────────────────────────
    const university = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!university) return { error: "University not found" };
    const uniName: string = university.university_name;

    console.log(`[TestLoop] ====== STARTING: ${uniName} ======`);

    // ── 2. Wipe enrichment data for this university only ───────────────────
    console.log(`[TestLoop] Wiping enrichment data...`);
    const wipeResult: { stakeholdersDeleted: number; signalsDeleted: number; scoresDeleted: number } = await ctx.runMutation(
      internal.wipeAllData.wipeUniversityInternal,
      { universityId: args.universityId },
    );
    console.log(`[TestLoop] Wiped ${wipeResult.stakeholdersDeleted} stakeholders, ${wipeResult.signalsDeleted} signals, ${wipeResult.scoresDeleted} scores.`);

    // ── 3. Run full enrichment chain ─────────────────────────────────────
    console.log(`[TestLoop] Running enrichment chain...`);
    const enrichResult: { success: boolean; steps?: Record<string, boolean>; error?: string } = await ctx.runAction(
      api.actions.orchestrator.runEnrichmentChain,
      { universityId: args.universityId },
    );

    // ── 4. Fetch results ─────────────────────────────────────────────────
    const stakeholders: StakeholderItem[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: args.universityId },
    );

    const updatedUni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });

    const demo = (updatedUni as Record<string, unknown> | null)?.demographics ?? {};

    // ── 5. Build detailed report ───────────────────────────────────────────
    const report: TestReport = {
      university: uniName,
      website: (updatedUni as Record<string, unknown> | null)?.website as string | undefined,
      elapsedMs: Date.now() - t0,
      enrichmentSteps: enrichResult.steps ?? {},
      enrichmentSuccess: enrichResult.success,

      demographics: {
        total_students: (demo as Record<string, unknown>).total_students,
        total_students_male: (demo as Record<string, unknown>).total_students_male,
        total_students_female: (demo as Record<string, unknown>).total_students_female,
        day_scholars: (demo as Record<string, unknown>).day_scholars,
        day_scholars_male: (demo as Record<string, unknown>).day_scholars_male,
        day_scholars_female: (demo as Record<string, unknown>).day_scholars_female,
        hostelites: (demo as Record<string, unknown>).hostelites,
        hostelites_male: (demo as Record<string, unknown>).hostelites_male,
        hostelites_female: (demo as Record<string, unknown>).hostelites_female,
        nirf_total: (demo as Record<string, unknown>).nirf_total,
        data_quality: (demo as Record<string, unknown>).data_quality,
        source: (demo as Record<string, unknown>).source,
      },

      stakeholderSummary: {
        count: stakeholders.length,
        withEmail: stakeholders.filter((s: StakeholderItem) => s.email && s.email !== "null").length,
        withPhone: stakeholders.filter((s: StakeholderItem) => s.phone && s.phone !== "null").length,
        withLinkedIn: stakeholders.filter((s: StakeholderItem) => s.linkedin_url).length,
        withName: stakeholders.filter((s: StakeholderItem) => s.name).length,
        withRole: stakeholders.filter((s: StakeholderItem) => s.role).length,
      },

      stakeholders: stakeholders.map((s: StakeholderItem) => ({
        name: s.name,
        role: s.role,
        email: s.email,
        phone: s.phone,
        linkedin_url: s.linkedin_url,
        email_source: s.email_source,
        phone_source: s.phone_source,
        source: s.source,
      })),
    };

    console.log(`[TestLoop] ====== COMPLETED: ${uniName} ======`);
    console.log(`[TestLoop] Stakeholders: ${report.stakeholderSummary.count} (${report.stakeholderSummary.withEmail} emails, ${report.stakeholderSummary.withPhone} phones, ${report.stakeholderSummary.withLinkedIn} LinkedIn)`);
    console.log(`[TestLoop] Demographics: total=${report.demographics.total_students}, day=${report.demographics.day_scholars}, hostel=${report.demographics.hostelites}`);

    return report;
  },
});
