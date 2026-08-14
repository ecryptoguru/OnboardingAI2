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
  phone_source?: string | null;
  linkedin_url?: string | null;
  linkedin_source?: string | null;
  contact_confidence?: number | null;
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

export function isLikelyValidLinkedIn(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.includes("linkedin.com/in/")) return false;
  const slug = lower.split("/in/")[1]?.split("?")[0] || "";
  if (!slug) return false;
  return !/\b(pub\/dir|company|search)\b/.test(slug);
}

/**
 * Verify that a LinkedIn /in/ URL slug clearly matches a person\'s name.
 * Requires the surname or at least two distinct name tokens to appear as
 * whole "words" in the slug (delimited by - or _ or non-letters). This
 * prevents matching unrelated profiles like "iamalinakhan" to "Asgar Ali".
 */
export function linkedinMatchesName(
  name: string | undefined,
  linkedinUrl: string | undefined,
): boolean {
  if (!name || !linkedinUrl) return false;
  const url = linkedinUrl.toLowerCase();
  if (!isLikelyValidLinkedIn(url)) return false;
  const slugMatch = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const slug = slugMatch ? slugMatch[1] : "";
  if (!slug) return false;

  const slugParts = slug
    .replace(/\./g, "-")
    .split(/[-_\W]+/)
    .filter((w) => w.length >= 2);
  const slugSet = new Set(slugParts);

  const parts = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !["dr", "prof", "mr", "mrs", "ms", "shri", "smt", "er"].includes(w),
    );
  if (parts.length === 0) return false;

  const surname = parts[parts.length - 1];

  if (parts.length === 1) {
    return slugSet.has(surname);
  }

  // For multi-word names, require the surname plus at least one other name
  // token to appear as whole slug parts. This stops "Sohrab Khan" from matching
  // a "sana-khan" profile just because the surname is shared.
  return (
    slugSet.has(surname) &&
    parts.slice(0, parts.length - 1).some((p) => slugSet.has(p))
  );
}

function isValidStakeholder(st: unknown): st is Record<string, unknown> {
  if (!st || typeof st !== "object" || Array.isArray(st)) return false;
  const obj = st as Record<string, unknown>;

  const name = cleanString(obj.name);
  const role = cleanString(obj.role);
  const email = cleanString(obj.email);
  const phone = cleanString(obj.phone);
  const linkedin = cleanString(obj.linkedin_url);
  const linkedinSource = cleanString(obj.linkedin_source);

  // Must have at least one meaningful contact field or a real name + role
  const hasName = !!name && name.length > 1;
  const hasRole = !!role && role.length > 1;
  const hasEmail = !!email;
  const hasPhone = !!phone;
  const hasLinkedin =
    !!linkedin &&
    linkedinSource === "scraped" &&
    !!name &&
    isLikelyValidLinkedIn(linkedin) &&
    linkedinMatchesName(name, linkedin);

  return (
    (hasName && (hasRole || hasEmail || hasPhone || hasLinkedin)) ||
    (hasRole && (hasEmail || hasPhone || hasLinkedin))
  );
}

function cleanNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function cleanSource(value: unknown): string | undefined {
  const s = cleanString(value);
  if (!s) return undefined;
  if (["scraped", "inferred", "manual", "none", "regex"].includes(s))
    return s;
  return "inferred";
}

function cleanStakeholder(st: Record<string, unknown>): StakeholderLike {
  const out: StakeholderLike = {};
  const name = cleanString(st.name);
  const role = cleanString(st.role);
  const email = cleanString(st.email);
  const phone = cleanString(st.phone);
  const phoneSource = cleanSource(st.phone_source);
  const linkedin = cleanString(st.linkedin_url);
  const linkedinSource = cleanSource(st.linkedin_source);
  const sourceUrl = cleanString(st.source_url);
  const rawConfidence = cleanNumber(st.contact_confidence);

  if (name) out.name = name;
  if (role) out.role = role;
  if (email) out.email = email;
  if (phone) {
    out.phone = phone;
    // A model-emitted "none" alongside an actual phone is treated as absent;
    // the phone is present so it is evidence-backed by default.
    out.phone_source =
      phoneSource && phoneSource !== "none" ? phoneSource : "scraped";
  } else {
    out.phone_source = "none";
  }
  if (
    linkedin &&
    (linkedinSource === "scraped" ||
      linkedinSource === undefined ||
      linkedinSource === "none") &&
    isLikelyValidLinkedIn(linkedin) &&
    linkedinMatchesName(name, linkedin)
  ) {
    out.linkedin_url = linkedin;
    out.linkedin_source =
      linkedinSource && linkedinSource !== "none"
        ? linkedinSource
        : "scraped";
  } else {
    out.linkedin_source = linkedinSource || "none";
  }
  if (sourceUrl) out.source_url = sourceUrl;

  let confidence = rawConfidence;
  if (confidence === undefined) {
    if ((out.email || out.phone || out.linkedin_url) && out.name && out.role)
      confidence = 1.0;
    else if (out.name && out.role) confidence = 0.5;
    else confidence = 0.0;
  }
  out.contact_confidence = Math.max(0, Math.min(1, confidence));

  return out;
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

export function validateStakeholdersOutput(parsed: unknown): StakeholderLike[] {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Stakeholder output is not a valid object");
  }
  const obj = parsed as Record<string, unknown>;

  const stakeholders: StakeholderLike[] = [];
  if (Array.isArray(obj.stakeholders)) {
    for (const st of obj.stakeholders) {
      if (isValidStakeholder(st)) {
        stakeholders.push(cleanStakeholder(st as Record<string, unknown>));
      }
    }
  }

  return stakeholders;
}
