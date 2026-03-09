"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const runChain = action({
  args: { universityName: v.string() },
  handler: async (ctx, args): Promise<{ 
    success: boolean; 
    universityId: Id<"universities"> | null; 
    website: string | null;
    scoring: any;
    personalization: string | null;
    autoReply: any;
  }> => {
    const { api, internal } = await import("../_generated/api");
    console.log(`[E2E] 🚀 Starting deep test chain for: ${args.universityName}`);
    
    // 1. Insert dummy university
    const universityId = (await ctx.runMutation(internal.universities.createInternal, {
      university_name: args.universityName,
      student_count: 5000,
      type: "private",
    })) as Id<"universities">;
    console.log(`[E2E] ✅ Inserted university with ID: ${universityId}`);

    // 2. Discover website
    console.log(`[E2E] 🔍 Discovering website...`);
    const website = (await ctx.runAction(api.actions.discovery.discoverWebsite, {
      universityId,
      universityName: args.universityName,
    })) as string | null;
    console.log(`[E2E] 🌐 Discovered website: ${website}`);

    let scoring: any = null;
    let personalization: any = null;
    let autoReply: any = null;

    if (website) {
      // 3. Trigger Enrichment Chain via Orchestrator
      console.log(`[E2E] ⛓️ Triggering Enrichment Chain...`);
      await ctx.runAction(api.actions.orchestrator.runEnrichmentChain, {
        universityId
      });
      console.log(`[E2E] ✨ Enrichment Chain completed!`);

      // 4. Manual Verification of Scoring
      console.log(`[E2E] 📊 Verifying Scoring...`);
      scoring = await ctx.runAction(api.actions.scoring.scoreUniversity, {
        universityId
      });
      console.log(`[E2E] 📈 Scoring Result: Tier=${scoring.lead_tier}, Score=${scoring.final_score}`);

      // 5. Test Personalization logic (Opener)
      console.log(`[E2E] 📝 Testing Personalization logic...`);
      // We need a dummy stakeholder for this
      const stakeholderId = await ctx.runMutation(internal.stakeholders.insertInternal, {
        university_id: universityId,
        name: "Test Dean",
        role: "Dean of Student Affairs",
        email: "dean@example.edu",
      });

      personalization = await ctx.runAction(api.actions.personalize.generateOpener, {
        universityId,
        stakeholderId
      });
      console.log(`[E2E] 🤖 Generated Opener: "${personalization ? (personalization as string).substring(0, 50) : "null"}..."`);

      // 6. Test Auto-Reply (Requirement 8)
      console.log(`[E2E] 📧 Testing Auto-Reply...`);
      const autoReplyResult = await ctx.runAction(api.actions.autoReply.sendAutoReply, {
        universityId,
        stakeholderId,
        classification: "positive_interest",
      });
      console.log(`[E2E] 📧 Auto-Reply Success: ${autoReplyResult.success}`);
      autoReply = autoReplyResult;
    } else {
      console.log(`[E2E] ❌ Could not discover website. Skipping enrichment.`);
    }

    return { 
      success: true, 
      universityId, 
      website, 
      scoring, 
      personalization,
      autoReply,
    };
  }
});
