export const MODELS = {
  complex: "gemini-3.5-flash" as const,
  gemini: "gemini-3.5-flash" as const,
  geminiFlash: "gemini-3.5-flash-lite" as const,
  gemini_3_6_flash: "gemini-3.6-flash" as const,
  gemini_3_5_flash_lite: "gemini-3.5-flash-lite" as const,
  embedding: "gemini-embedding-001" as const,
} as const;

export const TEMP = {
  deterministic: 0.0,
  balanced: 0.3,
  creative: 0.6,
} as const;

/** Numeric thinking budgets (tokens) for legacy 2.x / 2.5 models. */
export const THINKING = {
  off: 0,
  low: 512,
  medium: 2048,
  high: 8192,
} as const;

/** Thinking level enum for Gemini 3.x models (replaces thinkingBudget). */
export const THINKING_LEVEL = {
  minimal: "MINIMAL",
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
} as const;
