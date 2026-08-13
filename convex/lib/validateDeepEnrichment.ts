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

function isLikelyValidLinkedIn(url: string): boolean {
  const lower = url.toLowerCase();
  if (!lower.includes("linkedin.com/in/")) return false;
  const slug = lower.split("/in/")[1]?.split("?")[0] || "";
  if (!slug) return false;
  return !/\b(pub\/dir|company|search)\b/.test(slug);
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
  const hasLinkedin = !!linkedin && isLikelyValidLinkedIn(linkedin);

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
  if (linkedin && isLikelyValidLinkedIn(linkedin)) out.linkedin_url = linkedin;
  if (sourceUrl) out.source_url = sourceUrl;

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
