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
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 25000 } });
}

// ─── Model constants ──────────────────────────────────────────────────────────
export const MODELS = {
  // Gemini 3.5 Flash: proposals, reply classification, enrichment, scoring, personalization
  complex: "gemini-3.5-flash" as const,
  gemini: "gemini-3.5-flash" as const,
  // Gemini Flash-Lite: lowest cost for high-volume tasks
  geminiFlash: "gemini-3.1-flash-lite" as const,
  // Embeddings: 768-dim via Gemini Embedding API (truncated from 3072)
  embedding: "gemini-embedding-001" as const,
} as const;

// ─── Temperature presets ─────────────────────────────────────────────────────
export const TEMP = {
  deterministic: 0.0, // classification, scoring
  balanced: 0.3, // personalization
  creative: 0.6, // proposal writing
} as const;

const MODEL_PRICING_USD_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.1-flash-lite": { input: 0.075, output: 0.3 },
};

export interface LlmUsageEntry {
  label: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  tokenSource: "api_usage" | "estimated";
}

export interface LlmUsageSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  entries: LlmUsageEntry[];
}

interface GeminiGenerateResponseLike {
  usageMetadata?: object | null;
}

function roundUsd(value: number): number {
  return Number(value.toFixed(6));
}

function estimateTokensFromText(text: string | undefined | null): number {
  return Math.ceil((text || "").length / 4);
}

function getModelPricing(model: string): { input: number; output: number } {
  return (
    MODEL_PRICING_USD_PER_MILLION[model] ||
    MODEL_PRICING_USD_PER_MILLION[MODELS.geminiFlash]
  );
}

function readUsageNumber(
  usage: object | null | undefined,
  keys: string[],
): number | undefined {
  if (!usage) return undefined;
  const record = usage as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function createLlmUsageEntry({
  label,
  model,
  response,
  fallbackInputTokens = 0,
  fallbackOutputTokens = 0,
}: {
  label: string;
  model: string;
  response?: GeminiGenerateResponseLike | null;
  fallbackInputTokens?: number;
  fallbackOutputTokens?: number;
}): LlmUsageEntry {
  const usage = response?.usageMetadata;
  const usageRecord = usage as Record<string, unknown> | undefined;
  const inputTokens =
    readUsageNumber(usage, [
      "promptTokenCount",
      "inputTokenCount",
      "promptTokens",
    ]) ?? fallbackInputTokens;
  const outputTokens =
    readUsageNumber(usage, [
      "candidatesTokenCount",
      "candidateTokenCount",
      "outputTokenCount",
      "outputTokens",
    ]) ?? fallbackOutputTokens;
  const totalTokens =
    readUsageNumber(usage, ["totalTokenCount", "totalTokens"]) ??
    inputTokens + outputTokens;
  const pricing = getModelPricing(model);
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.input;
  const outputCostUsd = (outputTokens / 1_000_000) * pricing.output;

  return {
    label,
    model,
    inputTokens,
    outputTokens,
    totalTokens,
    inputCostUsd: roundUsd(inputCostUsd),
    outputCostUsd: roundUsd(outputCostUsd),
    totalCostUsd: roundUsd(inputCostUsd + outputCostUsd),
    tokenSource:
      usageRecord &&
      (typeof usageRecord.promptTokenCount === "number" ||
        typeof usageRecord.inputTokenCount === "number" ||
        typeof usageRecord.candidatesTokenCount === "number" ||
        typeof usageRecord.outputTokenCount === "number")
        ? "api_usage"
        : "estimated",
  };
}

export function summarizeLlmUsage(entries: LlmUsageEntry[]): LlmUsageSummary {
  const summary = entries.reduce<LlmUsageSummary>(
    (acc, entry) => {
      acc.calls += 1;
      acc.inputTokens += entry.inputTokens;
      acc.outputTokens += entry.outputTokens;
      acc.totalTokens += entry.totalTokens;
      acc.inputCostUsd += entry.inputCostUsd;
      acc.outputCostUsd += entry.outputCostUsd;
      acc.totalCostUsd += entry.totalCostUsd;
      acc.entries.push(entry);
      return acc;
    },
    {
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      inputCostUsd: 0,
      outputCostUsd: 0,
      totalCostUsd: 0,
      entries: [],
    },
  );

  return {
    ...summary,
    inputCostUsd: roundUsd(summary.inputCostUsd),
    outputCostUsd: roundUsd(summary.outputCostUsd),
    totalCostUsd: roundUsd(summary.totalCostUsd),
  };
}

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
  label,
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
  label?: string;
}): Promise<string> {
  const result = await callGeminiWithUsage({
    systemPrompt,
    userPrompt,
    temperature,
    responseAsJson,
    responseSchema,
    model,
    thinkingBudget,
    maxOutputTokens,
    apiKey,
    label,
  });
  return result.text;
}

export async function callGeminiWithUsage({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  responseAsJson = false,
  responseSchema,
  model = MODELS.gemini,
  thinkingBudget,
  maxOutputTokens = 8192,
  apiKey,
  label = "gemini_call",
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
  label?: string;
}): Promise<{ text: string; usage: LlmUsageEntry }> {
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

  const { text, usage } = await withRetry(
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
      return {
        text: txt,
        usage: createLlmUsageEntry({
          label,
          model,
          response,
          fallbackInputTokens: estimateTokensFromText(
            `${systemPrompt}\n${userPrompt}`,
          ),
          fallbackOutputTokens: estimateTokensFromText(txt),
        }),
      };
    },
    { retryOn: isTransientLlmError }
  );

  logLlmTelemetry({
    model,
    usage,
    latencyMs: Date.now() - startMs,
  });
  return { text, usage };
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
  const result = await callGeminiWithGroundingAndUsage({
    systemPrompt,
    userPrompt,
    temperature,
    model,
    maxOutputTokens,
    apiKey,
  });
  return { text: result.text, sources: result.sources };
}

export async function callGeminiWithGroundingAndUsage({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  model = MODELS.gemini,
  maxOutputTokens = 8192,
  apiKey,
  label = "gemini_grounding_call",
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
  apiKey?: string | null;
  label?: string;
}): Promise<{ text: string; sources: string[]; usage: LlmUsageEntry }> {
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
          httpOptions: { timeout: 25000 },
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

      return {
        text,
        sources,
        usage: createLlmUsageEntry({
          label,
          model,
          response,
          fallbackInputTokens: estimateTokensFromText(
            `${systemPrompt}\n${userPrompt}`,
          ),
          fallbackOutputTokens: estimateTokensFromText(text),
        }),
      };
    },
    { retryOn: isTransientLlmError }
  );

  logLlmTelemetry({
    model,
    usage: result.usage,
    latencyMs: Date.now() - startMs,
  });
  return result;
}

/**
 * Budget constants for Gemini thinking mode.
 * Higher budget = longer latency, deeper reasoning, higher cost.
 */
function logLlmTelemetry({
  model,
  usage,
  latencyMs,
}: {
  model: string;
  usage: LlmUsageEntry;
  latencyMs: number;
}) {
  console.log(
    `[LLM] model=${model} inTokens=${usage.inputTokens} outTokens=${usage.outputTokens} totalTokens=${usage.totalTokens} totalCostUsd=${usage.totalCostUsd.toFixed(6)} tokenSource=${usage.tokenSource} latencyMs=${latencyMs}`,
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
 * Generate a 768-dimensional embedding using Google's Gemini Embedding API.
 * Uses gemini-embedding-001 with outputDimensionality=768 to stay compatible
 * with the existing 768-dim vector index. Falls back to zero-vector on failure.
 * Note: Uses the same API key as Gemini chat (getInternalGeminiKey).
 */
export async function embed(
  text: string,
  apiKey?: string | null,
): Promise<number[]> {
  if (!apiKey) {
    console.warn("[LLM:Embed] No API key — returning zero vector");
    return new Array(768).fill(0);
  }

  const MODEL = MODELS.embedding;
  const startMs = Date.now();
  try {
    const result = await withRetry(
      async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: `models/${MODEL}`,
              content: {
                parts: [{ text }],
              },
              outputDimensionality: 768,
            }),
            signal: AbortSignal.timeout(25000),
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
      `[LLM:Embed] model=${MODEL} inTokens≈${estimatedInputTokens} latencyMs=${Date.now() - startMs}`
    );
    return result;
  } catch (e) {
    console.warn("[LLM:Embed] Embedding API failed — returning zero vector:", e instanceof Error ? e.message : String(e));
    return new Array(768).fill(0);
  }
}
