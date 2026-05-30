import { mutation, query, action, internalQuery, internalMutation } from "./_generated/server";
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
  return btoa(out);
}

function deobfuscate(cipher: string): string {
  const raw = atob(cipher);
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
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        // Fallback for plaintext legacy keys
        return doc.value;
      }
    }
    return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? null;
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

    // Keep in sync with MODELS.gemini in convex/lib/llm.ts
    const TEST_MODEL = "gemini-3.5-flash";

    try {
      const ai = new GoogleGenAI({ apiKey: args.apiKey });
      const response = await ai.models.generateContent({
        model: TEST_MODEL,
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

export const testSerperKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": args.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: "test" }),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return { success: true };
      }
      const err = await res.text().catch(() => "Invalid response");
      return { success: false, error: `Serper API error (${res.status}): ${err}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test Serper key." };
    }
  },
});

export const testFirecrawlKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    try {
      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com" }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok || res.status === 402) {
        // 402 = payment required (key is valid but quota exceeded) — still counts as valid key
        return { success: true };
      }
      const err = await res.text().catch(() => "Invalid response");
      return { success: false, error: `Firecrawl API error (${res.status}): ${err}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test Firecrawl key." };
    }
  },
});

export const testSendgridKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    try {
      const res = await fetch("https://api.sendgrid.com/v3/user/profile", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return { success: true };
      }
      const err = await res.text().catch(() => "Invalid response");
      return { success: false, error: `SendGrid API error (${res.status}): ${err}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test SendGrid key." };
    }
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
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    // Fallback to env var if not yet seeded into settings DB
    return process.env.SERPER_API_KEY ?? null;
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
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    return process.env.FIRECRAWL_API_KEY ?? null;
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

export const setFirecrawlKeyInternal = internalMutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
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
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    return process.env.SENDGRID_API_KEY ?? null;
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

// ─── GOOGLE CALENDAR SERVICE ACCOUNT JSON ──────────────────────────────────

export const getGoogleCalendarStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarServiceAccount"))
      .first();

    return {
      hasGoogleCalendarServiceAccount: !!doc?.value,
    };
  },
});

export const getInternalGoogleCalendarJson = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarServiceAccount"))
      .first();
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? null;
  },
});

export const setGoogleCalendarJson = mutation({
  args: { serviceAccountJson: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    // Basic validation: must be valid JSON with client_email and private_key
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args.serviceAccountJson);
    } catch {
      throw new Error("Invalid JSON format for service account key");
    }
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Service account JSON must contain client_email and private_key");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarServiceAccount"))
      .first();

    const cipher = obfuscate(args.serviceAccountJson);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "googleCalendarServiceAccount",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeGoogleCalendarJson = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarServiceAccount"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// ─── GOOGLE CALENDAR ID ────────────────────────────────────────────────────

export const getGoogleCalendarIdStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarId"))
      .first();

    let calendarId: string | null = null;
    if (doc?.value) {
      try {
        calendarId = deobfuscate(doc.value);
      } catch {
        calendarId = doc.value;
      }
    }

    return {
      hasGoogleCalendarId: !!doc?.value,
      calendarId,
    };
  },
});

export const getInternalGoogleCalendarId = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarId"))
      .first();
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    return process.env.GOOGLE_CALENDAR_ID ?? "primary";
  },
});

export const setGoogleCalendarId = mutation({
  args: { calendarId: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarId"))
      .first();

    const cipher = obfuscate(args.calendarId);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "googleCalendarId",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeGoogleCalendarId = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "googleCalendarId"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// ─── SENDGRID FROM EMAIL ─────────────────────────────────────────────────────

export const getSendgridFromEmailStatus = query({
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridFromEmail"))
      .first();

    let fromEmail: string | null = null;
    if (doc?.value) {
      try {
        fromEmail = deobfuscate(doc.value);
      } catch {
        fromEmail = doc.value;
      }
    }

    return {
      hasSendgridFromEmail: !!doc?.value,
      fromEmail,
    };
  },
});

export const getInternalSendgridFromEmail = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridFromEmail"))
      .first();
    if (doc?.value) {
      try {
        return deobfuscate(doc.value);
      } catch {
        return doc.value;
      }
    }
    return process.env.SENDGRID_FROM_EMAIL ?? "outreach@fretbox.in";
  },
});

export const setSendgridFromEmail = mutation({
  args: { fromEmail: v.string() },
  handler: async (ctx, args) => {
    await ensureAuth(ctx);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(args.fromEmail)) {
      throw new Error("Invalid email format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridFromEmail"))
      .first();

    const cipher = obfuscate(args.fromEmail);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "sendgridFromEmail",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeSendgridFromEmail = mutation({
  args: {},
  handler: async (ctx) => {
    await ensureAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "sendgridFromEmail"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});
