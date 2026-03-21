"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { callGemini, TEMP, MODELS } from "../lib/llm";
import { REPLY_CLASSIFIER_SYSTEM_PROMPT, REPLY_CLASSIFIER_SCHEMA } from "../lib/prompts";
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

      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey) as string | null;
      const response = await callGemini({
        apiKey,
        systemPrompt,
        userPrompt: userMessage,
        temperature: TEMP.deterministic,
        maxOutputTokens: 50,
        model: MODELS.complex,
        responseAsJson: true,
        responseSchema: REPLY_CLASSIFIER_SCHEMA,
      });

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

      if (!result || !validCategories.includes(result)) {
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

      // 5. Auto-generate proposal when meeting is booked
      if (result === "meeting_request") {
        try {
          const proposalId = await ctx.runMutation(internal.proposals.createInternal, {
            university_id: reply.university_id,
            stakeholder_id: reply.stakeholder_id,
            meeting_date: Date.now(),
          });
          await ctx.scheduler.runAfter(0, api.actions.proposals.generateProposal, {
            universityId: reply.university_id,
            proposalId,
            stakeholderId: reply.stakeholder_id,
          });
          console.log(`[ReplyClassifier] Auto-triggered proposal generation for ${reply.university_id}`);
        } catch (pErr) {
          console.warn("[ReplyClassifier] Auto-proposal failed (non-fatal):", pErr);
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
