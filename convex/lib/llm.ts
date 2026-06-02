"use node";

import { GoogleGenAI } from "@google/genai";
import { withRetry } from "./utils";

// ─── Direct Google SDK ───────────────────────────────────────────────
export function getGoogleAI(apiKey?: string | null): GoogleGenAI {
  if (!apiKey) {
    throw new Error(
      "Google Gemini API Key is missing. Please configure it in the Settings dashboard.",
    );
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 20000 } });
}

// ─── Model constants ──────────────────────────────────────────────────────────
export const MODELS = {
  // Gemini 3.5 Flash: proposals, reply classification, enrichment, scoring, personalization
  complex: "gemini-3.5-flash" as const,
  gemini: "gemini-3.5-flash" as const,
  // Gemini Flash-Lite: lowest cost for high-volume tasks
  geminiFlash: "gemini-3.1-flash-lite" as const,
  // Embeddings: 768-dim (direct via Google AI API)
  embedding: "text-embedding-004" as const,
} as const;

// ─── Temperature presets ─────────────────────────────────────────────────────
export const TEMP = {
  deterministic: 0.0, // classification, scoring
  balanced: 0.3, // personalization
  creative: 0.6, // proposal writing
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Helper to identify transient LLM/API errors that are safe to retry.
 * Exported so callers can pass it explicitly to withRetry for LLM operations.
 */
export function isTransientLlmError(err: unknown): boolean {
  const status =
    (err as Record<string, unknown>)?.status ||
    (err as Record<string, unknown>)?.statusCode;
  
  if (
    status === 429 ||
    (typeof status === "number" && status >= 500 && status < 600)
  ) {
    return true;
  }
  
  const msg = err instanceof Error ? err.message : String(err);
  const msgLower = msg.toLowerCase();

  // If the error message has standard non-transient status codes, do NOT retry.
  if (/\b(400|401|403|404)\b/.test(msgLower)) {
    return false;
  }

  // Retry on explicit transient HTTP status codes inside message strings
  if (/\b(429|500|502|503|504)\b/.test(msgLower)) {
    return true;
  }
  
  // Explicit check for halted/blocked prompt/safety policy
  if (msgLower.includes("halted") || msgLower.includes("blockreason") || msgLower.includes("safety")) {
    return false;
  }

  const transientKeywords = [
    "timeout",
    "etimedout",
    "fetch failed",
    "network error",
    "socket hang up",
    "econnrefused",
    "econnreset",
    "deadline",
    "deadline exceeded",
  ];
  return transientKeywords.some(keyword => msgLower.includes(keyword));
}

/**
 * Call Gemini via native @google/genai SDK.
 * Pro models use dynamic thinking by default (cannot be disabled).
 * We configure a thinking budget to guide depth of reasoning for structured extraction.
 */
export async function callGemini({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  responseAsJson = false,
  responseSchema,
  model = MODELS.gemini,
  thinkingBudget,
  maxOutputTokens = 8192,
  apiKey,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: unknown;
  model?: string;
  thinkingBudget?: number;
  maxOutputTokens?: number;
  apiKey?: string | null;
}): Promise<string> {
  // Pro models require thinkingBudget >= 512. Flash models work with thinkingBudget = 0.
  const isProModel = /\bpro\b/i.test(model);
  const resolvedBudget =
    thinkingBudget !== undefined
      ? isProModel
        ? Math.max(512, thinkingBudget)
        : thinkingBudget
      : isProModel
        ? 1024
        : 0;

  const aiClient = getGoogleAI(apiKey);
  const startMs = Date.now();

  const text = await withRetry(
    async () => {
      const response = await aiClient.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature,
          maxOutputTokens,
          responseMimeType: responseAsJson ? "application/json" : "text/plain",
          responseSchema,
          httpOptions: { timeout: 25000 },
          ...(resolvedBudget > 0
            ? {
                thinkingConfig: {
                  thinkingBudget: resolvedBudget,
                  includeThoughts: false,
                },
              }
            : {}),
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
        const blockReason = response.promptFeedback?.blockReason;
        throw new Error(
          `Gemini generation halted: finishReason=${finishReason}${blockReason ? `, blockReason=${blockReason}` : ""}`,
        );
      }

      const txt = response.text;
      if (!txt)
        throw new Error("Unexpected empty response from Gemini via Google SDK");
      return txt;
    },
    { retryOn: isTransientLlmError }
  );

  logLlmTelemetry({ model, systemPrompt, userPrompt, output: text, latencyMs: Date.now() - startMs });
  return text;
}

/**
 * Call Gemini with Google Search grounding enabled.
 * Returns AI-synthesized text + source URLs from grounding metadata.
 */
export async function callGeminiWithGrounding({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  model = MODELS.gemini,
  maxOutputTokens = 8192,
  apiKey,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
  apiKey?: string | null;
}): Promise<{ text: string; sources: string[] }> {
  const aiClient = getGoogleAI(apiKey);
  const startMs = Date.now();

  const result = await withRetry(
    async () => {
      const response = await aiClient.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature,
          maxOutputTokens,
          tools: [{ googleSearch: {} }],
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
        const blockReason = response.promptFeedback?.blockReason;
        throw new Error(
          `Gemini generation halted: finishReason=${finishReason}${blockReason ? `, blockReason=${blockReason}` : ""}`,
        );
      }

      const text = response.text || "";
      const sources =
        candidate?.groundingMetadata?.groundingChunks
          ?.map((c) => c.web?.uri)
          .filter((uri): uri is string => Boolean(uri)) || [];

      return { text, sources };
    },
    { retryOn: isTransientLlmError }
  );

  logLlmTelemetry({ model, systemPrompt, userPrompt, output: result.text, latencyMs: Date.now() - startMs });
  return result;
}

/**
 * Budget constants for Gemini thinking mode.
 * Higher budget = longer latency, deeper reasoning, higher cost.
 */
function logLlmTelemetry({ model, systemPrompt, userPrompt, output, latencyMs }: { model: string; systemPrompt: string; userPrompt: string; output: string; latencyMs: number }) {
  const inputChars = systemPrompt.length + userPrompt.length;
  const outputChars = output.length;
  const estimatedInputTokens = Math.ceil(inputChars / 4);
  const estimatedOutputTokens = Math.ceil(outputChars / 4);
  console.log(
    `[LLM] model=${model} inTokens≈${estimatedInputTokens} outTokens≈${estimatedOutputTokens} latencyMs=${latencyMs}`,
  );
}

export const THINKING = {
  off: 0, // Flash: pure extraction, structured scoring
  low: 512, // Pro: minimal synthesis, light conflict resolution
  medium: 2048, // Pro: multi-source synthesis, complex extraction
  high: 8192, // Pro: complex evaluation, deep step-by-step logic
} as const;

/**
 * Convenience wrapper for gemini-3-flash-preview.
 * Flash is 2.5x faster and 4x cheaper than Pro, achieving near-Pro performance on extraction/scoring.
 * Thinking is forced to 0 by default to maximize speed for extraction tasks.
 */
export async function callFlash(
  args: Omit<Parameters<typeof callGemini>[0], "model" | "thinkingBudget"> & {
    thinkingBudget?: number;
  },
): Promise<string> {
  return callGemini({
    ...args,
    model: MODELS.geminiFlash,
    thinkingBudget: args.thinkingBudget ?? THINKING.off,
  });
}

/**
 * Generate a 768-dimensional embedding using Google's text-embedding-004 via REST API.
 * Falls back to zero-vector if the API is unavailable (embeddings are non-critical).
 * Note: Requires GOOGLE_API_KEY environment variable.
 */
export async function embed(
  text: string,
  apiKey?: string | null,
): Promise<number[]> {
  if (!apiKey) {
    console.warn("[LLM:Embed] No API key — returning zero vector");
    return new Array(768).fill(0);
  }

  const startMs = Date.now();
  try {
    const result = await withRetry(
      async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "models/text-embedding-004",
              content: {
                parts: [{ text }],
              },
            }),
            signal: AbortSignal.timeout(20000),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(JSON.stringify(err));
        }

        const data = await res.json();
        const values = data?.embedding?.values;
        if (!Array.isArray(values) || values.length === 0) {
          throw new Error("Failed to generate embedding — empty response");
        }

        return values as number[];
      },
      {
        maxRetries: 2,
        retryOn: isTransientLlmError,
      },
    );

    const inputChars = text.length;
    const estimatedInputTokens = Math.ceil(inputChars / 4);
    console.log(
      `[LLM:Embed] model=text-embedding-004 inTokens≈${estimatedInputTokens} latencyMs=${Date.now() - startMs}`
    );
    return result;
  } catch (e) {
    console.warn("[LLM:Embed] Embedding API failed — returning zero vector:", e instanceof Error ? e.message : String(e));
    return new Array(768).fill(0);
  }
}
