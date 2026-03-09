"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { callClaude, TEMP } from "../lib/llm";
import { REPLY_CLASSIFIER_SYSTEM_PROMPT } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

/**
 * Classifies an incoming email reply and updates the reply record.
 * Uses Claude 3.7 Sonnet for high-accuracy nuance detection.
 */
export const classifyReply = action({
  args: {
    replyId: v.id("replyLogs"),
  },
  handler: async (ctx, args): Promise<{ success: boolean; classification?: string; error?: string }> => {
    try {
      // 1. Fetch the reply
      const reply = await ctx.runQuery(internal.replies.getInternal, {
        id: args.replyId,
      });
      if (!reply) throw new Error("Reply log not found");

      const systemPrompt = REPLY_CLASSIFIER_SYSTEM_PROMPT(reply.raw_reply);
      const userMessage = "Classify this email.";

      const classification = await callClaude({
        system: systemPrompt,
        userMessage,
        temperature: TEMP.deterministic,
        maxTokens: 50,
      });

      const validCategories = [
        "meeting_request",
        "positive_interest",
        "request_info",
        "not_interested",
        "opt_out",
        "out_of_office",
        "other",
      ];

      let result = classification.trim().toLowerCase() as any;

      if (!validCategories.includes(result)) {
        console.warn(
          `[ReplyClassifier] Invalid classification returned: ${result}. Falling back to other.`
        );
        result = "other";
      }

      // 2. Update classification in database
      await ctx.runMutation(internal.replies.classify, {
        id: args.replyId,
        classification: result,
        confidence: 0.95, // Stub confidence
      });

      // 3. Trigger Auto-Reply if applicable
      await ctx.scheduler.runAfter(0, api.actions.autoReply.sendAutoReply, {
        universityId: reply.university_id,
        stakeholderId: reply.stakeholder_id,
        classification: result,
      });

      // 4. Update university outreach stage based on classification
      let newStage: any = null;
      if (result === "meeting_request") newStage = "meeting_booked";
      else if (result === "opt_out" || result === "not_interested") newStage = "not_interested";
      else newStage = "replied";

      if (newStage) {
        await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
          universityId: reply.university_id,
          stage: newStage,
        });
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
