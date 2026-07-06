export const MODELS = {
  complex: "gemini-3.5-flash" as const,
  gemini: "gemini-3.5-flash" as const,
  geminiFlash: "gemini-3.1-flash-lite" as const,
  embedding: "gemini-embedding-001" as const,
} as const;

export const TEMP = {
  deterministic: 0.0,
  balanced: 0.3,
  creative: 0.6,
} as const;

export const THINKING = {
  off: 0,
  low: 512,
  medium: 2048,
  high: 8192,
} as const;
