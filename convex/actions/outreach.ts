"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { TEMPLATES } from "../lib/emailTemplates";
import { getNextSendAt } from "../lib/cadence";
import { withRetry } from "../lib/utils";
import * as Sentry from "@sentry/nextjs";

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
    if (seq.status !== "active") return { success: false, reason: "Sequence not active" };

    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: seq.university_id,
    });
    if (!uni) throw new Error("University not found");

    const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
      id: seq.stakeholder_id,
    });
    if (!st || !st.email) throw new Error("Stakeholder email not found");

    console.log(`[Outreach] Processing Step ${seq.current_step} for ${uni.university_name} -> ${st.email}`);

    // 2. Determine Email Template and Personalization
    let subject = "";
    let body = "";

    switch (seq.current_step) {
      case 1: {
        // Use internal call for personalization
        const opener = await ctx.runAction(api.actions.personalize.generateOpener, {
          universityId: seq.university_id,
          stakeholderId: seq.stakeholder_id,
        });
        const email = TEMPLATES.STEP_1(st.name || st.role || "there", uni.university_name, opener);
        subject = email.subject;
        body = email.body;
        break;
      }
      case 2: {
        const email = TEMPLATES.STEP_2(st.name || st.role || "there", uni.university_name);
        subject = email.subject;
        body = email.body;
        break;
      }
      case 3: {
        const signals = await ctx.runQuery(internal.signals.listByUniversityInternal, {
          university_id: seq.university_id,
        });
        const newsSignal = signals.find((s: any) => s.signal_type === "news")?.content || "the great work you're doing";
        const email = TEMPLATES.STEP_3(st.name || st.role || "there", newsSignal);
        subject = email.subject;
        body = email.body;
        break;
      }
      case 4: {
        const email = TEMPLATES.STEP_4(st.name || st.role || "there");
        subject = email.subject;
        body = email.body;
        break;
      }
      default:
        return { success: false, reason: "Unknown sequence step" };
    }

    // 3. Send Email with Retry
    const sendResult = await withRetry(async () => {
      return await ctx.runAction(api.actions.email.sendEmail, {
        to: st.email!,
        subject,
        text: body,
      });
    });

    if (!sendResult.success) {
      console.error(`[Outreach] Failed to send email to ${st.email}:`, sendResult.error);
      return { success: false, reason: "SendGrid failure" };
    }

    // 4. Record Sent Email and Advance Sequence
    const now = Date.now();
    await ctx.runMutation(internal.emails.insertInternal, {
      sequence_id: seq._id,
      university_id: seq.university_id,
      stakeholder_id: seq.stakeholder_id,
      subject,
      body: body,
      status: "sent",
      step_number: seq.current_step,
      sent_at: now,
    });

    const nextSendAt = getNextSendAt(seq.current_step);
    
    await ctx.runMutation(internal.sequences.advanceInternal, {
      id: seq._id,
      next_send_at: nextSendAt || undefined,
      status: nextSendAt ? "active" : "completed",
    });

    // 5. Update University Stage if it's the first email
    if (seq.current_step === 1 && uni.outreach_stage === "enriched") {
      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: seq.university_id,
        stage: "outreach_active",
      });
    }

    return { success: true };
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
    const dueSequences = await ctx.runQuery(api.sequences.getDue, {});
    if (!dueSequences || dueSequences.length === 0) return { processed: 0 };
    console.log(`[Cron] Found ${dueSequences.length} due sequences`);

    // 2. Process each sequence
    for (let i = 0; i < dueSequences.length; i++) {
       const seq = dueSequences[i];
       // @ts-ignore - internal.actions property error if type gen is laggy
       await ctx.scheduler.runAfter(i * 1000, internal.actions.outreach.processSequenceStep, {
         sequenceId: seq._id,
       });
    }

    return { processed: dueSequences.length };
  },
});
