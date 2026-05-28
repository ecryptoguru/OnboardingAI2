import { mutation, query, action, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { getAuthUserId } from "@convex-dev/auth/server";

// ─── Auth helper ───────────────────────────────────────────────────────────
// Centralises the dev-bypass check used across every settings endpoint.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureAuth(ctx: any) {
  const isDev = process.env.NODE_ENV === "development";
  const bypassSecret = process.env.DEV_AUTH_BYPASS_SECRET;
  const bypassEnabled = isDev && !!bypassSecret;
  if (bypassEnabled) return;
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthenticated");
}

// ─── Simple reversible obfuscation for stored API keys ─────────────────────
// NOT encryption — just prevents casual plaintext exposure in DB dumps.
// The secret MUST be set via SETTINGS_OBFUSCATION_SECRET env var.
const OBF_SECRET = process.env.SETTINGS_OBFUSCATION_SECRET as
  | string
  | undefined;
if (!OBF_SECRET) {
  throw new Error(
    "SETTINGS_OBFUSCATION_SECRET is required in all environments",
  );
}
const _OBF_SECRET = OBF_SECRET;

function obfuscate(plain: string): string {
  let out = "";
  for (let i = 0; i < plain.length; i++) {
    out += String.fromCharCode(
      plain.charCodeAt(i) ^ _OBF_SECRET.charCodeAt(i % _OBF_SECRET.length),
    );
  }
  return Buffer.from(out).toString("base64");
}

function deobfuscate(cipher: string): string {
  const raw = Buffer.from(cipher, "base64").toString("binary");
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    out += String.fromCharCode(
      raw.charCodeAt(i) ^ _OBF_SECRET.charCodeAt(i % _OBF_SECRET.length),
    );
  }
  return out;
}

export const getGeminiKeyStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

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
    if (!doc?.value) return null;
    try {
      return deobfuscate(doc.value);
    } catch {
      // Fallback for plaintext legacy keys
      return doc.value;
    }
  },
});

export const setGeminiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    // Check if the key looks like a Gemini key
    if (!args.apiKey.startsWith("AIza")) {
      throw new Error("Invalid Google Gemini API Key format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();

    const cipher = obfuscate(args.apiKey);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "geminiApiKey",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const testGeminiKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    try {
      const ai = new GoogleGenAI({ apiKey: args.apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: "Return only the word OK",
        config: { maxOutputTokens: 5 },
      });
      if (
        response &&
        response.text &&
        response.text.toLowerCase().includes("ok")
      ) {
        return { success: true };
      }
      return {
        success: false,
        error: "Received unexpected response from Gemini.",
      };
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : "Failed to validate API key.";
      return {
        success: false,
        error: errorMessage,
      };
    }
  },
});

export const removeGeminiKey = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// --- SERPER API KEY ---

export const getSerperKeyStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();

    return {
      hasSerperKey: !!doc?.value,
      isEnvFallback: false,
    };
  },
});

export const getInternalSerperKey = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();
    if (!doc?.value) return null;
    try {
      return deobfuscate(doc.value);
    } catch {
      return doc.value;
    }
  },
});

export const setSerperKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    if (args.apiKey.length < 32) {
      throw new Error("Invalid Serper API Key format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();

    const cipher = obfuscate(args.apiKey);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "serperApiKey",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeSerperKey = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// --- FIRECRAWL API KEY ---

export const getFirecrawlKeyStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "firecrawlApiKey"))
      .first();

    return {
      hasFirecrawlKey: !!doc?.value,
    };
  },
});

export const getInternalFirecrawlKey = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "firecrawlApiKey"))
      .first();
    if (!doc?.value) return null;
    try {
      return deobfuscate(doc.value);
    } catch {
      return doc.value;
    }
  },
});

export const setFirecrawlKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    if (args.apiKey.length < 20) {
      throw new Error("Invalid Firecrawl API Key format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "firecrawlApiKey"))
      .first();

    const cipher = obfuscate(args.apiKey);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "firecrawlApiKey",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeFirecrawlKey = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "firecrawlApiKey"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// --- SENDGRID API KEY ---

export const getSendgridKeyStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridApiKey"))
      .first();

    return {
      hasSendgridKey: !!doc?.value,
    };
  },
});

export const getInternalSendgridKey = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridApiKey"))
      .first();
    if (!doc?.value) return null;
    try {
      return deobfuscate(doc.value);
    } catch {
      return doc.value;
    }
  },
});

export const setSendgridKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    if (!args.apiKey.startsWith("SG.")) {
      throw new Error("Invalid SendGrid API Key format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridApiKey"))
      .first();

    const cipher = obfuscate(args.apiKey);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "sendgridApiKey",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeSendgridKey = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridApiKey"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});
