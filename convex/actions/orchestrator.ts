"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import * as Sentry from "@sentry/nextjs";

export const runEnrichmentChain = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
    console.log(`[Orchestrator] Starting enrichment chain for ${args.universityId}`);
    
    // 1. Scrape
    try {
      await ctx.runAction(api.actions.scraper.scrapeUniversity, { universityId: args.universityId });
    } catch (e) {
      console.error("[Orchestrator] Scraping failed, continuing to enrichment anyway", e);
    }
    
    // 2. Discover Social & Media
    try {
      await ctx.runAction(api.actions.enrichment.discoverSocialAndMedia, { universityId: args.universityId });
    } catch (e) {
      console.error("[Orchestrator] Social & Media failed", e);
    }

    // 3. AI Scoring
    try {
      await ctx.runAction(api.actions.scoring.scoreUniversity, { universityId: args.universityId });
    } catch (e) {
       console.error("[Orchestrator] AI Scoring failed", e);
    }

    console.log(`[Orchestrator] Enrichment chain completed for ${args.universityId}`);
    return { success: true };
    } catch (e) {
      console.error("[Orchestrator] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  }
});
