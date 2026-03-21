import { mutation, query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getGeminiKeyStatus = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { hasGeminiKey: false };
    
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();
      
    return {
      hasGeminiKey: !!doc?.value,
    };
  },
});

export const getInternalGeminiKey = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();
    return doc?.value || null;
  },
});

export const setGeminiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    
    // Check if the key looks like a Gemini key
    if (!args.apiKey.startsWith("AIza")) {
      throw new Error("Invalid Google Gemini API Key format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();
      
    if (doc) {
      await ctx.db.patch(doc._id, { value: args.apiKey });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "geminiApiKey",
        value: args.apiKey,
      });
    }
    return { success: true };
  },
});

export const testGeminiKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    try {
      const ai = new GoogleGenAI({ apiKey: args.apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: "Return only the word OK",
        config: { maxOutputTokens: 5 }
      });
      if (response && response.text && response.text.toLowerCase().includes("ok")) {
        return { success: true };
      }
      return { success: false, error: "Received unexpected response from Gemini." };
    } catch (e: any) {
      return { success: false, error: e.message || "Failed to validate API key." };
    }
  }
});
