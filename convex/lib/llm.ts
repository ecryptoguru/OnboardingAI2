"use node";

import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { withRetry } from "./utils";

// ─── OpenRouter Unified Client ───────────────────────────────────────────────
export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultHeaders: {
    "HTTP-Referer": "https://fretbox.in", // Site URL
    "X-Title": "Fretbox Outreach AI", // Site Name
  },
});

// ─── Direct Google SDK ───────────────────────────────────────────────
export const ai = new GoogleGenAI({ 
  apiKey: process.env.GOOGLE_API_KEY || ""
});

// ─── Model constants ──────────────────────────────────────────────────────────
export const MODELS = {
  // Complex reasoning: proposals, reply classification
  claude: "anthropic/claude-sonnet-4.6" as const,
  // Fast + vision: scoring, email personalization, extraction
  gemini: "gemini-3-flash-preview" as const, // Official model name for the new SDK
  // Embeddings: 768-dim (direct via Google AI API)
  embedding: "gemini-embedding-001" as const,
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
    const response = await openrouter.chat.completions.create({
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
 * Call Gemini Flash via native @google/genai SDK natively.
 */
export async function callGemini({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  responseAsJson = false,
  responseSchema,
  tools,
  thinkingConfig,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: any;
  tools?: any[];
  thinkingConfig?: any;
}): Promise<string> {
  return await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: MODELS.gemini,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature,
        responseMimeType: responseAsJson ? "application/json" : "text/plain",
        responseSchema,
        thinkingConfig: thinkingConfig,
        tools: tools,
      } as any,
    });

    const text = result.text;
    if (!text) throw new Error("Unexpected empty response from Gemini via Google SDK");
    return text;
  });
}

/**
 * Generate a 768-dimensional embedding using Google's text-embedding-004.
 * Note: Requires GOOGLE_API_KEY environment variable.
 */
export async function embed(text: string): Promise<number[]> {
  return await withRetry(async () => {
    const result = await ai.models.embedContent({
      model: MODELS.embedding,
      contents: text,
    });
    
    if (!result.embeddings || result.embeddings.length === 0 || !result.embeddings[0].values) {
      throw new Error("Failed to generate embedding");
    }
    
    return result.embeddings[0].values;
  });
}

/**
 * Call Gemini Flash via native @google/genai SDK natively and returns full result
 * including the groundingMetadata.
 */
export async function callGeminiWithGrounding({
  systemPrompt,
  userPrompt,
  temperature = TEMP.balanced,
  responseAsJson = false,
  responseSchema,
  tools,
  thinkingConfig,
}: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseAsJson?: boolean;
  responseSchema?: any;
  tools?: any[];
  thinkingConfig?: any;
}): Promise<{ text: string; groundingMetadata: any }> {
  return await withRetry(async () => {
    const result = await ai.models.generateContent({
      model: MODELS.gemini,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        temperature,
        responseMimeType: responseAsJson ? "application/json" : "text/plain",
        responseSchema,
        thinkingConfig: thinkingConfig,
        tools: tools,
      } as any,
    });

    const text = result.text;
    if (!text) throw new Error("Unexpected empty response from Gemini via Google SDK");
    
    // The google genai SDK places groundingMetadata inside candidates[0].groundingMetadata
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata || null;
    return { text, groundingMetadata };
  });
}
