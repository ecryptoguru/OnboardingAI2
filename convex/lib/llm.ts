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
  return new GoogleGenAI({ apiKey });
}

// ─── Model constants ──────────────────────────────────────────────────────────
export const MODELS = {
  // Gemini 3.5 Flash: proposals, reply classification, enrichment, scoring, personalization
  complex: "gemini-3.5-flash" as const,
  gemini: "gemini-3.5-flash" as const,
  // Gemini Flash-Lite: lowest cost for high-volume tasks
  geminiFlash: "gemini-3.1-flash-lite-preview" as const,
  // Embeddings: 768-dim (direct via Google AI API)
  embedding: "text-embedding-005" as const,
} as const;

// ─── Temperature presets ─────────────────────────────────────────────────────
export const TEMP = {
  deterministic: 0.0, // classification, scoring
  balanced: 0.3, // personalization
  creative: 0.6, // proposal writing
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  thinkingBudget, // Auto-applied if not set: Pro → 1024 minimum, non-Pro → off
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
  // LLM generation calls are NOT idempotent — retrying the same prompt charges twice
  // and can return a different (worse) result. Limit to 1 retry only for transient errors.
  return await withRetry(
    async () => {
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
      const response = await aiClient.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature,
          maxOutputTokens,
          responseMimeType: responseAsJson ? "application/json" : "text/plain",
          responseSchema,
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

      const text = response.text;
      if (!text)
        throw new Error("Unexpected empty response from Gemini via Google SDK");
      return text;
    },
    { maxRetries: 1 },
  ); // ⚠️ 1 retry only — generation is non-idempotent
}

/**
 * Budget constants for Gemini thinking mode.
 * Higher budget = longer latency, deeper reasoning, higher cost.
 */
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
 * Generate a 768-dimensional embedding using Google's text-embedding-004.
 * Note: Requires GOOGLE_API_KEY environment variable.
 */
export async function embed(
  text: string,
  apiKey?: string | null,
): Promise<number[]> {
  const result = await getGoogleAI(apiKey).models.embedContent({
    model: MODELS.embedding,
    contents: text,
  });

  if (
    !result.embeddings ||
    result.embeddings.length === 0 ||
    !result.embeddings[0].values
  ) {
    throw new Error("Failed to generate embedding");
  }

  return result.embeddings[0].values;
}
