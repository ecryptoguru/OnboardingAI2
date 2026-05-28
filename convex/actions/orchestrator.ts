"use node";

import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import * as Sentry from "@sentry/nextjs";

export const runEnrichmentChain = action({
  args: { universityId: v.id("universities") },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; steps?: Record<string, boolean>; error?: string }> => {
    try {
    console.log(`[Orchestrator] Starting enrichment chain for ${args.universityId}`);

    const results: Record<string, boolean> = {
      scrape: false,
      socialMedia: false,
      deepEnrichment: false,
      scoring: false,
    };

    // 1 & 2. Scrape and Discover Social Media in parallel
    try {
      console.log(`[Orchestrator] Running Scraper and Social Discovery in parallel`);
      const [scrapeRes, socialRes]: [PromiseSettledResult<unknown>, PromiseSettledResult<unknown>] = await Promise.allSettled([
        ctx.runAction(api.actions.scraper.scrapeUniversity, { universityId: args.universityId }),
        ctx.runAction(api.actions.enrichment.discoverSocialAndMedia, { universityId: args.universityId })
      ]);
      results.scrape = scrapeRes.status === "fulfilled" && (scrapeRes.value as { success?: boolean })?.success === true;
      results.socialMedia = socialRes.status === "fulfilled" && (socialRes.value as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Parallel extraction step failed", e);
    }

    // 3. Deep Enrichment (Crucial for getting demographics before scoring)
    try {
      const deepRes: unknown = await ctx.runAction(api.actions.deepEnrichment.runDeepEnrichment, { universityId: args.universityId });
      results.deepEnrichment = (deepRes as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Deep Enrichment failed", e);
    }

    // 4. AI Scoring
    try {
      const scoreRes: unknown = await ctx.runAction(api.actions.scoring.scoreUniversity, { universityId: args.universityId });
      results.scoring = (scoreRes as { success?: boolean })?.success === true;
    } catch (e) {
       console.error("[Orchestrator] AI Scoring failed", e);
    }

    const allOk: boolean = results.scrape && results.deepEnrichment && results.scoring;
    console.log(`[Orchestrator] Enrichment chain completed for ${args.universityId}: scrape=${results.scrape} social=${results.socialMedia} deep=${results.deepEnrichment} score=${results.scoring}`);
    return { success: allOk, steps: results };
    } catch (e) {
      console.error("[Orchestrator] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e), steps: { scrape: false, socialMedia: false, deepEnrichment: false, scoring: false } };
    }
  }
});
