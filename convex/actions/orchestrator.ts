"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import * as Sentry from "@sentry/node";

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
      antiRagging: false,
      governmentData: false,
      socialMedia: false,
      inferContacts: false,
      deepEnrichment: false,
      scoring: false,
      discovery: false,
    };

    // ── Pre-phase: Discover website if missing ──────────────────────────────
    const university = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!university) {
      return { success: false, error: "University not found" };
    }

    if (!university.website) {
      console.log(`[Orchestrator] No website for ${university.university_name}. Running discovery...`);
      try {
        const discRes: string | null = await ctx.runAction(api.actions.discovery.discoverWebsite, {
          universityId: args.universityId,
          universityName: university.university_name,
        });
        results.discovery = typeof discRes === "string" && discRes.length > 0;
        console.log(`[Orchestrator] Discovery result: success=${results.discovery}`);
      } catch (e) {
        console.error("[Orchestrator] Discovery failed:", e);
      }
    }

    // Phase 1: Run independent enrichment tasks in parallel
    // scrapeUniversity, scrapeAntiRagging, and social discovery don't depend on each other.
    // enrichGovernmentData is NOT in Phase 1 — it writes demographics which deepEnrichment
    // also writes, so we sequence them to prevent a race condition.
    try {
      console.log(`[Orchestrator] Phase 1: Running scraper, anti-ragging, social discovery in parallel`);
      const [scrapeRes, antiRagRes, socialRes] = await Promise.allSettled([
        ctx.runAction(api.actions.scraper.scrapeUniversity, { universityId: args.universityId }),
        ctx.runAction(api.actions.scrapeAntiRagging.scrapeAntiRagging, { universityId: args.universityId }),
        ctx.runAction(api.actions.enrichment.discoverSocialAndMedia, { universityId: args.universityId }),
      ]);
      results.scrape = scrapeRes.status === "fulfilled" && (scrapeRes.value as { success?: boolean })?.success === true;
      results.antiRagging = antiRagRes.status === "fulfilled" && (antiRagRes.value as { success?: boolean })?.success === true;
      results.socialMedia = socialRes.status === "fulfilled" && (socialRes.value as { success?: boolean })?.success === true;

      console.log(`[Orchestrator] Phase 1 complete: scrape=${results.scrape} antiRagging=${results.antiRagging} social=${results.socialMedia}`);
    } catch (e) {
      console.error("[Orchestrator] Phase 1 parallel enrichment failed", e);
    }

    // Phase 2: Infer role-based contacts (depends on scrape having run, but safe to run regardless)
    try {
      console.log(`[Orchestrator] Phase 2: Running contact inference`);
      const inferRes = await ctx.runAction(api.actions.inferContacts.inferContacts, { universityId: args.universityId });
      results.inferContacts = (inferRes as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Contact inference failed", e);
    }

    // Phase 3: Government data enrichment (writes demographics)
    // Runs BEFORE deepEnrichment so that deepEnrichment can read and augment
    // government data rather than overwriting it.
    try {
      console.log(`[Orchestrator] Phase 3: Running government data enrichment`);
      const govRes = await ctx.runAction(api.actions.enrichGovernmentData.enrichGovernmentData, { universityId: args.universityId });
      results.governmentData = (govRes as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Government data enrichment failed", e);
    }

    // Phase 4: Deep Enrichment (uses data from all previous phases)
    try {
      console.log(`[Orchestrator] Phase 4: Running deep enrichment`);
      const deepRes: unknown = await ctx.runAction(api.actions.deepEnrichment.runDeepEnrichment, { universityId: args.universityId });
      results.deepEnrichment = (deepRes as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Deep Enrichment failed", e);
    }

    // Phase 5: Scoring (depends on demographics and stakeholders being populated)
    try {
      console.log(`[Orchestrator] Phase 5: Running scoring`);
      const scoreRes = await ctx.runAction(api.actions.scoring.scoreUniversity, { universityId: args.universityId });
      results.scoring = (scoreRes as { success?: boolean })?.success === true;
    } catch (e) {
      console.error("[Orchestrator] Scoring failed", e);
    }

    const allOk: boolean = results.scrape || results.antiRagging || results.governmentData;
    console.log(`[Orchestrator] Enrichment chain completed for ${args.universityId}: scrape=${results.scrape} antiRagging=${results.antiRagging} govData=${results.governmentData} social=${results.socialMedia} infer=${results.inferContacts} deep=${results.deepEnrichment} score=${results.scoring}`);
    return { success: allOk, steps: results };
    } catch (e) {
      console.error("[Orchestrator] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e), steps: { scrape: false, antiRagging: false, governmentData: false, socialMedia: false, inferContacts: false, deepEnrichment: false, scoring: false } };
    }
  }
});
