"use node";

import { action } from "../_generated/server";
import { embed } from "../lib/llm";
import { internal } from "../_generated/api";

export const testEmbed = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
    if (!apiKey) {
      return { success: false, error: "No Gemini API key configured" };
    }

    try {
      const vector = await embed(
        "Kalinga Institute of Industrial Technology is a university in Odisha, India.",
        apiKey,
      );

      if (!Array.isArray(vector) || vector.length !== 768) {
        return { success: false, error: `Bad dimensions: ${vector?.length}` };
      }

      const hasInvalid = vector.some((v) => !Number.isFinite(v));
      if (hasInvalid) {
        return { success: false, error: "Vector contains non-finite values" };
      }

      return {
        success: true,
        dimensions: vector.length,
        sample: vector.slice(0, 5),
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
});
