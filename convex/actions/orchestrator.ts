"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { validateAuth } from "../lib/auth_utils";
import { isSuspiciousWebsite } from "../lib/discoveryCandidates";
import { LlmUsageEntry, LlmUsageSummary, summarizeLlmUsage } from "../lib/llm";
import * as Sentry from "@sentry/node";

export const runEnrichmentChainInternal = internalAction({
  args: {
    universityId: v.id("universities"),
    queue: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    steps?: Record<string, boolean>;
    warnings?: string[];
    llmUsage?: LlmUsageSummary;
    error?: string;
  }> => {
    let university: Doc<"universities"> | null = null;

    async function trackProgress(
      phase: string,
      status?: "running" | "completed" | "failed" | "timed_out",
      error?: string,
    ) {
      try {
        await ctx.runMutation(
          internal.universities.updateEnrichmentProgressInternal,
          {
            universityId: args.universityId,
            phase,
            ...(status ? { status } : {}),
            ...(error ? { error } : {}),
          },
        );
      } catch (e) {
        console.warn("[Orchestrator] Progress tracking failed:", e);
      }
    }

    try {
      console.log(
        `[Orchestrator] Starting enrichment chain for ${args.universityId}`,
      );
      await trackProgress("website-discovery", "running");

      // Mark the university as actively enriching so the UI can show live progress.
      // The public wrapper already sets this, but doing it again here makes the
      // internal action self-contained when called directly from the scheduler.
      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: args.universityId,
        stage: "enriching",
      });

      const results: Record<string, boolean> = {
        websiteReady: false,
        scrape: false,
        antiRagging: false,
        governmentData: false,
        socialMedia: false,
        socialMediaPostDeep: false,
        inferContacts: false,
        deepEnrichment: false,
        scoring: false,
        discovery: false,
      };
      const warnings: string[] = [];
      let serperQueriesUsed = 0;
      let firecrawlCreditsUsed = 0;
      const llmUsageEntries: LlmUsageEntry[] = [];
      const appendLlmUsage = (result: unknown) => {
        const entries =
          (result as { llmUsage?: { entries?: LlmUsageEntry[] } })?.llmUsage
            ?.entries || [];
        llmUsageEntries.push(...entries);
      };

      // ── Pre-phase: Discover website if missing ──────────────────────────────
      university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!university) {
        return { success: false, error: "University not found" };
      }

      const hasBadWebsite = isSuspiciousWebsite(university.website);
      const isWeakDiscovery = university.website_status === "discovered_weak";
      const isUntrustedStatus =
        university.website_status === "invalid" ||
        university.website_status === "discovered_weak" ||
        !university.website;
      const shouldRediscover = hasBadWebsite || isWeakDiscovery || isUntrustedStatus;
      if (shouldRediscover) {
        console.warn(
          `[Orchestrator] Stored website ${university.website} (${university.website_status}) is untrusted for ${university.university_name}. Clearing and re-running discovery...`,
        );
        await ctx.runMutation(internal.universities.updateInternal, {
          id: args.universityId,
          website: "",
          website_status: "invalid",
        });
      }

      let websiteReady =
        !!university.website && !hasBadWebsite && !shouldRediscover;
      if (!websiteReady) {
        console.log(
          `[Orchestrator] No website for ${university.university_name}. Running discovery...`,
        );
        try {
          const discRes: string | null = await ctx.runAction(
            internal.actions.discovery.discoverWebsite,
            {
              universityId: args.universityId,
              universityName: university.university_name,
            },
          );
          results.discovery = typeof discRes === "string" && discRes.length > 0;
          if (results.discovery && discRes) {
            // Validate and normalize the discovered URL before downstream scraping.
            try {
              const validationOk = await ctx.runAction(
                internal.actions.discovery.validateWebsite,
                {
                  universityId: args.universityId,
                  website: discRes,
                  universityName: university.university_name,
                },
              );
              if (!validationOk) {
                results.discovery = false;
              }
            } catch (e) {
              results.discovery = false;
              console.warn("[Orchestrator] Website validation failed:", e);
            }
          }
          console.log(
            `[Orchestrator] Discovery result: success=${results.discovery}`,
          );
        } catch (e) {
          console.error("[Orchestrator] Discovery failed:", e);
        }
      }
      const refreshedUniversity = await ctx.runQuery(
        internal.universities.getInternal,
        {
          universityId: args.universityId,
        },
      );
      const refreshedWeakDiscovery =
        refreshedUniversity?.website_status === "discovered_weak";
      websiteReady =
        !!refreshedUniversity?.website &&
        !isSuspiciousWebsite(refreshedUniversity.website) &&
        !refreshedWeakDiscovery;
      results.websiteReady = websiteReady;
      if (!websiteReady && refreshedUniversity?.website) {
        console.warn(
          `[Orchestrator] Website ${refreshedUniversity.website} is still not trusted enough for scraping. Skipping website-dependent phases.`,
        );
      }

      // Phase 1: Run independent enrichment tasks in parallel
      // scrapeUniversity, scrapeAntiRagging, and social discovery don't depend on each other.
      // enrichGovernmentData is NOT in Phase 1 — it writes demographics which deepEnrichment
      // also writes, so we sequence them to prevent a race condition.
      await trackProgress("phase-1-scrape-social");
      try {
        if (websiteReady) {
          console.log(
            `[Orchestrator] Phase 1: Running scraper, anti-ragging, social discovery in parallel`,
          );
          const [scrapeRes, antiRagRes, socialRes] = await Promise.allSettled([
            ctx.runAction(internal.actions.scraper.scrapeUniversity, {
              universityId: args.universityId,
              maxSerperQueries: 1,
            }),
            ctx.runAction(internal.actions.scrapeAntiRagging.scrapeAntiRagging, {
              universityId: args.universityId,
            }),
            ctx.runAction(internal.actions.enrichment.discoverSocialAndMedia, {
              universityId: args.universityId,
              maxSerperQueries: 4,
            }),
          ]);
          results.scrape =
            scrapeRes.status === "fulfilled" &&
            (scrapeRes.value as { success?: boolean })?.success === true;
          if (scrapeRes.status === "fulfilled") {
            appendLlmUsage(scrapeRes.value);
            serperQueriesUsed +=
              (scrapeRes.value as { serperQueriesUsed?: number })
                ?.serperQueriesUsed ?? 0;
          }
          results.antiRagging =
            antiRagRes.status === "fulfilled" &&
            (antiRagRes.value as { success?: boolean })?.success === true;
          results.socialMedia =
            socialRes.status === "fulfilled" &&
            (socialRes.value as { success?: boolean })?.success === true;
          if (socialRes.status === "fulfilled") {
            appendLlmUsage(socialRes.value);
            serperQueriesUsed +=
              (socialRes.value as { serperQueriesUsed?: number })
                ?.serperQueriesUsed ?? 0;
          }
        } else {
          console.warn(
            `[Orchestrator] Website still missing after discovery. Skipping website-dependent scraping phases.`,
          );
          const socialRes = await ctx.runAction(
            internal.actions.enrichment.discoverSocialAndMedia,
            {
              universityId: args.universityId,
            },
          );
          results.socialMedia =
            (socialRes as { success?: boolean })?.success === true;
          appendLlmUsage(socialRes);
        }

        console.log(
          `[Orchestrator] Phase 1 complete: scrape=${results.scrape} antiRagging=${results.antiRagging} social=${results.socialMedia}`,
        );
      } catch (e) {
        console.error("[Orchestrator] Phase 1 parallel enrichment failed", e);
      }

      // Phase 2: Infer role-based contacts (depends on scrape having run, but safe to run regardless)
      await trackProgress("phase-2-contact-inference");
      try {
        if (websiteReady) {
          console.log(`[Orchestrator] Phase 2: Running contact inference`);
          const inferRes = await ctx.runAction(
            internal.actions.inferContacts.inferContacts,
            { universityId: args.universityId },
          );
          results.inferContacts =
            (inferRes as { success?: boolean })?.success === true;
        }
      } catch (e) {
        console.error("[Orchestrator] Contact inference failed", e);
      }

      // Phase 3: Government data enrichment (writes demographics)
      // Runs BEFORE deepEnrichment so that deepEnrichment can read and augment
      // government data rather than overwriting it.
      await trackProgress("phase-3-government-data");
      let govOfficers: Array<{ name?: string; role?: string }> = [];
      try {
        console.log(
          `[Orchestrator] Phase 3: Running government data enrichment`,
        );
        const govRes = await ctx.runAction(
          internal.actions.enrichGovernmentData.enrichGovernmentData,
          { universityId: args.universityId, maxSerperQueries: 3 },
        );
        results.governmentData =
          (govRes as { success?: boolean })?.success === true;
        govOfficers = (govRes as { officers?: Array<{ name?: string; role?: string }> })
          ?.officers ?? [];
        serperQueriesUsed +=
          (govRes as { serperQueriesUsed?: number })?.serperQueriesUsed ?? 0;
        appendLlmUsage(govRes);
      } catch (e) {
        console.error("[Orchestrator] Government data enrichment failed", e);
      }

      // Phase 4: Deep Enrichment (uses data from all previous phases)
      await trackProgress("phase-4-deep-enrichment");
      try {
        if (websiteReady) {
          console.log(`[Orchestrator] Phase 4: Running deep enrichment`);
          const deepRes: unknown = await ctx.runAction(
            internal.actions.deepEnrichment.runDeepEnrichment,
            {
              universityId: args.universityId,
              maxSerperQueries: 5,
              preDiscoveredOfficers: govOfficers,
            },
          );
          results.deepEnrichment =
            (deepRes as { success?: boolean })?.success === true;
          if (
            results.deepEnrichment &&
            (deepRes as { stakeholdersSynthesized?: number })
              ?.stakeholdersSynthesized === 0
          ) {
            warnings.push(
              `deepEnrichment returned 0 stakeholders for ${university.university_name}`,
            );
            console.warn(
              `[Orchestrator] WARNING: deep enrichment returned 0 stakeholders for ${university.university_name}`,
            );
          }
          serperQueriesUsed +=
            (deepRes as { serperQueriesUsed?: number })?.serperQueriesUsed ?? 0;
          firecrawlCreditsUsed +=
            (deepRes as { firecrawlCreditsUsed?: number })
              ?.firecrawlCreditsUsed ?? 0;
          appendLlmUsage(deepRes);
        }
      } catch (e) {
        console.error("[Orchestrator] Deep Enrichment failed", e);
      }

      // Phase 5: Refresh social/profile enrichment after deep extraction
      // Deep enrichment may add better stakeholders; run LinkedIn/news/image enrichment
      // again so these newly extracted contacts also get profile/signal coverage.
      await trackProgress("phase-5-social-refresh");
      try {
        console.log(
          `[Orchestrator] Phase 5: Refreshing social/profile enrichment`,
        );
        const socialRefreshRes = await ctx.runAction(
          internal.actions.enrichment.discoverSocialAndMedia,
          { universityId: args.universityId, maxSerperQueries: 0 },
        );
        results.socialMediaPostDeep =
          (socialRefreshRes as { success?: boolean })?.success === true;
        appendLlmUsage(socialRefreshRes);
      } catch (e) {
        console.error(
          "[Orchestrator] Post-deep social/profile refresh failed",
          e,
        );
      }

      // Phase 6: Scoring (depends on demographics and stakeholders being populated)
      await trackProgress("phase-6-scoring");
      try {
        if (websiteReady) {
          await ctx.runMutation(
            internal.stakeholders.dedupeSingletonRoleContactsInternal,
            {
              university_id: args.universityId,
            },
          );
        }
        console.log(`[Orchestrator] Phase 6: Running scoring`);
        const scoreRes = await ctx.runAction(
          internal.actions.scoring.scoreUniversity,
          { universityId: args.universityId },
        );
        results.scoring = (scoreRes as { success?: boolean })?.success === true;
      } catch (e) {
        console.error("[Orchestrator] Scoring failed", e);
      }

      // The chain is only successful if the final scoring phase completed,
      // because that is the deliverable the rest of the pipeline consumes.
      const allOk: boolean = results.scoring;
      console.log(
        `[Orchestrator] Enrichment chain completed for ${args.universityId}: scrape=${results.scrape} antiRagging=${results.antiRagging} govData=${results.governmentData} social=${results.socialMedia} socialPostDeep=${results.socialMediaPostDeep} infer=${results.inferContacts} deep=${results.deepEnrichment} score=${results.scoring}`,
      );
      console.log(
        `[CreditUsage] ${university?.university_name ?? args.universityId}: serper=${serperQueriesUsed}/14 firecrawl=${firecrawlCreditsUsed}/8`,
      );

      // Sequential batch chaining: continue the queue via the scheduler so each
      // action stays within its own runtime limit.
      if (args.queue && args.queue.length > 0) {
        const [nextId, ...rest] = args.queue;
        await ctx.scheduler.runAfter(
          0,
          internal.actions.orchestrator.runEnrichmentChainInternal,
          { universityId: nextId as Id<"universities">, queue: rest },
        );
        console.log(
          `[Orchestrator] Scheduled next university in queue: ${nextId} (${rest.length} remaining)`,
        );
      }

      await trackProgress(
        allOk ? "completed" : "failed",
        allOk ? "completed" : "failed",
      );
      await ctx.runMutation(
        internal.universities.updateEnrichmentProgressInternal,
        {
          universityId: args.universityId,
          completed_at: Date.now(),
        },
      );

      // If scoring did not finish, clear the "enriching" stage so the UI does
      // not get stuck and the record can be retried.
      if (!allOk) {
        await ctx.runMutation(
          internal.universities.updateOutreachStageInternal,
          {
            universityId: args.universityId,
            stage: "new",
          },
        );
      }

      return {
        success: allOk,
        steps: results,
        warnings,
        llmUsage: summarizeLlmUsage(llmUsageEntries),
      };
    } catch (e) {
      console.error("[Orchestrator] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      await trackProgress("failed", "failed", String(e));

      // Avoid leaving the record stuck in "enriching" if the chain fatally fails,
      // but do not overwrite an already-completed "enriched" stage.
      if (university?.outreach_stage === "enriching") {
        await ctx.runMutation(
          internal.universities.updateOutreachStageInternal,
          {
            universityId: args.universityId,
            stage: "new",
          },
        );
      }

      // Continue the sequential batch queue even when one university fails.
      if (args.queue && args.queue.length > 0) {
        const [nextId, ...rest] = args.queue;
        await ctx.scheduler.runAfter(
          0,
          internal.actions.orchestrator.runEnrichmentChainInternal,
          { universityId: nextId as Id<"universities">, queue: rest },
        );
        console.log(
          `[Orchestrator] Scheduled next university in queue after failure: ${nextId} (${rest.length} remaining)`,
        );
      }

      return {
        success: false,
        error: String(e),
        llmUsage: summarizeLlmUsage([]),
        warnings: [],
        steps: {
          websiteReady: false,
          scrape: false,
          antiRagging: false,
          governmentData: false,
          socialMedia: false,
          socialMediaPostDeep: false,
          inferContacts: false,
          deepEnrichment: false,
          scoring: false,
        },
      };
    }
  },
});

/**
 * CLI/operator-friendly runner: marks the university as enriching, schedules
 * the long-running chain via the scheduler, and returns immediately.
 * `npx convex run` has a ~300s client-side wait for actions, so long chains
 * must be scheduled and polled instead of awaited inline:
 *   npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentInternal' '{"universityId":"..."}'
 *   npx convex run --deployment prod 'universities:getInternal' '{"universityId":"..."}'
 */
export const scheduleEnrichmentInternal = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<{
    success: boolean;
    enqueued: boolean;
    message: string;
  }> => {
    await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
      universityId: args.universityId,
      stage: "enriching",
    });
    await ctx.runMutation(
      internal.universities.updateEnrichmentProgressInternal,
      {
        universityId: args.universityId,
        status: "running",
        phase: "queued",
        started_at: Date.now(),
      },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.actions.orchestrator.runEnrichmentChainInternal,
      { universityId: args.universityId },
    );
    return {
      success: true,
      enqueued: true,
      message:
        "Enrichment scheduled. Poll universities:getInternal for enrichment_status/outreach_stage.",
    };
  },
});

/**
 * Sequential batch runner: enqueues universities one at a time via the
 * scheduler. Each chain schedules the next on completion, so no single action
 * exceeds the runtime limit and Firecrawl/Serper are never hammered by
 * concurrent runs.
 */
export const scheduleEnrichmentBatch = internalAction({
  args: { queue: v.array(v.string()) },
  handler: async (ctx, args): Promise<{
    success: boolean;
    enqueued: number;
    message: string;
  }> => {
    if (args.queue.length === 0) {
      return { success: false, enqueued: 0, message: "Empty queue" };
    }
    const [firstId, ...rest] = args.queue;
    await ctx.scheduler.runAfter(
      0,
      internal.actions.orchestrator.runEnrichmentChainInternal,
      { universityId: firstId as Id<"universities">, queue: rest },
    );
    return {
      success: true,
      enqueued: args.queue.length,
      message: `Enrichment batch enqueued (${args.queue.length} universities, sequential).`,
    };
  },
});

export const runEnrichmentChain = action({
  args: { universityId: v.id("universities") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    enqueued: boolean;
    error?: string;
    message?: string;
  }> => {
    await validateAuth(ctx);

    // Mark the university as actively enriching so the UI can show live progress.
    await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
      universityId: args.universityId,
      stage: "enriching",
    });
    await ctx.runMutation(
      internal.universities.updateEnrichmentProgressInternal,
      {
        universityId: args.universityId,
        status: "running",
        phase: "queued",
        started_at: Date.now(),
      },
    );

    // Schedule the long-running chain in the background. This avoids the
    // 300s Convex action timeout that was producing the public "Uncaught Error".
    await ctx.scheduler.runAfter(
      0,
      internal.actions.orchestrator.runEnrichmentChainInternal,
      args,
    );

    return {
      success: true,
      enqueued: true,
      message:
        "Enrichment chain enqueued and running in the background. Use universities:get to poll outreach_stage.",
    };
  },
});
