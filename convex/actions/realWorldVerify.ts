"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Comprehensive real-world end-to-end pipeline verification.
 *
 * This action exercises the full Outreach AI pipeline for a single university
 * using real external APIs (Gemini, Serper, ZeptoMail webhooks).  It creates
 * real database records but does NOT send unsolicited emails — the HITL flow
 * ensures emails are drafted as "pending_approval" only.
 *
 * Usage (from Convex dashboard or via HTTP action):
 *   { universityName: "Anna University", state: "Tamil Nadu", stages: [...] }
 */
export const runFullPipeline = action({
  args: {
    universityName: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    website: v.optional(v.string()),
    studentCount: v.optional(v.number()),
    type: v.optional(v.string()),
    naacGrade: v.optional(v.string()),
    stages: v.optional(v.array(v.string())),
    cleanup: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("runFullPipeline is disabled in production");
    }

    const allStages = [
      "ingestion",
      "discovery",
      "scraper",
      "enrichment",
      "deep_enrichment",
      "scoring",
      "outreach",
      "reply",
      "proposal",
    ] as const;
    const stagesToRun = new Set(args.stages ?? allStages);

    const report: {
      universityName: string;
      startedAt: string;
      stages: Record<string, Record<string, unknown>>;
      cleanup?: Record<string, unknown>;
      success?: boolean;
      [key: string]: unknown;
    } = {
      universityName: args.universityName,
      startedAt: new Date().toISOString(),
      stages: {},
    };

    let universityId: Id<"universities"> | undefined;
    let testStakeholderId: Id<"stakeholders"> | undefined;
    let sequenceId: Id<"outreachSequences"> | undefined;

    const stageTimer = (name: string) => {
      const t0 = Date.now();
      return (result?: Record<string, unknown>) => {
        const base = report.stages[name] || {};
        report.stages[name] = { ...base, ...result, durationMs: Date.now() - t0 };
      };
    };

    async function findOrCreateUniversity(): Promise<Id<"universities">> {
      const existing = await ctx.runQuery(
        internal.universities.findByNameInternal,
        { name: args.universityName },
      );
      if (existing) return existing._id;
      return await ctx.runMutation(internal.universities.createInternal, {
        university_name: args.universityName,
        state: args.state,
        city: args.city,
        website: args.website,
        student_count: args.studentCount,
        type: args.type,
        naac_grade: args.naacGrade,
      });
    }

    try {
      /* ─── 1. INGESTION ─────────────────────────────────────────────── */
      if (stagesToRun.has("ingestion")) {
        const endTimer = stageTimer("ingestion");
        try {
          const existing = await ctx.runQuery(
            internal.universities.findByNameInternal,
            { name: args.universityName },
          );
          if (existing) {
            universityId = existing._id;
            endTimer({ status: "skipped", reason: "University already exists", id: existing._id });
          } else {
            universityId = await ctx.runMutation(
              internal.universities.createInternal,
              {
                university_name: args.universityName,
                state: args.state,
                city: args.city,
                website: args.website,
                student_count: args.studentCount,
                type: args.type,
                naac_grade: args.naacGrade,
              },
            );
            endTimer({ status: "created", id: universityId });
          }
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      // Always resolve university ID, even if ingestion was skipped
      if (!universityId) {
        universityId = await findOrCreateUniversity();
      }

      /* ─── 2. DISCOVERY ─────────────────────────────────────────────── */
      if (stagesToRun.has("discovery")) {
        const endTimer = stageTimer("discovery");
        try {
          const uni = await ctx.runQuery(internal.universities.getInternal, {
            universityId,
          });
          if (uni && !uni.website) {
            const website = await ctx.runAction(
              api.actions.discovery.discoverWebsite,
              { universityId, universityName: args.universityName },
            );
            endTimer({ status: website ? "success" : "failed", website });
          } else {
            endTimer({ status: "skipped", reason: "Website already known", website: uni?.website });
          }
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 3. SCRAPER ───────────────────────────────────────────────── */
      if (stagesToRun.has("scraper")) {
        const endTimer = stageTimer("scraper");
        try {
          const result = await ctx.runAction(api.actions.scraper.scrapeUniversity, {
            universityId,
          });
          endTimer(result ?? { success: true });
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 4. ENRICHMENT (LinkedIn, News, Images) ───────────────────── */
      if (stagesToRun.has("enrichment")) {
        const endTimer = stageTimer("enrichment");
        try {
          const result = await ctx.runAction(
            api.actions.enrichment.discoverSocialAndMedia,
            { universityId },
          );
          endTimer(result);
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 5. DEEP ENRICHMENT (Demographics, NIRF, AISHE) ───────────── */
      if (stagesToRun.has("deep_enrichment")) {
        const endTimer = stageTimer("deep_enrichment");
        try {
          // If FIRECRAWL_API_KEY is set as an env var but not in Settings,
          // auto-seed it so deep enrichment can proceed.
          if (process.env.FIRECRAWL_API_KEY) {
            await ctx.runMutation(
              internal.settings.setFirecrawlKeyInternal,
              { apiKey: process.env.FIRECRAWL_API_KEY },
            );
          }

          const result = await ctx.runAction(
            api.actions.deepEnrichment.runDeepEnrichment,
            { universityId },
          );
          endTimer(result);
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 6. SCORING ─────────────────────────────────────────────────── */
      if (stagesToRun.has("scoring")) {
        const endTimer = stageTimer("scoring");
        try {
          const result = await ctx.runAction(
            api.actions.scoring.scoreUniversity,
            { universityId },
          );
          endTimer(result);
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 7. OUTREACH (Enroll + Draft Step 1) ──────────────────────── */
      if (stagesToRun.has("outreach")) {
        const endTimer = stageTimer("outreach");
        try {
          const stakeholders = await ctx.runQuery(
            internal.stakeholders.getByUniversityInternal,
            { university_id: universityId },
          );

          const realStakeholder = stakeholders.find(
            (s) =>
              s.email &&
              s.email.trim().toLowerCase() !== "null" &&
              !s.email.includes("@example.") &&
              !s.email.includes("test@"),
          );

          if (realStakeholder) {
            testStakeholderId = realStakeholder._id;
            report.stages.outreach = {
              stakeholderSource: "real",
              stakeholderId: testStakeholderId,
              stakeholderEmail: realStakeholder.email,
            };
          }

          if (!testStakeholderId) {
            testStakeholderId = await ctx.runMutation(
              internal.stakeholders.insertInternal,
              {
                university_id: universityId,
                name: "Test Verification Lead",
                role: "Verification Lead",
                email: "test+verify@example.com",
              },
            );
            report.stages.outreach = {
              ...report.stages.outreach,
              stakeholderSource: "synthetic",
              stakeholderId: testStakeholderId,
              stakeholderEmail: "test+verify@example.com",
            };
          }

          const enrolledId = await ctx.runMutation(
            internal.sequences.enrollInternal,
            {
              university_id: universityId,
              stakeholder_id: testStakeholderId,
            },
          );
          sequenceId = enrolledId;
          report.stages.outreach.sequenceId = enrolledId;

          // Ensure sequence is active before processing (previous runs may have paused it)
          const seqBefore = await ctx.runQuery(internal.sequences.getInternal, {
            id: enrolledId,
          });
          if (seqBefore && seqBefore.status !== "active") {
            await ctx.runMutation(internal.sequences.resumeInternal, {
              id: enrolledId,
              status: "active",
            });
          }

          // Directly process step 1 to draft the email (deterministic test path)
          const stepResult = await ctx.runAction(
            api.actions.outreach.processSequenceStep,
            { sequenceId: enrolledId },
          );
          report.stages.outreach.stepResult = stepResult;

          // Verify that Step 1 was drafted as pending_approval
          const pendingEmails = await ctx.runQuery(
            internal.emails.listBySequenceInternal,
            { sequence_id: enrolledId },
          );
          report.stages.outreach.pendingEmails = pendingEmails.length;
          report.stages.outreach.hasStep1Draft = pendingEmails.some(
            (e) => e.step_number === 1 && e.status === "pending_approval",
          );
          endTimer();
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 8. REPLY SIMULATION ──────────────────────────────────────── */
      if (stagesToRun.has("reply") && testStakeholderId && sequenceId) {
        const endTimer = stageTimer("reply");
        try {
          const replyId = await ctx.runMutation(internal.replies.insertInternal, {
            university_id: universityId,
            stakeholder_id: testStakeholderId,
            raw_reply:
              "Hi Ashish, thank you for reaching out. We are interested in learning more about Fretbox. Can we schedule a demo next week?",
            received_at: Date.now(),
          });

          const classification = await ctx.runAction(
            api.actions.replyClassifier.classifyReply,
            {
              replyId,
              triggerAutoReply: false,
            },
          );

          // Allow scheduler time to fire auto-reply (Convex scheduler may take 5-10s)
          await new Promise((r) => setTimeout(r, 8000));

          const seqEmails = await ctx.runQuery(
            internal.emails.listBySequenceInternal,
            { sequence_id: sequenceId },
          );

          endTimer({
            replyId,
            classification: classification.classification,
            classificationSuccess: classification.success,
            autoReplyExists: seqEmails.some((e) => e.step_number === 99),
          });
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      /* ─── 9. PROPOSAL GENERATION ───────────────────────────────────── */
      if (stagesToRun.has("proposal") && universityId) {
        const endTimer = stageTimer("proposal");
        try {
          const proposalId = await ctx.runMutation(
            internal.proposals.createInternal,
            {
              university_id: universityId,
              stakeholder_id: testStakeholderId,
            },
          );

          const result = await ctx.runAction(
            api.actions.proposals.generateProposal,
            {
              universityId,
              proposalId,
              stakeholderId: testStakeholderId,
            },
          );

          const fetchedProposal = await ctx.runQuery(
            internal.proposals.getInternal,
            { id: proposalId },
          );

          endTimer({
            proposalId,
            generationSuccess: result.success,
            status: fetchedProposal?.status,
            hasAgenda: !!fetchedProposal?.agenda,
            hasJson: !!fetchedProposal?.proposal_json,
          });
        } catch (e) {
          endTimer({ status: "failed", error: String(e) });
        }
      }

      report.success = true;
      report.completedAt = new Date().toISOString();

      /* ─── CLEANUP (optional) ───────────────────────────────────────── */
      if (args.cleanup) {
        report.cleanup = {};
        if (sequenceId) {
          // Pause sequence
          await ctx.runMutation(internal.sequences.advanceInternal, {
            id: sequenceId,
            status: "paused",
          });
          report.cleanup.sequence = "paused";
        }
        if (testStakeholderId && report.stages.outreach?.stakeholderSource === "synthetic") {
          await ctx.runMutation(internal.stakeholders.removeInternal, {
            id: testStakeholderId,
          });
          report.cleanup.syntheticStakeholder = "deleted";
        }
      }

      return report;
    } catch (e) {
      report.success = false;
      report.error = String(e);
      report.completedAt = new Date().toISOString();
      return report;
    }
  },
});
