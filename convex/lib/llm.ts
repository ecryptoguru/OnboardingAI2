"use node";

import { GoogleGenAI } from "@google/genai";
import { createHash } from "crypto";
import { withRetry } from "./utils";
import { getOptionalNumber, getOptionalBoolean } from "./env";
import { internal } from "../_generated/api";
import { ActionCtx } from "../_generated/server";

// ─── Prompt hash for deterministic cache lookup ──────────────────────────────
function hashPrompt(inputs: string[]): string {
  const text = inputs.join("\n");
  return createHash("sha256").update(text).digest("hex");
}

async function checkDailyBudget(ctx: ActionCtx): Promise<void> {
  // NOTE: This is a soft cap. Concurrent LLM calls may read the same budget
  // value before any has been incremented, so the actual spend can slightly
  // exceed the cap under burst load. This is acceptable for cost guardrails;
  // tighten the cap or add queueing if stricter control is needed.
  const maxBudgetUsd = getOptionalNumber("LLM_DAILY_BUDGET_USD", { min: 0 });
  const budget = await ctx.runQuery(internal.llmBudget.getBudgetInternal, {
    maxBudgetUsd,
  });
  if (!budget.withinBudget) {
    throw new Error(
      `Daily LLM budget exceeded: $${budget.totalCostUsd.toFixed(2)} / $${budget.maxBudgetUsd.toFixed(2)}. ` +
        `Set LLM_DAILY_BUDGET_USD env var to raise the cap.`,
    );
  }
}

async function recordLlmSpend(ctx: ActionCtx, usage: LlmUsageEntry): Promise<void> {
  await ctx.runMutation(internal.llmBudget.incrementBudgetInternal, {
    costUsd: usage.totalCostUsd,
    tokens: usage.totalTokens,
  });
}

async function checkLlmCache(
  ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  temperature: number,
): Promise<string | null> {
  const h = hashPrompt([model, String(temperature), systemPrompt, userPrompt]);
  const cached = await ctx.runQuery(internal.llmBudget.getCacheEntryInternal, {
    promptHash: h,
    model,
    temperature,
  });
  if (cached) {
    console.log(`[LLM] Cache hit for hash=${h} model=${model}`);
    return cached.response;
  }
  return null;
}

async function storeLlmCache(
  ctx: ActionCtx,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  temperature: number,
  response: string,
  ttlMs = 48 * 60 * 60 * 1000,
): Promise<void> {
  const h = hashPrompt([model, String(temperature), systemPrompt, userPrompt]);
  await ctx.runMutation(internal.llmBudget.setCacheEntryInternal, {
    promptHash: h,
    model,
    temperature,
    response,
    expiresAt: Date.now() + ttlMs,
  });
}

// ─── Direct Google SDK ───────────────────────────────────────────────
export function getGoogleAI(apiKey?: string | null): GoogleGenAI {
  if (!apiKey) {
    throw new Error(
      "Google Gemini API Key is missing. Please configure it in the Settings dashboard.",
    );
  }
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: 25000 } });
}

// ─── Model constants (imported from models.ts for V8 runtime compatibility) ──
import { MODELS, TEMP, THINKING } from "./models";
export { MODELS, TEMP, THINKING };

const MODEL_PRICING_USD_PER_MILLION: Record<
  string,
  { input: number; output: number }
> = {
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
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

  // Structured status codes are the single source of truth when present.
  if (typeof status === "number") {
    if (status === 429 || (status >= 500 && status < 600)) return true;
    if (status === 400 || status === 401 || status === 403 || status === 404)
      return false;
    // For other codes (e.g. 408) fall through to message analysis.
  }

  const msg = err instanceof Error ? err.message : String(err);
  const msgLower = msg.toLowerCase();

  // Explicit check for halted/blocked prompt/safety policy
  if (
    msgLower.includes("halted") ||
    msgLower.includes("blockreason") ||
    msgLower.includes("safety")
  ) {
    return false;
  }

  // Quota / credit / auth failures should never be retried.
  if (
    msgLower.includes("not enough credits") ||
    msgLower.includes("insufficient credits") ||
    msgLower.includes("quota") ||
    msgLower.includes("rate limit") ||
    msgLower.includes("billing") ||
    msgLower.includes("invalid api key") ||
    msgLower.includes("api key not valid") ||
    msgLower.includes("authentication")
  ) {
    return false;
  }

  // Only regex-scan messages when there is NO structured status.
  if (typeof status !== "number") {
    // Retry on explicit transient HTTP status codes inside message strings
    if (/\b(429|500|502|503|504)\b/.test(msgLower)) {
      return true;
    }
    // Treat explicit non-transient codes in messages as non-retryable
    if (/\b(400|401|403|404)\b/.test(msgLower)) {
      return false;
    }
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
  return transientKeywords.some((keyword) => msgLower.includes(keyword));
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
  fallbackModel,
  thinkingBudget,
  maxOutputTokens = 8192,
  apiKey,
  label,
  ctx,
  skipBudgetCheck,
  skipCache,
  cacheTtlMs,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: unknown;
  model?: string;
  fallbackModel?: string;
  thinkingBudget?: number;
  maxOutputTokens?: number;
  apiKey?: string | null;
  label?: string;
  ctx?: ActionCtx;
  skipBudgetCheck?: boolean;
  skipCache?: boolean;
  cacheTtlMs?: number;
}): Promise<string> {
  const result = await callGeminiWithUsage({
    systemPrompt,
    userPrompt,
    temperature,
    responseAsJson,
    responseSchema,
    model,
    fallbackModel,
    thinkingBudget,
    maxOutputTokens,
    apiKey,
    label,
    ctx,
    skipBudgetCheck,
    skipCache,
    cacheTtlMs,
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
  fallbackModel,
  thinkingBudget,
  maxOutputTokens = 8192,
  apiKey,
  label = "gemini_call",
  ctx,
  skipBudgetCheck,
  skipCache,
  cacheTtlMs,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: unknown;
  model?: string;
  fallbackModel?: string;
  thinkingBudget?: number;
  maxOutputTokens?: number;
  apiKey?: string | null;
  label?: string;
  ctx?: ActionCtx;
  skipBudgetCheck?: boolean;
  skipCache?: boolean;
  cacheTtlMs?: number;
}): Promise<{ text: string; usage: LlmUsageEntry }> {
  // ─── Guardrail 1: Cache lookup ────────────────────────────────────────────
  if (ctx && !skipCache) {
    const cached = await checkLlmCache(ctx, systemPrompt, userPrompt, model, temperature);
    if (cached) {
      return {
        text: cached,
        usage: createLlmUsageEntry({
          label: `${label}_cached`,
          model,
          fallbackInputTokens: 0,
          fallbackOutputTokens: 0,
        }),
      };
    }
  }

  // ─── Guardrail 2: Budget check ────────────────────────────────────────────
  if (ctx && !skipBudgetCheck) {
    await checkDailyBudget(ctx);
  }

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

  async function callModel(modelName: string, thinkBudget: number): Promise<{ text: string; usage: LlmUsageEntry }> {
    return withRetry(
      async () => {
        const response = await aiClient.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            temperature,
            maxOutputTokens,
            responseMimeType: responseAsJson ? "application/json" : "text/plain",
            responseSchema,
            httpOptions: { timeout: 25000 },
            ...(thinkBudget > 0
              ? {
                  thinkingConfig: {
                    thinkingBudget: thinkBudget,
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
            model: modelName,
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
  }

  let result: { text: string; usage: LlmUsageEntry };
  let usedModel = model;
  try {
    result = await callModel(model, resolvedBudget);
  } catch (primaryErr) {
    if (fallbackModel && fallbackModel !== model) {
      console.warn(
        `[LLM] Primary model ${model} failed after retries, falling back to ${fallbackModel}:`,
        primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      );
      const isFallbackPro = /\bpro\b/i.test(fallbackModel);
      const fallbackThinkBudget = isFallbackPro ? Math.max(512, resolvedBudget) : 0;
      result = await callModel(fallbackModel, fallbackThinkBudget);
      usedModel = fallbackModel;
    } else {
      throw primaryErr;
    }
  }

  const { text, usage } = result;

  logLlmTelemetry({
    model: usedModel,
    usage,
    latencyMs: Date.now() - startMs,
  });

  // ─── Guardrail 3: Record spend + store cache ──────────────────────────────
  if (ctx) {
    if (!skipBudgetCheck) {
      await recordLlmSpend(ctx, usage);
    }
    if (!skipCache) {
      await storeLlmCache(ctx, systemPrompt, userPrompt, model, temperature, text, cacheTtlMs);
    }
  }

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
  ctx,
  skipBudgetCheck,
  skipCache,
  cacheTtlMs,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
  apiKey?: string | null;
  ctx?: ActionCtx;
  skipBudgetCheck?: boolean;
  skipCache?: boolean;
  cacheTtlMs?: number;
}): Promise<{ text: string; sources: string[] }> {
  const result = await callGeminiWithGroundingAndUsage({
    systemPrompt,
    userPrompt,
    temperature,
    model,
    maxOutputTokens,
    apiKey,
    ctx,
    skipBudgetCheck,
    skipCache,
    cacheTtlMs,
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
  ctx,
  skipBudgetCheck,
  skipCache,
  cacheTtlMs,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  model?: string;
  maxOutputTokens?: number;
  apiKey?: string | null;
  label?: string;
  ctx?: ActionCtx;
  skipBudgetCheck?: boolean;
  skipCache?: boolean;
  cacheTtlMs?: number;
}): Promise<{ text: string; sources: string[]; usage: LlmUsageEntry }> {
  // ─── Guardrail 1: Cache lookup ────────────────────────────────────────────
  if (ctx && !skipCache) {
    const cached = await checkLlmCache(ctx, systemPrompt, userPrompt, model, temperature);
    if (cached) {
      return {
        text: cached,
        sources: [],
        usage: createLlmUsageEntry({
          label: `${label}_cached`,
          model,
          fallbackInputTokens: 0,
          fallbackOutputTokens: 0,
        }),
      };
    }
  }

  // ─── Guardrail 2: Budget check ────────────────────────────────────────────
  if (ctx && !skipBudgetCheck) {
    await checkDailyBudget(ctx);
  }

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

  // ─── Guardrail 3: Record spend + store cache ──────────────────────────────
  if (ctx) {
    if (!skipBudgetCheck) {
      await recordLlmSpend(ctx, result.usage);
    }
    if (!skipCache) {
      await storeLlmCache(ctx, systemPrompt, userPrompt, model, temperature, result.text, cacheTtlMs);
    }
  }

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
  if (latencyMs > 20000) {
    console.warn(
      `[LLM] WARNING: High latency ${latencyMs}ms for model=${model} — approaching action timeout. Consider reducing input size or using a faster model.`,
    );
  }
}

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
  if (!apiKey || getOptionalBoolean("DISABLE_EMBEDDINGS")) {
    if (!apiKey) {
      console.warn("[LLM:Embed] No API key — returning zero vector");
    } else {
      console.log("[LLM:Embed] DISABLE_EMBEDDINGS is set — returning zero vector");
    }
    return new Array(768).fill(0);
  }

  const MODEL = MODELS.embedding;
  const startMs = Date.now();
  try {
    const result = await withRetry(
      async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:embedContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
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
          // withRetry already treats 401/403 as non-transient, so this fails
          // fast for this call without poisoning the module state for others.
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
