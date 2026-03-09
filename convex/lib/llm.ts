"use node";

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { withRetry } from "./utils";

// ─── OpenRouter Unified Client ───────────────────────────────────────────────
let _openrouter: OpenAI | null = null;
export function getOpenRouter(): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultHeaders: {
        "HTTP-Referer": "https://fretbox.in",
        "X-Title": "Fretbox Outreach AI",
      },
    });
  }
  return _openrouter;
}

// ─── Direct Google SDK ───────────────────────────────────────────────
let _ai: GoogleGenAI | null = null;
export function getGoogleAI(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY env var is not set");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

// ─── Model constants ──────────────────────────────────────────────────────────
export const MODELS = {
  // Complex reasoning: proposals, reply classification
  claude: "anthropic/claude-sonnet-4.6" as const,
  // Gemini Pro: enrichment, scoring, personalization
  gemini: "gemini-3.1-pro-preview" as const,
  // Gemini Flash: future fast tasks
  geminiFlash: "gemini-3-flash-preview" as const,
  // Embeddings: 768-dim (direct via Google AI API)
  embedding: "text-embedding-005" as const,
} as const;

// ─── Temperature presets ─────────────────────────────────────────────────────
export const TEMP = {
  deterministic: 0.0, // classification, scoring
  balanced: 0.3,      // personalization
  creative: 0.7,      // proposal writing
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Call Claude Sonnet via OpenRouter with explicit cache breakpoints.
 * Passes cache_control type: ephemeral inside the system prompt block
 * which OpenRouter natively translates to Anthropic's Prompt Caching.
 */
export async function callClaude({
  system,
  userMessage,
  temperature = TEMP.balanced,
  maxTokens = 2048,
}: {
  system: string;
  userMessage: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  return await withRetry(async () => {
    const response = await getOpenRouter().chat.completions.create({
      model: MODELS.claude,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: system,
              // @ts-expect-error - OpenRouter/Anthropic specific extension not in standard OpenAI types
              cache_control: { type: "ephemeral" },
            },
          ],
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) throw new Error("Unexpected empty response from Claude via OpenRouter");
    return text;
  });
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
  thinkingBudget,   // Auto-applied if not set: Pro → 1024 minimum, non-Pro → off
  maxOutputTokens = 8192,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: any;
  model?: string;
  thinkingBudget?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  return await withRetry(async () => {
    // Gemini Pro models REQUIRE thinkingBudget >= 512 (thinking is always on).
    // Non-Pro models (Flash etc.) work with thinkingBudget = 0 (off).
    const isProModel = model.includes("pro");
    const resolvedBudget = thinkingBudget !== undefined
      ? (isProModel ? Math.max(512, thinkingBudget) : thinkingBudget)
      : (isProModel ? 1024 : 0);

    const response = await getGoogleAI().models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature,
        maxOutputTokens,
        responseMimeType: responseAsJson ? "application/json" : "text/plain",
        responseSchema,
        ...(resolvedBudget > 0 ? {
          thinkingConfig: {
            thinkingBudget: resolvedBudget,
            includeThoughts: false,
          }
        } : {}),
      },
    });

    const text = response.text;
    if (!text) throw new Error("Unexpected empty response from Gemini via Google SDK");
    return text;
  });
}

/**
 * Budget constants for Gemini thinking mode.
 * Higher budget = longer latency, deeper reasoning, higher cost.
 */
export const THINKING = {
  off: 0,        // Flash: pure extraction, structured scoring
  low: 512,      // Pro: minimal synthesis, light conflict resolution
  medium: 2048,  // Pro: multi-source synthesis, complex extraction
  high: 8192,    // Pro: complex evaluation, deep step-by-step logic
} as const;

/**
 * Convenience wrapper for gemini-3-flash-preview. 
 * Flash is 2.5x faster and 4x cheaper than Pro, achieving near-Pro performance on extraction/scoring.
 * Thinking is forced to 0 by default to maximize speed for extraction tasks.
 */
export async function callFlash(
  args: Omit<Parameters<typeof callGemini>[0], "model" | "thinkingBudget"> & {
    thinkingBudget?: number;
  }
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
export async function embed(text: string): Promise<number[]> {
  const result = await getGoogleAI().models.embedContent({
    model: MODELS.embedding,
    contents: text,
  });
  
  if (!result.embeddings || result.embeddings.length === 0 || !result.embeddings[0].values) {
    throw new Error("Failed to generate embedding");
  }
  
  return result.embeddings[0].values;
}
