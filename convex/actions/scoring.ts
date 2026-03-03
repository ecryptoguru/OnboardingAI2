"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { callGemini } from "../lib/llm";
import { calculateDeterministicScore } from "../lib/scoring";
import { SCORING_SYSTEM_PROMPT, SCORING_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

// SYSTEM_PROMPT removed (using centralized prompts)

export const scoreUniversity = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!uni) throw new Error("University not found");

    const signals = await ctx.runQuery(internal.signals.listByUniversityInternal, {
      university_id: args.universityId,
    });

    console.log(`[Scoring] Starting scoring for ${uni.university_name}`);

    // 1. Deterministic Score
    const { deterministic_score, factors } = calculateDeterministicScore(uni, signals);

    // 2. AI Score (Gemini 3 Flash)
    let ai_score = 5; // default fallback
    try {
      if (signals.length > 0) {
        const signalText = signals
          .map((s: any) => `[${s.signal_type.toUpperCase()}] ${s.content}`)
          .join("\n");
        const prompt = `University: ${uni.university_name}\nSignals:\n${signalText}`;

        const resultText = await callGemini({
          systemPrompt: SCORING_SYSTEM_PROMPT,
          userPrompt: prompt,
          responseAsJson: true,
          responseSchema: SCORING_SCHEMA,
          temperature: 0.2, // low temp for scoring
        });

        const parsed = JSON.parse(resultText);
        if (typeof parsed.ai_score === "number") {
          ai_score = Math.min(10, Math.max(0, parsed.ai_score));
          console.log(`[Scoring] AI Score from Gemini: ${ai_score}/10`);
        }
      } else {
         console.log(`[Scoring] No signals found, using default AI score: 5/10`);
      }
    } catch (e) {
      console.error("[Scoring] Gemini scoring failed, using default:", e);
    }

    // 3. Final Score
    // Deterministic is out of 100. AI is 0-10 (scale up to 100).
    // Let's use 70% deterministic, 30% AI.
    const final_score = Math.round(deterministic_score * 0.7 + ai_score * 10 * 0.3);

    // 4. Determine Lead Tier
    let lead_tier: "High" | "Medium" | "Low" = "Low";
    if (final_score >= 65) lead_tier = "High";
    else if (final_score >= 35) lead_tier = "Medium";

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
      `[Scoring] Completed for ${uni.university_name}. Final: ${final_score}, Tier: ${lead_tier}`
    );

    return {
      success: true,
      deterministic_score,
      ai_score,
      final_score,
      lead_tier,
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
