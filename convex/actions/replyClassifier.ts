"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { callFlash, TEMP } from "../lib/llm";
import {
  REPLY_CLASSIFIER_SYSTEM_PROMPT,
  REPLY_CLASSIFIER_SCHEMA,
} from "../lib/prompts";
import { sanitizeLlmInput } from "../lib/utils";
import * as Sentry from "@sentry/nextjs";

/**
 * Classifies an incoming email reply and updates the reply record.
 * Uses Gemini 3.1 Flash-Lite at temperature=0 for deterministic classification.
 * Flash-Lite is ~6x cheaper than 3.5 Flash for this 7-class classification task.
 */
export const classifyReply = action({
  args: {
    replyId: v.id("replyLogs"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; classification?: string; error?: string }> => {
    try {
      // 1. Fetch the reply
      const reply = await ctx.runQuery(internal.replies.getInternal, {
        id: args.replyId,
      });
      if (!reply) throw new Error("Reply log not found");

      const sanitizedReply = sanitizeLlmInput(reply.raw_reply);
      const systemPrompt = REPLY_CLASSIFIER_SYSTEM_PROMPT(sanitizedReply);
      const userMessage = "Classify this email.";

      const apiKey = (await ctx.runQuery(
        internal.settings.getInternalGeminiKey,
      )) as string | null;
      const startMs = Date.now();
      const response = await callFlash({
        apiKey,
        systemPrompt,
        userPrompt: userMessage,
        temperature: TEMP.deterministic,
        maxOutputTokens: 32, // classification needs only a few tokens
        responseAsJson: true,
        responseSchema: REPLY_CLASSIFIER_SCHEMA,
      });
      const latencyMs = Date.now() - startMs;
      console.log(`[ReplyClassifier] Flash-Lite latency: ${latencyMs}ms`);

      const classificationData = JSON.parse(response);

      const validCategories = [
        "meeting_request",
        "positive_interest",
        "request_info",
        "not_interested",
        "opt_out",
        "out_of_office",
        "other",
      ];

      let result = classificationData.category;
      // Compute confidence: direct valid match = high confidence, fallback = low
      let confidence = 0.9;

      if (!result || !validCategories.includes(result)) {
        console.warn(
          `[ReplyClassifier] Invalid classification returned: ${result}. Falling back to other.`,
        );
        result = "other";
        confidence = 0.5; // Low confidence when we had to fall back
      }

      // 2. Update classification in database
      await ctx.runMutation(internal.replies.classify, {
        id: args.replyId,
        classification: result,
        confidence, // computed above — not a stub
      });

      // 3. Trigger Auto-Reply if applicable
      await ctx.scheduler.runAfter(0, api.actions.autoReply.sendAutoReply, {
        universityId: reply.university_id,
        stakeholderId: reply.stakeholder_id,
        classification: result,
      });

      // 4. Update university outreach stage based on classification
      let newStage: string | null = null;
      if (result === "meeting_request") newStage = "meeting_booked";
      else if (result === "opt_out" || result === "not_interested")
        newStage = "not_interested";
      else newStage = "replied";

      if (newStage) {
        await ctx.runMutation(
          internal.universities.updateOutreachStageInternal,
          {
            universityId: reply.university_id,
            stage: newStage as "meeting_booked" | "not_interested" | "replied",
          },
        );
      }

      // 5. Create a draft proposal record when a meeting is booked.
      // ⚠️ HITL GATE: We do NOT auto-trigger generateProposal or auto-book a calendar event.
      // A human must review the meeting request, confirm a time, and click "Generate Proposal"
      // from the University detail panel. This prevents misclassifications from firing
      // proposals to the wrong person at the wrong time and avoids arbitrary calendar invites.
      if (result === "meeting_request") {
        try {
          const proposalId = await ctx.runMutation(
            internal.proposals.createInternal,
            {
              university_id: reply.university_id,
              stakeholder_id: reply.stakeholder_id,
            },
          );

          // Flag the proposal as awaiting human time-confirmation instead of auto-creating a calendar event
          await ctx.runMutation(internal.proposals.updateInternal, {
            id: proposalId,
            calendar_event_status: "pending",
          });

          console.log(
            `[ReplyClassifier] Created draft proposal for ${reply.university_id} — human must confirm meeting time before generating.`,
          );
        } catch (pErr) {
          console.warn(
            "[ReplyClassifier] Draft proposal creation failed (non-fatal):",
            pErr,
          );
        }
      }

      return { success: true, classification: result };
    } catch (e) {
      console.error("[ReplyClassifier] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { replyId: args.replyId },
      });
      return { success: false, error: String(e) };
    }
  },
});
