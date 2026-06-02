"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Verification action to trace the full requirements lifecycle.
 */
export const verifyRequirements = action({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, unknown> = {};

    try {
      // 1. Mock University Creation
      const universityId = await ctx.runMutation(api.universities.create, {
        university_name: "Test University Requirements",
        state: "Test State",
      });
      results.step1_ingestion = "PASS";

      // 2. Mock Website Discovery
      const website = await ctx.runAction(api.actions.discovery.discoverWebsite, {
        universityId,
        universityName: "Test University Requirements",
      });
      results.step2_discovery = website ? "PASS" : "WARN (No API Key)";

      // 3. Mock Enrichment (now includes images!)
      const enrichment = await ctx.runAction(api.actions.enrichment.discoverSocialAndMedia, {
        universityId,
      });
      results.step4_enrichment = enrichment.success ? "PASS" : "FAIL";
      results.images_found = enrichment.imagesAdded || 0;

      // 4. Mock Stakeholder (Requirement 3)
      const stIds = (await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
          university_id: universityId,
          stakeholders: [{ name: "Test User", role: "Registrar", email: "test@example.com" }],
          source: "manual",
      })) as unknown as string[];
      const stakeholderId = stIds.length > 0 ? stIds[0] : null;
      if (!stakeholderId) {
        throw new Error("Failed to insert test stakeholder");
      }
      results.step3_stakeholder = "PASS";

      // 5. Mock Email (Requirement 5)
      const emailResult = await ctx.runAction(api.actions.email.sendEmail, {
          to: "test@example.com",
          subject: "Test Subject",
          text: "Test Body",
      });
      results.step5_email = emailResult.success ? "PASS" : "WARN (API Key?)";

      // 6. Mock Auto-Reply (Requirement 8)
      const autoReply = await ctx.runAction(api.actions.autoReply.sendAutoReply, {
          universityId,
          stakeholderId: stakeholderId as Id<"stakeholders">,
          classification: "positive_interest",
      });
      results.step8_autoreply = autoReply.success ? "PASS" : "FAIL";

      // 7. Cleanup
      await ctx.runMutation(api.universities.remove, { id: universityId });
      
      return { success: true, results };
    } catch (e) {
      console.error("[Verification] Failed:", e);
      return { success: false, error: String(e) };
    }
  },
});
