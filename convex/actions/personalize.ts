"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { callGemini, TEMP } from "../lib/llm";
import { OPENER_SYSTEM_PROMPT } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

/**
 * Generates a personalized 2-sentence opener for an outreach email.
 * Uses signals and university news to create context.
 */
export const generateOpener = action({
  args: {
    universityId: v.id("universities"),
    stakeholderId: v.id("stakeholders"),
  },
  handler: async (ctx, args) => {
    let uniName = "your institution";
    try {
      const uni = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (uni) uniName = uni.university_name;
      if (!uni) throw new Error("University not found");

      const stakeholder = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
        id: args.stakeholderId,
      });
      if (!stakeholder) throw new Error("Stakeholder not found");

      const signals = await ctx.runQuery(internal.signals.listByUniversityInternal, {
        university_id: args.universityId,
      });

      const systemPrompt = OPENER_SYSTEM_PROMPT({
        stakeholderName: stakeholder.name || stakeholder.role || "there",
        universityName: uni.university_name,
        signalContext: signals
          .map((s: any) => `- [${s.signal_type.toUpperCase()}] ${s.content}`)
          .join("\n"),
      });

      const userPrompt = "Write the personalized opener now.";

      const opener = await callGemini({
        systemPrompt,
        userPrompt,
        temperature: TEMP.balanced,
      });

      return opener.trim();
    } catch (e) {
      console.error("[Personalization] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId, stakeholderId: args.stakeholderId },
      });
      // Fallback opener
      return `I've been following the recent developments at ${uniName} and am impressed by your institution's commitment to excellence.`;
    }
  },
});
