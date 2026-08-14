"use node";

import type { ActionCtx } from "../_generated/server";
import type { Schema } from "@google/genai";
import { callGeminiWithUsage, LlmUsageEntry, MODELS, TEMP } from "./llm";
import { STAKEHOLDERS_SCHEMA } from "./prompts";
import {
  StakeholderLike,
  validateStakeholdersOutput,
} from "./validateDeepEnrichment";
import { normalizeStakeholderRole, isSingletonRole } from "./contactInference";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "./serperBudget";
import { internal } from "../_generated/api";

const REQUIRED_SINGLETON_ROLES = [
  "Vice Chancellor",
  "Pro Vice Chancellor",
  "Registrar",
  "Chancellor",
  "Finance Officer",
  "Controller of Examinations",
];

const ROLE_URL_SLUGS: Record<string, string[]> = {
  "Vice Chancellor": ["vice-chancellor", "vc", "vice_chancellor"],
  "Pro Vice Chancellor": ["pro-vice-chancellor", "pvc", "pro_vice_chancellor"],
  Registrar: ["registrar"],
  Chancellor: ["chancellor"],
  "Finance Officer": ["finance-officer", "finance_officer", "fo"],
  "Controller of Examinations": [
    "controller-of-examinations",
    "coe",
    "controller",
  ],
};

const ROLE_KEYWORD_RE: Record<string, RegExp> = {
  "Vice Chancellor": /\b(vice[-\s]?chancellor|vice chancellor)\b/i,
  "Pro Vice Chancellor": /\b(pro[-\s]?vice[-\s]?chancellor|pro vice chancellor)\b/i,
  Registrar: /\bregistrar\b/i,
  Chancellor: /\bchancellor\b/i,
  "Finance Officer": /\b(finance[-\s]?officer|finance officer|fao)\b/i,
  "Controller of Examinations": /\b(controller of examinations|controller[-\s]?of[-\s]?examinations|coe)\b/i,
};

async function fetchJina(url: string, timeoutMs = 20000): Promise<string> {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Jina ${res.status} for ${url}`);
  return await res.text();
}

function withMaxItems(schema: Schema, maxItems: number): Schema {
  const typed = schema as Schema & { properties: Record<string, Schema> };
  const stakeholders = typed.properties.stakeholders ?? {};
  return {
    ...typed,
    properties: {
      ...typed.properties,
      stakeholders: { ...stakeholders, maxItems: String(maxItems) },
    },
  };
}

function focusedSystemPrompt(role: string): string {
  return (
    `You are extracting university officials from a single source. ` +
    `Find the CURRENT holder of the role "${role}" in this source. ` +
    `Extract their full name with title, their exact role text (preserve ` +
    `"Offg." / "Acting" / "(I/c)" labels), and any email/phone/LinkedIn that is ` +
    `literally present next to their name. Do not invent names or contacts. ` +
    `If the source does not name the holder, return an empty stakeholders array.`
  );
}

const NON_LEADERSHIP_URL_RE =
  /\/(departments?|faculty|staff|people|profile|profiles|teams?|alumni|students?)\//i;

/**
 * Verifies the extracted name actually belongs to the role: the role keyword
 * and the person's surname must appear within ±1 line of each other in the
 * source block. Prevents "Vice Chancellor" appearing in a nav/menu/committee
 * list from capturing an unrelated name on the page.
 */
export function verifyNameRoleProximity(
  role: string,
  name: string | undefined | null,
  block: string,
): boolean {
  if (!name) return false;
  const roleRe = ROLE_KEYWORD_RE[role] ?? new RegExp(`\\b${role}\\b`, "i");
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  const surname = tokens[tokens.length - 1];

  const lines = block.split("\n");
  let roleLine = -1;
  let nameLine = -1;
  lines.forEach((line, i) => {
    if (roleRe.test(line) && roleLine < 0) roleLine = i;
    if (line.toLowerCase().includes(surname) && nameLine < 0) nameLine = i;
  });
  if (roleLine < 0 || nameLine < 0) return false;
  return Math.abs(roleLine - nameLine) <= 1;
}

function isNonLeadershipSource(block: string): boolean {
  const url = block.match(/=== (?:SOURCE|EXTERNAL SOURCE|FOLLOWUP SOURCE): ([^=\n]+) ===/)?.[1] ?? "";
  return NON_LEADERSHIP_URL_RE.test(url.toLowerCase());
}

function sanitiseForBlock(stakeholders: StakeholderLike[], block: string): StakeholderLike[] {
  const lowerBlock = block.toLowerCase();
  return stakeholders.map((st) => {
    const out: StakeholderLike = { ...st };
    if (out.phone) {
      const digits = out.phone.replace(/\D/g, "");
      if (!digits || !lowerBlock.includes(digits)) {
        out.phone = undefined;
        out.phone_source = "none";
      } else {
        out.phone_source = "scraped";
      }
    }
    if (out.linkedin_url) {
      if (!lowerBlock.includes(out.linkedin_url.toLowerCase())) {
        out.linkedin_url = undefined;
        out.linkedin_source = "none";
      } else {
        out.linkedin_source = "scraped";
      }
    }
    return out;
  });
}

async function extractRoleFromBlock(
  role: string,
  block: string,
  options: GapFillOptions,
): Promise<StakeholderLike | null> {
  if (!options.apiKey) return null;
  try {
    const result = await callGeminiWithUsage({
      apiKey: options.apiKey,
      model: MODELS.gemini_3_7_flash,
      fallbackModel: MODELS.gemini_3_5_flash_lite,
      systemPrompt: focusedSystemPrompt(role),
      userPrompt: `UNIVERSITY: ${options.uniName}\nWebsite: ${options.website || "unknown"}\n\nSOURCE CONTENT:\n${block.slice(0, 6000)}\n\nExtract the ${role} if named.`,
      temperature: TEMP.deterministic,
      responseAsJson: true,
      responseSchema: withMaxItems(STAKEHOLDERS_SCHEMA, 2),
      maxOutputTokens: 1024,
      label: "gap_fill_extraction",
      ctx: options.ctx,
      skipCache: false,
    });
    const parsed = JSON.parse(result.text) as { stakeholders?: unknown[] };
    const stakeholders = sanitiseForBlock(
      validateStakeholdersOutput(parsed),
      block,
    );
    options.llmUsageEntries.push(result.usage);
    const candidate = stakeholders.find((st) => st.name) ?? null;
    if (candidate && !verifyNameRoleProximity(role, candidate.name, block)) {
      console.warn(
        `[GapFill] Rejecting ${role} candidate "${candidate.name}": name not adjacent to role keyword in source`,
      );
      return null;
    }
    return candidate;
  } catch (e) {
    console.warn(
      `[GapFill] Extraction failed for ${role}:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/** Step (a): scan already-fetched blocks for role mentions and extract. */
async function scanExistingBlocks(
  role: string,
  blocks: string[],
  options: GapFillOptions,
): Promise<StakeholderLike | null> {
  const roleRe = ROLE_KEYWORD_RE[role] ?? new RegExp(role, "i");
  const candidates = blocks
    .filter((block) => !isNonLeadershipSource(block))
    .map((block) => {
      const lines = block.split("\n");
      const hitLines: string[] = [];
      lines.forEach((line, i) => {
        if (roleRe.test(line)) {
          hitLines.push(lines.slice(Math.max(0, i - 1), i + 3).join(" "));
        }
      });
      return hitLines.length > 0
        ? `${block.match(/=== (?:SOURCE|EXTERNAL SOURCE|FOLLOWUP SOURCE): ([^=\n]+) ===/)?.[1] ?? "unknown"}\n${hitLines.join("\n")}`
        : null;
    })
    .filter((b): b is string => !!b && b.length > 60);

  for (const candidate of candidates.slice(0, 3)) {
    const found = await extractRoleFromBlock(role, candidate, options);
    if (found?.name) return found;
  }
  return null;
}

/** Step (b): fetch standard leadership leaf URL guesses via Jina (free). */
async function tryLeafGuesses(
  role: string,
  baseUrl: string,
  options: GapFillOptions,
): Promise<StakeholderLike | null> {
  const slugs = ROLE_URL_SLUGS[role] ?? [role.toLowerCase().replace(/\s+/g, "-")];
  const base = baseUrl.replace(/\/+$/, "");
  const guesses = slugs.flatMap((slug) => [
    `${base}/${slug}`,
    `${base}/${slug}.php`,
    `${base}/${slug}.html`,
  ]);
  const seen = new Set<string>();
  for (const url of guesses) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const text = await fetchJina(url, 15000);
      const normalized = text
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 6000);
      if (normalized.length < 200) continue;
      const found = await extractRoleFromBlock(
        role,
        `=== SOURCE: ${url} ===\n${normalized}`,
        options,
      );
      if (found?.name) return { ...found, source_url: found.source_url ?? url };
    } catch {
      // 404/blocked guesses are expected — keep trying
    }
  }
  return null;
}

/** Step (c): one Serper query for the missing role, Jina-fetch top hits. */
async function trySerper(
  role: string,
  options: GapFillOptions,
): Promise<StakeholderLike | null> {
  if (!options.serperKey) return null;
  const budget = createSerperBudget({ maxQueries: 1 });
  if (budget.exhausted) return null;
  const query = `"${options.uniName}" "${role}"`;
  const searchResult = await runWithSerperBudget(budget, async () => {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": options.serperKey!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Serper ${res.status}`);
    return (await res.json()) as {
      organic?: Array<{ link?: string; title?: string; snippet?: string }>;
    };
  });
  if (!searchResult.ok) {
    if (searchResult.quotaExhausted) {
      try {
        await options.ctx.runMutation(internal.apiAlerts.recordInternal, {
          api: "serper",
          severity: "critical",
          message: "Serper quota exhausted during gap-fill",
          context: options.uniName,
        });
      } catch {
        // alert recording must never break the pipeline
      }
    }
    return null;
  }

  const domain = options.domain.toLowerCase().replace(/^www\./, "");
  const links = (searchResult.value?.organic || [])
    .map((r) => r.link)
    .filter((link): link is string => {
      if (!link) return false;
      try {
        const host = new URL(link).hostname.replace(/^www\./i, "").toLowerCase();
        return host === domain || host.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    })
    .slice(0, 2);

  for (const url of links) {
    try {
      const text = await fetchJina(url, 15000);
      const normalized = text
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .slice(0, 6000);
      if (normalized.length < 200) continue;
      const found = await extractRoleFromBlock(
        role,
        `=== SOURCE: ${url} ===\n${normalized}`,
        options,
      );
      if (found?.name) return { ...found, source_url: found.source_url ?? url };
    } catch {
      // skip blocked hits
    }
  }
  return null;
}

export interface GapFillOptions {
  uniName: string;
  website?: string;
  domain: string;
  apiKey: string | null;
  ctx: ActionCtx;
  llmUsageEntries: LlmUsageEntry[];
  serperKey: string | null;
}

/**
 * Find the current holders of singleton leadership roles that are still
 * missing after deep-enrichment merge. Spends credits in order of preference:
 * 1) re-scan already-fetched blocks (free), 2) Jina leaf-page guesses (free),
 * 3) one Serper query per role (capped at 3 roles).
 */
export async function gapFillMissingRoles(
  existing: StakeholderLike[],
  blocks: string[],
  options: GapFillOptions,
): Promise<StakeholderLike[]> {
  const present = new Set(
    existing
      .map((st) => normalizeStakeholderRole(st.role))
      .filter((r): r is string => !!r && isSingletonRole(r)),
  );
  const missing = REQUIRED_SINGLETON_ROLES.filter((role) => {
    const canonical = normalizeStakeholderRole(role);
    return canonical ? !present.has(canonical) : false;
  }).slice(0, 3);

  if (missing.length === 0) return [];

  const found: StakeholderLike[] = [];
  const baseUrl = options.website ?? `https://${options.domain}`;

  for (const role of missing) {
    console.log(`[GapFill] ${options.uniName}: role "${role}" missing — filling...`);
    const result =
      (await scanExistingBlocks(role, blocks, options)) ??
      (await tryLeafGuesses(role, baseUrl, options)) ??
      (await trySerper(role, options));

    if (!result) {
      console.warn(`[GapFill] ${options.uniName}: could not find ${role}`);
      continue;
    }
    result.role = result.role ?? role;
    if (!result.contact_confidence) result.contact_confidence = 0.5;
    found.push(result);
    console.log(
      `[GapFill] ${options.uniName}: found ${role} → ${result.name} (${result.source_url ?? "no url"})`,
    );
  }
  return found;
}
