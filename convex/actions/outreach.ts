"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { TEMPLATES } from "../lib/emailTemplates";
import * as Sentry from "@sentry/node";

/**
 * Orchestrates a single step in an outreach sequence.
 * Personalizes, sends, and schedules the next step.
 */
export const processSequenceStep = action({
  args: {
    sequenceId: v.id("outreachSequences"),
  },
  handler: async (ctx, args) => {
    try {
      // 1. Fetch sequence and related data
      const seq = await ctx.runQuery(internal.sequences.getInternal, {
        id: args.sequenceId,
      });
      if (!seq) throw new Error("Sequence not found");
      if (seq.status !== "active")
        return { success: false, reason: "Sequence not active" };

      const uni = await ctx.runQuery(internal.universities.getInternal, {
        universityId: seq.university_id,
      });
      if (!uni) throw new Error("University not found");

      const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
        id: seq.stakeholder_id,
      });
      if (!st || !st.email) throw new Error("Stakeholder email not found");

      console.log(
        `[Outreach] Processing Step ${seq.current_step} for ${uni.university_name} -> ${st.email}`,
      );

      // 2. Determine Email Template and Personalization
      let subject = "";
      let body = "";
      let html_body: string | undefined;

      switch (seq.current_step) {
        case 1: {
          // Use internal call for personalization
          const opener = await ctx.runAction(
            api.actions.personalize.generateOpener,
            {
              universityId: seq.university_id,
              stakeholderId: seq.stakeholder_id,
            },
          );
          const email = TEMPLATES.STEP_1(
            st.name || st.role || "there",
            uni.university_name,
            opener,
          );
          subject = email.subject;
          body = email.body;
          html_body = email.html;
          break;
        }
        case 2: {
          const email = TEMPLATES.STEP_2(
            st.name || st.role || "there",
            uni.university_name,
          );
          subject = email.subject;
          body = email.body;
          html_body = email.html;
          break;
        }
        case 3: {
          const signals = await ctx.runQuery(
            internal.signals.listByUniversityInternal,
            {
              university_id: seq.university_id,
            },
          );
          const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
          const recentNews = signals
            .filter(
              (s: { signal_type: string; created_at?: number }) =>
                s.signal_type === "news" &&
                (s.created_at ?? 0) >= ninetyDaysAgo,
            )
            .sort(
              (a: { created_at?: number }, b: { created_at?: number }) =>
                (b.created_at ?? 0) - (a.created_at ?? 0),
            );
          const newsSignal =
            recentNews[0]?.content || "the great work you're doing";
          const email = TEMPLATES.STEP_3(
            st.name || st.role || "there",
            newsSignal,
          );
          subject = email.subject;
          body = email.body;
          html_body = email.html;
          break;
        }
        case 4: {
          const email = TEMPLATES.STEP_4(st.name || st.role || "there");
          subject = email.subject;
          body = email.body;
          html_body = email.html;
          break;
        }
        default:
          return { success: false, reason: "Unknown sequence step" };
      }

      // 3. Draft the Email (HITL) - Do NOT send immediately
      const now = Date.now();
      const emailId = await ctx.runMutation(internal.emails.insertInternal, {
        sequence_id: seq._id,
        university_id: seq.university_id,
        stakeholder_id: seq.stakeholder_id,
        subject,
        body,
        html_body,
        status: "pending_approval", // Instead of "sent"
        step_number: seq.current_step,
        drafted_at: now,
      });

      console.log(
        `[Outreach] Drafted Step ${seq.current_step} email for ${st.email} (Email ID: ${emailId}). Pending approval.`,
      );

      // 4. Pause the Sequence awaiting approval
      // We do NOT compute nextSendAt yet. That happens when the human approves the draft.
      await ctx.runMutation(internal.sequences.advanceInternal, {
        id: seq._id,
        status: "pending_approval",
      });

      // 5. Update University Stage if it's the first email
      if (seq.current_step === 1 && uni.outreach_stage === "enriched") {
        await ctx.runMutation(
          internal.universities.updateOutreachStageInternal,
          {
            universityId: seq.university_id,
            stage: "outreach_active",
          },
        );
      }

      return { success: true, reason: "Drafted for approval" };
    } catch (e) {
      console.error("[Outreach] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { sequenceId: args.sequenceId },
      });
      return { success: false, error: String(e) };
    }
  },
});

/**
 * Sweeps all active sequences due for an email and triggers them.
 * Called by crons.ts.
 */
export const processDueSequences = action({
  args: {},
  handler: async (ctx): Promise<{ processed: number }> => {
    // 1. Get all due sequences
    const dueSequences = await ctx.runQuery(internal.sequences.getDueInternal, {});
    if (!dueSequences || dueSequences.length === 0) return { processed: 0 };
    console.log(`[Cron] Found ${dueSequences.length} due sequences`);

    // 2. Process each sequence with a capped batch and staggered delays
    const MAX_BATCH = 100;
    const staggerMs = 250;
    const batch = dueSequences.slice(0, MAX_BATCH);

    for (let i = 0; i < batch.length; i++) {
      const seq = batch[i];
      await ctx.scheduler.runAfter(
        i * staggerMs,
        api.actions.outreach.processSequenceStep,
        {
          sequenceId: seq._id,
        },
      );
    }

    return { processed: batch.length };
  },
});
