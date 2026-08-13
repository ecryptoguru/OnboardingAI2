"use node";

import { ActionCtx } from "../_generated/server";
import { Schema } from "@google/genai";
import { callGeminiWithUsage, LlmUsageEntry, MODELS, THINKING_LEVEL } from "./llm";
import {
  STAKEHOLDERS_SCHEMA,
  STAKEHOLDERS_SYNTHESIS_PROMPT,
  STAKEHOLDERS_MERGE_PROMPT,
} from "./prompts";
import {
  validateStakeholdersOutput,
  StakeholderLike,
  extractSourceUrl,
} from "./validateDeepEnrichment";

const MAX_PARTIAL_SOURCES = 5;

function withMaxStakeholders(
  schema: Schema,
  maxItems: number,
  description: string,
): Schema {
  const typed = schema as Schema & { properties: Record<string, Schema> };
  const stakeholders = typed.properties.stakeholders ?? {};
  return {
    ...typed,
    properties: {
      ...typed.properties,
      stakeholders: {
        ...stakeholders,
        maxItems: String(maxItems),
        description,
      },
    },
  };
}

const PER_SOURCE_SCHEMA = withMaxStakeholders(
  STAKEHOLDERS_SCHEMA,
  12,
  "University officials from this single source. Return at most 12 of the most relevant decision-makers and those with complete contact information.",
) as Schema;

const MERGE_SCHEMA = withMaxStakeholders(
  STAKEHOLDERS_SCHEMA,
  25,
  "Merged, deduplicated university officials. Return at most 25 decision-makers prioritising those with complete contact information.",
) as Schema;

interface PartialExtraction {
  source_url: string;
  stakeholders: StakeholderLike[];
  raw: string;
}

export interface PerSourceOptions {
  uniName: string;
  website?: string;
  targetRoles: string[];
  preDiscoveredEmails?: string[];
  preDiscoveredPhones?: string[];
}

function cleanJson(text: string): string {
  return text
    .replace(/^```(json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function contactHints(emails: string[], phones: string[]): string {
  return (
    `PRE-DISCOVERED CONTACTS (verify and merge with this source):\n` +
    `Emails: ${emails.slice(0, 50).join(", ") || "none"}\n` +
    `Phones: ${phones.slice(0, 50).join(", ") || "none"}`
  );
}

function perSourceSystemPrompt(targetRoles: string[]): string {
  return (
    STAKEHOLDERS_SYNTHESIS_PROMPT(targetRoles) +
    "\n\nIMPORTANT: You are examining exactly ONE source. " +
    "Extract only facts explicitly stated in this source. " +
    "Do not infer values from other sources or general knowledge. " +
    "If a value is not present, return null. " +
    "Return at most 10 stakeholders per source, prioritising decision-making roles " +
    "(Vice Chancellor, Registrar, Deans, Directors, Controllers, Wardens, Finance Officer, etc.) " +
    "and those with complete contact information."
  );
}

function mergeSystemPrompt(targetRoles: string[]): string {
  return STAKEHOLDERS_MERGE_PROMPT(targetRoles);
}

async function extractOnePartial(
  block: string,
  options: PerSourceOptions,
  apiKey: string | null,
  ctx: ActionCtx,
  llmUsageEntries: LlmUsageEntry[],
): Promise<PartialExtraction | null> {
  const sourceUrl = extractSourceUrl(block) || "unknown";
  if (!apiKey) return null;
  const header = `UNIVERSITY: ${options.uniName}\nWebsite: ${options.website || "unknown"}\nSOURCE: ${sourceUrl}`;
  const contacts = contactHints(
    options.preDiscoveredEmails || [],
    options.preDiscoveredPhones || [],
  );
  const prompt = `${header}\n\n${contacts}\n\nSOURCE CONTENT:\n${block.trim()}\n\nExtract only stakeholders (university officials and decision-makers) from this single source. Do not extract demographics.`;

  try {
    const result = await callGeminiWithUsage({
      apiKey,
      model: MODELS.gemini_3_5_flash_lite,
      fallbackModel: MODELS.geminiFlash,
      systemPrompt: perSourceSystemPrompt(options.targetRoles),
      userPrompt: prompt,
      thinkingLevel: THINKING_LEVEL.minimal,
      responseAsJson: true,
      responseSchema: PER_SOURCE_SCHEMA,
      maxOutputTokens: 2048,
      label: "per_source_extraction",
      ctx,
      cacheTtlMs: 60 * 60 * 1000,
    });
    llmUsageEntries.push(result.usage);

    const parsed = JSON.parse(cleanJson(result.text));
    const stakeholders = validateStakeholdersOutput(parsed);
    return {
      source_url: sourceUrl,
      stakeholders: stakeholders.map((st) => ({
        ...st,
        source_url: st.source_url || sourceUrl,
      })),
      raw: block,
    };
  } catch (e) {
    console.warn(
      `[PerSource] Extraction failed for ${sourceUrl}:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

export async function extractPartialsFromSources(
  blocks: string[],
  options: PerSourceOptions,
  apiKey: string | null,
  ctx: ActionCtx,
  llmUsageEntries: LlmUsageEntry[],
): Promise<PartialExtraction[]> {
  if (blocks.length === 0) return [];

  const selected = blocks.slice(0, MAX_PARTIAL_SOURCES);
  const tasks = selected.map(
    (block) => () => extractOnePartial(block, options, apiKey, ctx, llmUsageEntries),
  );

  // Import inline to avoid circular dependencies at top level
  const { withConcurrencyLimit } = await import("./utils");
  const results = await withConcurrencyLimit(tasks, 3);
  return results.filter((p): p is PartialExtraction => p !== null);
}

export async function mergePartialExtractions(
  partials: PartialExtraction[],
  options: PerSourceOptions,
  apiKey: string | null,
  ctx: ActionCtx,
  llmUsageEntries: LlmUsageEntry[],
): Promise<{
  stakeholders: StakeholderLike[];
}> {
  if (partials.length === 0) {
    return { stakeholders: [] };
  }

  if (!apiKey) {
    return { stakeholders: [] };
  }

  const parts = partials
    .map((p) => {
      return (
        `=== PARTIAL EXTRACTION FROM ${p.source_url} ===\n` +
        JSON.stringify({ stakeholders: p.stakeholders })
      );
    })
    .join("\n\n");

  const contacts = contactHints(
    options.preDiscoveredEmails || [],
    options.preDiscoveredPhones || [],
  );

  const prompt = `UNIVERSITY: ${options.uniName}\nWebsite: ${options.website || "unknown"}\n\n` +
    `${contacts}\n\n` +
    `Merge the following partial extractions into a single, deduplicated result.\n\n${parts}`;

  const result = await callGeminiWithUsage({
    apiKey,
    model: MODELS.gemini_3_6_flash,
    fallbackModel: MODELS.gemini,
    systemPrompt: mergeSystemPrompt(options.targetRoles),
    userPrompt: prompt,
    thinkingLevel: THINKING_LEVEL.low,
    responseAsJson: true,
    responseSchema: MERGE_SCHEMA,
    maxOutputTokens: 4096,
    label: "merge_partial_extractions",
    ctx,
    cacheTtlMs: 60 * 60 * 1000,
  });
  llmUsageEntries.push(result.usage);

  const parsed = JSON.parse(cleanJson(result.text));
  return { stakeholders: validateStakeholdersOutput(parsed) };
}
