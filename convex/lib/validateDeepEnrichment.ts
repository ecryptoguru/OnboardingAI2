"use node";

/**
 * Runtime validation and sanitisation of the LLM extraction output.
 * Catches malformed entries that the structured-output JSON parser may miss
 * (e.g. a stakeholder with a number for a name, or nirf_programs with
 * missing totals).
 */

export interface StakeholderLike {
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  source_url?: string | null;
}

function cleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    /^[\-_\s|.]*$/.test(trimmed) ||
    trimmed.toLowerCase() === "n/a" ||
    trimmed.toLowerCase() === "unknown"
  ) {
    return undefined;
  }
  return trimmed;
}

function cleanNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return undefined;
    if (value < 0) return undefined;
    return Number.isInteger(value) ? value : Math.round(value);
  }
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return undefined;
    return Math.round(n);
  }
  return undefined;
}

function isValidStakeholder(st: unknown): st is Record<string, unknown> {
  if (!st || typeof st !== "object" || Array.isArray(st)) return false;
  const obj = st as Record<string, unknown>;

  const name = cleanString(obj.name);
  const role = cleanString(obj.role);
  const email = cleanString(obj.email);
  const phone = cleanString(obj.phone);
  const linkedin = cleanString(obj.linkedin_url);

  // Must have at least one meaningful contact field or a real name + role
  const hasName = !!name && name.length > 1;
  const hasRole = !!role && role.length > 1;
  const hasEmail = !!email;
  const hasPhone = !!phone;
  const hasLinkedin = !!linkedin;

  return (
    (hasName && (hasRole || hasEmail || hasPhone || hasLinkedin)) ||
    (hasRole && (hasEmail || hasPhone || hasLinkedin))
  );
}

function cleanStakeholder(st: Record<string, unknown>): StakeholderLike {
  const out: StakeholderLike = {};
  const name = cleanString(st.name);
  const role = cleanString(st.role);
  const email = cleanString(st.email);
  const phone = cleanString(st.phone);
  const linkedin = cleanString(st.linkedin_url);
  const sourceUrl = cleanString(st.source_url);

  if (name) out.name = name;
  if (role) out.role = role;
  if (email) out.email = email;
  if (phone) out.phone = phone;
  if (linkedin) out.linkedin_url = linkedin;
  if (sourceUrl) out.source_url = sourceUrl;

  return out;
}

function cleanNirfPrograms(programs: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(programs)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const p of programs) {
    if (!p || typeof p !== "object") continue;
    const obj = p as Record<string, unknown>;
    const name = cleanString(obj.name);
    if (!name) continue;
    const male = cleanNumber(obj.male);
    const female = cleanNumber(obj.female);
    const total = cleanNumber(obj.total) ??
      (male != null && female != null ? male + female : undefined);
    out.push({
      name,
      male,
      female,
      total,
    });
  }
  return out;
}

function cleanDemographics(demo: unknown): Record<string, unknown> | undefined {
  if (!demo || typeof demo !== "object" || Array.isArray(demo)) return undefined;
  const obj = demo as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  const copyNumber = (key: string) => {
    const val = cleanNumber(obj[key]);
    if (val !== undefined) out[key] = val;
  };

  copyNumber("total_students");
  copyNumber("total_students_male");
  copyNumber("total_students_female");
  copyNumber("day_scholars");
  copyNumber("day_scholars_male");
  copyNumber("day_scholars_female");
  copyNumber("hostelites");
  copyNumber("hostelites_male");
  copyNumber("hostelites_female");
  copyNumber("nirf_total");
  copyNumber("nirf_male");
  copyNumber("nirf_female");

  const nirfPrograms = cleanNirfPrograms(obj.nirf_programs);
  if (nirfPrograms.length > 0) out.nirf_programs = nirfPrograms;

  const source = cleanString(obj.source);
  const nirfSource = cleanString(obj.nirf_source);
  const dataQuality = cleanString(obj.data_quality);
  const sourceUrls = Array.isArray(obj.source_urls)
    ? obj.source_urls
        .map((u) => cleanString(u))
        .filter((u): u is string => !!u)
    : undefined;

  if (source) out.source = source;
  if (nirfSource) out.nirf_source = nirfSource;
  if (dataQuality) out.data_quality = dataQuality;
  if (sourceUrls && sourceUrls.length > 0) out.source_urls = sourceUrls;

  return Object.keys(out).length > 0 ? out : undefined;
}

const SOURCE_HEADER_RE = /^\n*===\s*(?:SOURCE|EXTERNAL SOURCE|FOLLOWUP SOURCE|GOVERNMENT SOURCE|GOVERNMENT PDF SOURCE):\s*(.+?)\s*===/m;

export function extractSourceUrl(block: string): string | undefined {
  const m = SOURCE_HEADER_RE.exec(block);
  return m ? m[1].trim() : undefined;
}

export function augmentStakeholderSources(
  stakeholders: StakeholderLike[],
  blocks: string[],
): StakeholderLike[] {
  return stakeholders.map((st) => {
    if (st.source_url) return st;
    const searchName = (st.name || "").toLowerCase().trim();
    const searchRole = (st.role || "").toLowerCase().trim();
    if (!searchName && !searchRole) return st;

    for (const block of blocks) {
      const url = extractSourceUrl(block);
      if (!url) continue;
      const lowerBlock = block.toLowerCase();

      const nameTokens = searchName
        .replace(/[.,]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 0);
      if (
        searchName &&
        nameTokens.some((token) => new RegExp(`\\b${token.replace(/[^a-z0-9]/g, "")}\\b`, "i").test(lowerBlock))
      ) {
        return { ...st, source_url: url };
      }
      if (searchRole && lowerBlock.includes(searchRole)) {
        return { ...st, source_url: url };
      }
    }
    return st;
  });
}

export function computeDemographicSourceUrls(
  blocks: string[],
  extraUrls: string[] = [],
): string[] {
  const urls = new Set<string>(extraUrls);
  for (const block of blocks) {
    const url = extractSourceUrl(block);
    if (!url) continue;
    const lower = block.toLowerCase();
    if (
      /\b(nirf|aishe|naac|ssr|iqac|aqar|mandatory disclosure|anti[-\s]?ragging|hostel|enrollment|student strength|statutory)\b/i.test(
        lower,
      )
    ) {
      urls.add(url);
    }
  }
  return [...urls];
}

export function validateDeepEnrichmentOutput(parsed: unknown): {
  demographics: Record<string, unknown>;
  stakeholders: StakeholderLike[];
} {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DeepEnrichment output is not a valid object");
  }
  const obj = parsed as Record<string, unknown>;

  const demographics = cleanDemographics(obj.demographics) ?? {};

  const stakeholders: StakeholderLike[] = [];
  if (Array.isArray(obj.stakeholders)) {
    for (const st of obj.stakeholders) {
      if (isValidStakeholder(st)) {
        stakeholders.push(cleanStakeholder(st as Record<string, unknown>));
      }
    }
  }

  return { demographics, stakeholders };
}
