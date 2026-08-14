"use node";

import { ActionCtx } from "../_generated/server";
import { Schema } from "@google/genai";
import { callGeminiWithUsage, LlmUsageEntry, MODELS, TEMP } from "./llm";
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

const MAX_PARTIAL_SOURCES = 6;

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
  25,
  "University officials from this single source. If the source contains an Officers/Administration/Governance table or list, return EVERY named row. Return at most 25 decision-makers, prioritising Vice Chancellor, Registrar, Deans, Controllers, Directors, Finance Officer, and other senior officials.",
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

function digitsOnly(value?: string | null): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits : undefined;
}

/**
 * Remove phone/LinkedIn that are not literally present in the source block.
 * Keeps the model honest: contact details must be evidence-backed.
 */
function sanitiseEvidence(
  stakeholders: StakeholderLike[],
  block: string,
): StakeholderLike[] {
  const lowerBlock = block.toLowerCase();
  return stakeholders.map((st) => {
    const out: StakeholderLike = { ...st };

    if (out.linkedin_url) {
      const url = out.linkedin_url.toLowerCase();
      if (!lowerBlock.includes(url)) {
        out.linkedin_url = undefined;
        out.linkedin_source = "none";
        if (typeof out.contact_confidence === "number" && out.contact_confidence > 0.5) {
          out.contact_confidence = 0.5;
        }
      } else {
        out.linkedin_source = "scraped";
      }
    } else {
      out.linkedin_source = "none";
    }

    if (out.phone) {
      const phoneDigits = digitsOnly(out.phone);
      if (!phoneDigits || !lowerBlock.includes(phoneDigits)) {
        out.phone = undefined;
        out.phone_source = "none";
      } else {
        out.phone_source = "scraped";
      }
    } else {
      out.phone_source = "none";
    }

    return out;
  });
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
    "If this source is an Officers/Administration/Governance table or directory, " +
    "return EVERY named person in the table, one row per person, with their exact role and email. " +
    "Do not stop at the first few rows. " +
    "For Deans, keep the specific school/faculty in the role, e.g. \"Dean, School of Pharmaceutical Education and Research\". " +
    "Return at most 25 stakeholders per source, prioritising decision-making roles " +
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
      model: MODELS.gemini_3_7_flash,
      fallbackModel: MODELS.gemini_3_5_flash_lite,
      systemPrompt: perSourceSystemPrompt(options.targetRoles),
      userPrompt: prompt,
      temperature: TEMP.deterministic,
      responseAsJson: true,
      responseSchema: PER_SOURCE_SCHEMA,
      maxOutputTokens: 4096,
      label: "per_source_extraction",
      ctx,
      cacheTtlMs: 60 * 60 * 1000,
    });
    llmUsageEntries.push(result.usage);

    const parsed = JSON.parse(cleanJson(result.text));
    let stakeholders = validateStakeholdersOutput(parsed);
    stakeholders = sanitiseEvidence(stakeholders, block);
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

const LEADERSHIP_URL_RE =
  /(?<![a-zA-Z])(officer|officers|administration|registrar|vice[-_ ]?chancellor|chancellor|dean|deans|director|controller|warden|leadership|contact|telephone[-_ ]?directory)(?![a-zA-Z])/i;
const LEADERSHIP_BODY_RE =
  /\b(vice[- ]?chancellor|registrar|chancellor|dean|director|controller of examinations|finance officer|warden|pro[- ]?vice[- ]?chancellor)\b/gi;

/**
 * Rank scraped source blocks so the officers/administration table is always
 * among the blocks sent to per-source extraction (we only extract
 * MAX_PARTIAL_SOURCES blocks — previously the first 6 in array order, which
 * could skip the highest-value page if it arrived late).
 */
export function rankBlocksForExtraction(blocks: string[]): string[] {
  const scored = blocks.map((block) => {
    const headerMatch = block.match(
      /=== (?:SOURCE|EXTERNAL SOURCE|FOLLOWUP SOURCE): ([^=\n]+) ===/,
    );
    const url = headerMatch?.[1]?.toLowerCase() ?? "";
    const body = block.slice(0, 4000);

    let score = 0;
    if (LEADERSHIP_URL_RE.test(url)) score += 8;
    if (/\b(anti[-_]?ragging|iqac|mandatory[-_ ]?disclosure)\b/i.test(url))
      score += 3;
    const roleHits = (body.match(LEADERSHIP_BODY_RE) || []).length;
    score += Math.min(roleHits, 6) * 1.5;
    if (/\b(email|phone|telephone|mobile)\b/i.test(body)) score += 2;
    score += Math.min(body.length / 500, 6);

    return { block, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.block);
}

export async function extractPartialsFromSources(
  blocks: string[],
  options: PerSourceOptions,
  apiKey: string | null,
  ctx: ActionCtx,
  llmUsageEntries: LlmUsageEntry[],
): Promise<PartialExtraction[]> {
  if (blocks.length === 0) return [];

  const selected = rankBlocksForExtraction(blocks).slice(
    0,
    MAX_PARTIAL_SOURCES,
  );
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
    model: MODELS.gemini_3_7_flash,
    fallbackModel: MODELS.gemini_3_5_flash_lite,
    systemPrompt: mergeSystemPrompt(options.targetRoles),
    userPrompt: prompt,
    temperature: TEMP.deterministic,
    responseAsJson: true,
    responseSchema: MERGE_SCHEMA,
    maxOutputTokens: 8192,
    label: "merge_partial_extractions",
    ctx,
    cacheTtlMs: 60 * 60 * 1000,
  });
  llmUsageEntries.push(result.usage);

  const parsed = JSON.parse(cleanJson(result.text));
  return { stakeholders: validateStakeholdersOutput(parsed) };
}
