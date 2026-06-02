"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { callFlash } from "../lib/llm";
import { calculateDeterministicScore } from "../lib/scoring";
import { SCORING_SYSTEM_PROMPT, SCORING_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/node";
import { validateRange } from "../lib/utils";

// SYSTEM_PROMPT removed (using centralized prompts)

export const scoreUniversity = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
      const uni = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
      if (!uni) throw new Error("University not found");

      const signals = await ctx.runQuery(
        internal.signals.listByUniversityInternal,
        {
          university_id: args.universityId,
        },
      );

      const stakeholders = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        {
          university_id: args.universityId,
        },
      );

      console.log(`[Scoring] Starting scoring for ${uni.university_name}`);

      // 1. Deterministic Score (Now includes stakeholder count)
      const { deterministic_score, factors } = calculateDeterministicScore(
        uni,
        signals,
        stakeholders.length,
      );

      // 2. AI Score (Gemini 3 Flash)
      let ai_score = 5; // default fallback
      let ai_reasoning = "Insufficient data to provide a detailed AI baseline.";
      try {
        // We now always call the LLM if we have some data (demographics, stakeholders, or signals)
        if (signals.length > 0 || uni.demographics || stakeholders.length > 0) {
          const signalText = signals
            .map(
              (s: { signal_type: string; content: string }) =>
                `[${s.signal_type.toUpperCase()}] ${s.content}`,
            )
            .join("\n");

          const stakeholderText = stakeholders
            .map(
              (s: { name?: string; role?: string }) =>
                `- ${s.name || "Unnamed"} (${s.role || "Unknown role"})`,
            )
            .join("\n");

          const prompt = `
University: ${uni.university_name}
Type: ${uni.type || "Unknown"}
NAAC Grade: ${uni.naac_grade || "Unknown"}

Demographics:
${JSON.stringify(uni.demographics || {}, null, 2)}

Identified Stakeholders:
${stakeholderText || "None found"}

Web/News Signals:
${signalText || "None found"}
`.trim();

          const startMs = Date.now();
          const resultText = await callFlash({
            apiKey,
            systemPrompt: SCORING_SYSTEM_PROMPT,
            userPrompt: prompt,
            responseAsJson: true,
            responseSchema: SCORING_SCHEMA,
            temperature: 0.1, // low temp for objective scoring
            // Flash default — no thinkingBudget needed, fast & cheap
          });
          console.log(
            `[Scoring] Flash-Lite latency: ${Date.now() - startMs}ms`,
          );

          const parsed = JSON.parse(resultText);
          ai_score = validateRange(parsed.ai_score, 0, 10, "ai_score");
          if (
            typeof parsed.ai_reasoning === "string" &&
            parsed.ai_reasoning.trim().length > 0
          ) {
            ai_reasoning = parsed.ai_reasoning;
          }
          console.log(
            `[Scoring] AI Score from Gemini: ${ai_score}/10. Reasoning: ${ai_reasoning}`,
          );
        } else {
          console.log(
            `[Scoring] No signals, demographics, or stakeholders found, using default AI score: 5/10`,
          );
        }
      } catch (e) {
        console.error("[Scoring] Gemini scoring failed, using default:", e);
      }

      // 3. Final Score
      // Deterministic is out of 100. AI is 0-10 (scale up to 100).
      // Let's use 70% deterministic, 30% AI.
      const final_score = Math.round(
        deterministic_score * 0.7 + ai_score * 10 * 0.3,
      );

      // 4. Determine Lead Tier (Adjusted thresholds + AI floor)
      let lead_tier: "High" | "Medium" | "Low" = "Low";
      if (final_score >= 75) lead_tier = "High";
      else if (final_score >= 50) lead_tier = "Medium";
      // AI floor: strong AI conviction (>= 8/10) with reasonable base data should not be Low
      else if (ai_score >= 8.0 && deterministic_score >= 15) lead_tier = "Medium";

      // 5. Update Database in a single consolidated mutation
      await ctx.runMutation(internal.priorityScores.completeScoringInternal, {
        university_id: args.universityId,
        deterministic_score,
        ai_score,
        final_score,
        scoring_factors: factors,
        lead_tier,
        stage: "enriched",
      });

      console.log(
        `[Scoring] Completed for ${uni.university_name}. Final: ${final_score}, Tier: ${lead_tier}`,
      );

      return {
        success: true,
        deterministic_score,
        ai_score,
        final_score,
        lead_tier,
        ai_reasoning,
      };
    } catch (e) {
      console.error("[Scoring] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
