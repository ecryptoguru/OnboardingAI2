"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import * as Sentry from "@sentry/nextjs";

/**
 * Verification action to confirm optimizations:
 * 1. Batch stakeholder insertions
 * 2. Consolidated scoring updates
 */
export const runVerification = action({
  args: {},
  handler: async (ctx): Promise<any> => {
    console.log("[Verification] Starting optimization verification...");

    // 1. Setup Test Data
    const universityId = await ctx.runMutation(api.universities.create, {
      university_name: "Verification Test University",
      student_count: 1000,
      type: "private",
    });
    console.log(`[Verification] Created test university: ${universityId}`);

    try {
      // 2. Test Bulk Stakeholder Insertion
      console.log("[Verification] Testing bulkInsertInternal...");
      const testStakeholders = [
        { name: "John Doe", role: "Chancellor", email: "john@example.edu" },
        { name: "Jane Smith", role: "Registrar", email: "jane@example.edu" },
      ];
      await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
        university_id: universityId,
        stakeholders: testStakeholders,
        source: "verification_test",
      });
      console.log("[Verification] Bulk insertion complete.");

      // 3. Test Consolidated Scoring
      console.log("[Verification] Testing completeScoringInternal...");
      await ctx.runMutation(internal.priorityScores.completeScoringInternal, {
        university_id: universityId,
        deterministic_score: 85,
        ai_score: 9,
        final_score: 87,
        scoring_factors: {
          student_count_score: 20,
          naac_score: 25,
          digital_presence_score: 15,
          news_activity_score: 15,
          location_score: 10,
        },
        lead_tier: "High",
        stage: "enriched",
      });
      console.log("[Verification] Consolidated scoring complete.");

      // 4. Verify Results
      console.log("[Verification] Checking results...");
      const stakeholders: any[] = await ctx.runQuery(internal.stakeholders.getByUniversityInternal, { 
        university_id: universityId 
      });
      
      const uni = await ctx.runQuery(internal.universities.getInternal, { universityId });
      const scores = await ctx.runQuery(api.priorityScores.getByUniversity, { university_id: universityId });

      const results: any = {
        stakeholderCount: stakeholders.length,
        leadTier: uni?.lead_tier,
        outreachStage: uni?.outreach_stage,
        finalScore: scores?.final_score,
      };

      console.log("[Verification] Results:", results);

      if (results.stakeholderCount === 2 && 
          results.leadTier === "High" && 
          results.outreachStage === "enriched" &&
          results.finalScore === 87) {
        console.log("[Verification] ✅ ALL OPTIMIZATIONS VERIFIED SUCCESSFULLY");
        return { success: true, results };
      } else {
        console.warn("[Verification] ❌ Verification failed - results mismatch");
        return { success: false, results };
      }

    } catch (e) {
      console.error("[Verification] ❌ Error during verification:", e);
      Sentry.captureException(e);
      return { success: false, error: String(e) };
    }
  },
});
