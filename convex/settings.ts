import { mutation, query, action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { validateAuth } from "./lib/auth_utils";
import { MODELS } from "./lib/models";

// ─── Simple reversible obfuscation for stored API keys ─────────────────────
// NOT encryption — just prevents casual plaintext exposure in DB dumps.
// The secret MUST be set via SETTINGS_OBFUSCATION_SECRET env var.
//
// IMPORTANT: Read process.env at CALL TIME, not at module load time.
// In Convex V8 isolates (queries/mutations), process.env may not be
// populated when the module is first evaluated, leading to undefined.
const MIN_OBF_SECRET_LENGTH = 32;

export const getObfuscationSecretStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);
    const secret = process.env.SETTINGS_OBFUSCATION_SECRET;
    return {
      isSet: !!secret && secret.length >= MIN_OBF_SECRET_LENGTH,
      isTooShort: !!secret && secret.length < MIN_OBF_SECRET_LENGTH,
    };
  },
});

function getObfSecret(): string {
  const secret = process.env.SETTINGS_OBFUSCATION_SECRET;
  if (!secret) {
    throw new Error(
      "SETTINGS_OBFUSCATION_SECRET is not set. Run: npx convex env set SETTINGS_OBFUSCATION_SECRET <value>",
    );
  }
  if (secret.length < MIN_OBF_SECRET_LENGTH) {
    throw new Error(
      `SETTINGS_OBFUSCATION_SECRET must be at least ${MIN_OBF_SECRET_LENGTH} characters long (currently ${secret.length}).`,
    );
  }
  return secret;
}

/**
 * Encode a UTF-8 string to a base64 string using a byte-level XOR with the
 * secret. This correctly preserves multi-byte UTF-8 characters (e.g. em dashes
 * or non-Latin scripts) that btoa/String.fromCharCode would otherwise corrupt.
 */
function obfuscate(plain: string): string {
  const secret = getObfSecret();
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(plain);
  const secretBytes = encoder.encode(secret);
  const outBytes = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i++) {
    outBytes[i] = plainBytes[i] ^ secretBytes[i % secretBytes.length];
  }
  // Convert bytes to a Latin-1 string so btoa can encode them unchanged.
  let latin1 = "";
  for (let i = 0; i < outBytes.length; i++) {
    latin1 += String.fromCharCode(outBytes[i]);
  }
  return btoa(latin1);
}

function deobfuscate(cipher: string): string {
  const secret = getObfSecret();
  const raw = atob(cipher);
  const secretBytes = new TextEncoder().encode(secret);
  const outBytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    outBytes[i] = raw.charCodeAt(i) ^ secretBytes[i % secretBytes.length];
  }
  return new TextDecoder().decode(outBytes);
}

/**
 * Trims whitespace and rejects values that contain non-printable or invalid
 * HTTP header characters (common when a key was corrupted or copy-pasted
 * with trailing newlines). Returns null if the value is unusable.
 */
function sanitizeApiKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Reject control chars and any non-ASCII characters. API keys should only
  // contain printable ASCII (33–126) to avoid HTTP header issues.
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code >= 33 && code <= 126) continue;
    return null;
  }
  return trimmed;
}

/**
 * Lightweight sanitiser for non-API-key stored values (JSON, email, calendar
 * ID, sender name). Only trims whitespace and rejects empty strings — does
 * NOT reject newlines or other control chars that `sanitizeApiKey` would.
 */
function sanitizeStringValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

export const getGeminiKeyStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);

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
        return sanitizeApiKey(deobfuscate(doc.value)) ?? sanitizeApiKey(doc.value);
      } catch {
        // Fallback for plaintext legacy keys
        return sanitizeApiKey(doc.value);
      }
    }
    return null;
  },
});

export const setGeminiKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    const sanitizedKey = sanitizeApiKey(args.apiKey);
    if (!sanitizedKey) {
      throw new Error("Invalid API key characters");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "geminiApiKey"))
      .first();

    const cipher = obfuscate(sanitizedKey);
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
    await validateAuth(ctx);

    try {
      const ai = new GoogleGenAI({ apiKey: args.apiKey, httpOptions: { timeout: 15000 } });
      const response = await ai.models.generateContent({
        model: MODELS.gemini,
        contents: "Return only the word OK",
        config: { maxOutputTokens: 20 },
      });
      // A valid key reaches the Gemini API and returns candidates. The model
      // may return an empty/short response due to token limits, but the call
      // itself succeeding proves the key is authorized.
      if (
        response &&
        (response.text?.toLowerCase().includes("ok") ||
          (response.candidates && response.candidates.length > 0))
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

export const testGeminiKeyStored = action({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const key = await ctx.runQuery(internal.settings.getInternalGeminiKey) as string | null;
    if (!key) {
      return { success: false, error: "No Gemini API key configured." };
    }
    try {
      const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15000 } });
      const response = await ai.models.generateContent({
        model: MODELS.gemini,
        contents: "Return only the word OK",
        config: { maxOutputTokens: 20 },
      });
      if (
        response &&
        (response.text?.toLowerCase().includes("ok") ||
          (response.candidates && response.candidates.length > 0))
      ) {
        return { success: true };
      }
      return { success: false, error: "Received unexpected response from Gemini." };
    } catch (e: unknown) {
      return { success: false, error: (e instanceof Error ? e.message : "Failed to validate stored API key.") };
    }
  },
});

export const removeGeminiKey = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);

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
    await validateAuth(ctx);

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

export const testSerperKeyStored = action({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const key = await ctx.runQuery(internal.settings.getInternalSerperKey) as string | null;
    if (!key) {
      return { success: false, error: "No Serper API key configured." };
    }
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": key,
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
      return { success: false, error: (e as Error).message || "Failed to test stored Serper key." };
    }
  },
});

export const testFirecrawlKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
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

export const testFirecrawlKeyStored = action({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const key = await ctx.runQuery(internal.settings.getInternalFirecrawlKey) as string | null;
    if (!key) {
      return { success: false, error: "No Firecrawl API key configured." };
    }
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://example.com", formats: ["markdown"], onlyMainContent: true }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok || res.status === 402) {
        return { success: true };
      }
      const err = await res.text().catch(() => "Invalid response");
      return { success: false, error: `Firecrawl API error (${res.status}): ${err}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test stored Firecrawl key." };
    }
  },
});

function isZeptoMailKeyAccepted(status: number, body: string): boolean {
  if (status >= 200 && status < 300) return true;
  if (status === 400 || status === 422) return true;
  if (status === 401) {
    // ZeptoMail returns 401 for both auth and validation errors. Parse the body
    // to distinguish an invalid token from a valid key with a malformed request.
    try {
      const parsed = JSON.parse(body) as {
        error?: {
          code?: string;
          details?: Array<{ code?: string; message?: string; target?: string; inner_error?: { code?: string; message?: string } }>;
          message?: string;
        };
      };
      const details = parsed.error?.details ?? [];
      const hasRecipientError = details.some(
        (d) =>
          d.code === "SM_113" &&
          (d.target?.includes("to") || d.target?.includes("cc") || d.target?.includes("bcc")),
      );
      const hasNoRecipients = details.some(
        (d) => d.inner_error?.code === "SMI_116" || d.inner_error?.message?.toLowerCase().includes("no valid recipients"),
      );
      if (hasRecipientError || hasNoRecipients) return true;
    } catch {
      // Ignore parse errors; fall through to failure.
    }
  }
  return false;
}

export const testZeptomailKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    // Users often paste the full "Zoho-enczapikey <token>" string. Strip the
    // prefix before testing so it behaves the same as the stored key.
    const rawKey = args.apiKey.replace(/^Zoho-enczapikey\s*/i, "").trim();

    try {
      const res = await fetch("https://api.zeptomail.in/v1.1/email", {
        method: "POST",
        headers: {
          Authorization: `Zoho-enczapikey ${rawKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { address: "outreach@fretbox.in" },
          to: [],
          subject: "Key Validation Test",
          textbody: "This is a validation test.",
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.text().catch(() => "Invalid response");
      if (isZeptoMailKeyAccepted(res.status, body)) {
        return { success: true };
      }
      return { success: false, error: `ZeptoMail API error (${res.status}): ${body}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test ZeptoMail key." };
    }
  },
});

export const testZeptomailKeyStored = action({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const key = await ctx.runQuery(internal.settings.getInternalZeptomailKey) as string | null;
    if (!key) {
      return { success: false, error: "No ZeptoMail API key configured." };
    }
    try {
      const res = await fetch("https://api.zeptomail.in/v1.1/email", {
        method: "POST",
        headers: {
          Authorization: `Zoho-enczapikey ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: { address: "outreach@fretbox.in" },
          to: [],
          subject: "Key Validation Test",
          textbody: "This is a validation test.",
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.text().catch(() => "Invalid response");
      if (isZeptoMailKeyAccepted(res.status, body)) {
        return { success: true };
      }
      return { success: false, error: `ZeptoMail API error (${res.status}): ${body}` };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test stored ZeptoMail key." };
    }
  },
});

// --- SERPER API KEY ---

export const getSerperKeyStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();

    return {
      hasSerperKey: !!doc?.value,
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
        return sanitizeApiKey(deobfuscate(doc.value)) ?? sanitizeApiKey(doc.value);
      } catch {
        return sanitizeApiKey(doc.value);
      }
    }
    return null;
  },
});

export const setSerperKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    if (args.apiKey.length < 32) {
      throw new Error("Invalid Serper API Key format");
    }

    const sanitizedKey = sanitizeApiKey(args.apiKey);
    if (!sanitizedKey) {
      throw new Error("Invalid API key characters");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "serperApiKey"))
      .first();

    const cipher = obfuscate(sanitizedKey);
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
    await validateAuth(ctx);

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
    await validateAuth(ctx);

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
        return sanitizeApiKey(deobfuscate(doc.value)) ?? sanitizeApiKey(doc.value);
      } catch {
        return sanitizeApiKey(doc.value);
      }
    }
    return null;
  },
});

export const setFirecrawlKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    if (args.apiKey.length < 20) {
      throw new Error("Invalid Firecrawl API Key format");
    }

    const sanitizedKey = sanitizeApiKey(args.apiKey);
    if (!sanitizedKey) {
      throw new Error("Invalid API key characters");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "firecrawlApiKey"))
      .first();

    const cipher = obfuscate(sanitizedKey);
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
    await validateAuth(ctx);

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

// --- ZEPTOMAIL API KEY ---

export const getZeptomailKeyStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailApiKey"))
      .first();

    return {
      hasZeptomailKey: !!doc?.value,
    };
  },
});

function normalizeZeptomailKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.replace(/^Zoho-enczapikey\s*/i, "").trim();
}

export const getInternalZeptomailKey = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailApiKey"))
      .first();
    if (doc?.value) {
      try {
        return normalizeZeptomailKey(
          sanitizeApiKey(deobfuscate(doc.value)) ?? sanitizeApiKey(doc.value),
        );
      } catch {
        return normalizeZeptomailKey(sanitizeApiKey(doc.value));
      }
    }
    return null;
  },
});

export const setZeptomailKey = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    // Users often paste the full "Zoho-enczapikey <token>" string from the
    // ZeptoMail dashboard. Strip the prefix and keep only the raw token.
    const rawKey = args.apiKey
      .replace(/^Zoho-enczapikey\s*/i, "")
      .trim();

    if (rawKey.length < 20) {
      throw new Error("Invalid ZeptoMail API Key format");
    }

    const sanitizedKey = sanitizeApiKey(rawKey);
    if (!sanitizedKey) {
      throw new Error("Invalid API key characters");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailApiKey"))
      .first();

    const cipher = obfuscate(sanitizedKey);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "zeptomailApiKey",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeZeptomailKey = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailApiKey"))
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
    await validateAuth(ctx);

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
        return sanitizeStringValue(deobfuscate(doc.value)) ?? sanitizeStringValue(doc.value);
      } catch {
        return sanitizeStringValue(doc.value);
      }
    }
    return null;
  },
});

export const setGoogleCalendarJson = mutation({
  args: { serviceAccountJson: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

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
    await validateAuth(ctx);

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
    await validateAuth(ctx);

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
        return sanitizeStringValue(deobfuscate(doc.value)) ?? sanitizeStringValue(doc.value) ?? "primary";
      } catch {
        return sanitizeStringValue(doc.value) ?? "primary";
      }
    }
    return "primary";
  },
});

export const setGoogleCalendarId = mutation({
  args: { calendarId: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

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
    await validateAuth(ctx);

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

// ─── GOOGLE CALENDAR TEST ──────────────────────────────────────────────────

export const testGoogleCalendar = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; error?: string; message?: string }> => {
    await validateAuth(ctx);

    const serviceAccountJson = await ctx.runQuery(
      internal.settings.getInternalGoogleCalendarJson,
    );
    const calendarId = await ctx.runQuery(
      internal.settings.getInternalGoogleCalendarId,
    );

    if (!serviceAccountJson) {
      return { success: false, error: "Google Calendar service account not configured." };
    }

    let sa: { client_email?: string; token_uri?: string; private_key?: string };
    try {
      sa = JSON.parse(serviceAccountJson);
    } catch {
      return { success: false, error: "Invalid service account JSON format." };
    }
    if (!sa.client_email || !sa.private_key) {
      return { success: false, error: "Service account JSON missing client_email or private_key." };
    }

    try {
      const { testCalendarConnection } = await import("./lib/googleCalendar");
      const result = await testCalendarConnection({
        serviceAccountJson,
        calendarId: calendarId ?? undefined,
      });
      if (!result.success) {
        return {
          success: false,
          error: result.error || "Failed to connect to Google Calendar.",
        };
      }
      return {
        success: true,
        message: result.message || "Google Calendar connection successful.",
      };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || "Failed to test Google Calendar integration." };
    }
  },
});

// ─── ZEPTOMAIL FROM EMAIL ────────────────────────────────────────────────────

export const getZeptomailFromEmailStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromEmail"))
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
      hasZeptomailFromEmail: !!doc?.value,
      fromEmail,
    };
  },
});

export const getInternalZeptomailFromEmail = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromEmail"))
      .first();
    if (doc?.value) {
      try {
        return sanitizeStringValue(deobfuscate(doc.value)) ?? sanitizeStringValue(doc.value) ?? "outreach@fretbox.in";
      } catch {
        return sanitizeStringValue(doc.value) ?? "outreach@fretbox.in";
      }
    }
    return "outreach@fretbox.in";
  },
});

export const setZeptomailFromEmail = mutation({
  args: { fromEmail: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(args.fromEmail)) {
      throw new Error("Invalid email format");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromEmail"))
      .first();

    const cipher = obfuscate(args.fromEmail);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "zeptomailFromEmail",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeZeptomailFromEmail = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromEmail"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

// ─── ZEPTOMAIL FROM NAME ─────────────────────────────────────────────────────

export const getZeptomailFromNameStatus = query({
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromName"))
      .first();

    let fromName: string | null = null;
    if (doc?.value) {
      try {
        fromName = deobfuscate(doc.value);
      } catch {
        fromName = doc.value;
      }
    }

    return {
      hasZeptomailFromName: !!doc?.value,
      fromName,
    };
  },
});

export const getInternalZeptomailFromName = internalQuery({
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromName"))
      .first();
    if (doc?.value) {
      try {
        return sanitizeStringValue(deobfuscate(doc.value)) ?? sanitizeStringValue(doc.value) ?? "Ashish Gupta (Fretbox)";
      } catch {
        return sanitizeStringValue(doc.value) ?? "Ashish Gupta (Fretbox)";
      }
    }
    return "Ashish Gupta (Fretbox)";
  },
});

export const setZeptomailFromName = mutation({
  args: { fromName: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    if (args.fromName.length < 2) {
      throw new Error("Sender name must be at least 2 characters");
    }

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromName"))
      .first();

    const cipher = obfuscate(args.fromName);
    if (doc) {
      await ctx.db.patch(doc._id, { value: cipher });
    } else {
      await ctx.db.insert("systemSettings", {
        configKey: "zeptomailFromName",
        value: cipher,
      });
    }
    return { success: true };
  },
});

export const removeZeptomailFromName = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);

    const doc = await ctx.db
      .query("systemSettings")
      .withIndex("by_key", (q) => q.eq("configKey", "zeptomailFromName"))
      .first();

    if (doc) {
      await ctx.db.delete(doc._id);
    }
    return { success: true };
  },
});

