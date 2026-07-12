"use node";

import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { validateAuth } from "../lib/auth_utils";
import { callFlash, TEMP } from "../lib/llm";
import {
  REPLY_CLASSIFIER_SYSTEM_PROMPT,
  REPLY_CLASSIFIER_SCHEMA,
} from "../lib/prompts";
import { sanitizeLlmInput } from "../lib/utils";
import * as Sentry from "@sentry/node";

/**
 * Classifies an incoming email reply and updates the reply record.
 * Uses Gemini 3.1 Flash-Lite at temperature=0 for deterministic classification.
 * Flash-Lite is ~6x cheaper than 3.5 Flash for this 7-class classification task.
 */
export const classifyReplyInternal = internalAction({
  args: {
    replyId: v.id("replyLogs"),
    triggerAutoReply: v.optional(v.boolean()),
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

      const MAX_REPLY_CHARS = 2000;
      const truncatedReply = reply.raw_reply.slice(0, MAX_REPLY_CHARS);
      const sanitizedReply = sanitizeLlmInput(truncatedReply);
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
        ctx,
        skipCache: true,
      });
      const latencyMs = Date.now() - startMs;
      console.log(`[ReplyClassifier] Flash-Lite latency: ${latencyMs}ms`);

      const classificationData = JSON.parse(response);
      const rawConfidence =
        typeof classificationData.confidence === "number"
          ? classificationData.confidence
          : undefined;

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
      // Compute confidence: use model-reported confidence if present, else high default, fallback = low
      let confidence =
        rawConfidence !== undefined ? Math.max(0, Math.min(1, rawConfidence)) : 0.9;

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

      // 3. Trigger Auto-Reply if applicable (enabled by default)
      // HITL GATE: Low-confidence high-stakes classifications require human review.
      const isHighStakes = result === "meeting_request" || result === "positive_interest";
      const hasLowConfidence = confidence < 0.85;
      const shouldTriggerAutoReply = args.triggerAutoReply !== false && !(isHighStakes && hasLowConfidence);

      if (shouldTriggerAutoReply) {
        await ctx.scheduler.runAfter(0, internal.actions.autoReply.sendAutoReply, {
          universityId: reply.university_id,
          stakeholderId: reply.stakeholder_id,
          classification: result,
        });
      } else {
        if (isHighStakes && hasLowConfidence) {
          console.warn(
            `[ReplyClassifier] Auto-reply BLOCKED for replyId=${args.replyId}: classification="${result}" with confidence=${confidence.toFixed(2)} (< 0.85). Human review required.`,
          );
        } else {
          console.log(
            `[ReplyClassifier] Auto-reply suppressed for replyId=${args.replyId}`,
          );
        }
      }

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
          const existingProposals = await ctx.runQuery(
            internal.proposals.listByUniversityInternal,
            {
              university_id: reply.university_id,
            },
          );
          const hasUnsentProposal = (existingProposals as Array<{ stakeholder_id?: string; status: string }>)
            .some(
              (p) =>
                p.stakeholder_id === reply.stakeholder_id &&
                p.status !== "sent",
            );
          if (hasUnsentProposal) {
            console.log(
              `[ReplyClassifier] Unsent proposal already exists for ${reply.university_id}/${reply.stakeholder_id}, skipping creation.`,
            );
          } else {
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
          }
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

export const classifyReply = action({
  args: {
    replyId: v.id("replyLogs"),
    triggerAutoReply: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ success: boolean; classification?: string; error?: string }> => {
    await validateAuth(ctx);
    return await ctx.runAction(
      internal.actions.replyClassifier.classifyReplyInternal,
      args,
    );
  },
});
