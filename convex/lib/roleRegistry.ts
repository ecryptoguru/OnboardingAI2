"use node";

/**
 * Single source of truth for stakeholder roles.
 * Used by deep enrichment, contact inference, and stakeholder quality filters.
 */

export interface RoleDefinition {
  canonical: string;
  aliases: string[]; // text variants used in role inference
  emailAliases: string[]; // local-part patterns used for role-based emails
  decisionMaker: boolean;
  singleton: boolean; // a single person typically holds this role
  target: boolean; // include in the LLM target roles prompt
  rank?: number; // lower = more senior / preferred
}

const rawRoles: Omit<RoleDefinition, "target">[] = [
  {
    canonical: "Owner",
    aliases: ["owner"],
    emailAliases: ["owner"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "President",
    aliases: ["president"],
    emailAliases: ["president"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Chairman",
    aliases: ["chairman"],
    emailAliases: ["chairman"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Chairperson",
    aliases: ["chairperson"],
    emailAliases: ["chairperson"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Chancellor",
    aliases: ["chancellor"],
    emailAliases: ["chancellor"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Vice Chancellor",
    aliases: ["vice chancellor", "vice-chancellor", "vc"],
    emailAliases: ["vc", "vicechancellor", "vice-chancellor", "rector"],
    decisionMaker: true,
    singleton: true,
    rank: 1,
  },
  {
    canonical: "Pro Vice Chancellor",
    aliases: ["pro vice chancellor", "pro-vice-chancellor", "pro vice-chancellor"],
    emailAliases: ["provc", "pro-vice-chancellor"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Advisor",
    aliases: ["advisor"],
    emailAliases: ["advisor"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Advisor to Chancellor",
    aliases: ["advisor to chancellor"],
    emailAliases: ["advisor"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Registrar",
    aliases: ["registrar", "reg"],
    emailAliases: ["registrar", "reg"],
    decisionMaker: true,
    singleton: true,
    rank: 2,
  },
  {
    canonical: "Dy Registrar",
    aliases: ["dy registrar", "deputy registrar"],
    emailAliases: ["dyregistrar", "dy-registrar"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Joint Registrar",
    aliases: ["joint registrar"],
    emailAliases: ["jointregistrar"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Dean",
    aliases: ["dean", "deans"],
    emailAliases: ["dean"],
    decisionMaker: true,
    singleton: false,
    rank: 3,
  },
  {
    canonical: "Deputy Dean",
    aliases: ["deputy dean"],
    emailAliases: ["deputydean"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Assistant Dean",
    aliases: ["assistant dean", "associate dean", "executive dean"],
    emailAliases: ["assistantdean", "associatedean", "executivedean"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Dean Student Welfare",
    aliases: ["dean student welfare", "dean of student welfare", "student welfare dean"],
    emailAliases: ["dsw", "dean-student-welfare", "student-welfare"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Dean Student Affairs",
    aliases: ["dean student affairs", "dean of student affairs", "student affairs dean"],
    emailAliases: ["dsa", "dean-student-affairs", "student-affairs"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Director Administration",
    aliases: ["director administration", "director of administration", "director admin"],
    emailAliases: ["director-admin", "admin-director", "administration"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Chief Warden",
    aliases: ["chief warden", "chief hostel warden", "warden"],
    emailAliases: ["warden", "chief-warden", "hostel-warden"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Controller of Examinations",
    aliases: ["controller of examinations", "controller examinations", "controller examination", "coe"],
    emailAliases: ["coe", "controller-exams", "examination"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Deputy Controller of Examinations",
    aliases: ["deputy controller of examinations"],
    emailAliases: ["deputy-coe"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Finance Officer",
    aliases: ["finance officer"],
    emailAliases: ["finance", "accounts", "fo"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Chief Finance Officer",
    aliases: ["chief finance officer", "cfo"],
    emailAliases: ["cfo", "finance"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Librarian",
    aliases: ["librarian"],
    emailAliases: ["librarian", "library"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Head of Department",
    aliases: ["head of department", "hod"],
    emailAliases: ["hod"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Placement Officer",
    aliases: ["placement officer", "training and placement officer"],
    emailAliases: ["placement", "tpo", "training"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Public Relations Officer",
    aliases: ["public relations officer"],
    emailAliases: ["pro", "public-relations", "pr"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Director",
    aliases: ["director", "directors"],
    emailAliases: ["director", "dir"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Joint Director",
    aliases: ["joint director", "additional director"],
    emailAliases: ["jointdirector"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Deputy Director",
    aliases: ["deputy director"],
    emailAliases: ["deputydirector"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Associate Director",
    aliases: ["associate director"],
    emailAliases: ["associatedirector"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Executive Director",
    aliases: ["executive director"],
    emailAliases: ["executivedirector"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Managing Director",
    aliases: ["managing director"],
    emailAliases: ["md", "managingdirector"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Rector",
    aliases: ["rector"],
    emailAliases: ["rector"],
    decisionMaker: true,
    singleton: true,
  },
  {
    canonical: "Secretary",
    aliases: ["secretary"],
    emailAliases: ["secretary"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Treasurer",
    aliases: ["treasurer"],
    emailAliases: ["treasurer"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Dean of Faculty",
    aliases: ["dean of faculty", "faculty dean"],
    emailAliases: ["dean-faculty", "faculty-dean"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Head of Administration",
    aliases: ["head of administration", "head admin"],
    emailAliases: ["head-admin", "admin-head"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Administrative Officer",
    aliases: ["administrative officer", "admin officer"],
    emailAliases: ["admin-officer"],
    decisionMaker: true,
    singleton: false,
  },
  {
    canonical: "Principal",
    aliases: ["principal"],
    emailAliases: ["principal"],
    decisionMaker: true,
    singleton: true,
  },
];

export const ROLE_REGISTRY: RoleDefinition[] = rawRoles.map((r) => ({
  ...r,
  target: true,
}));

const ROLES_BY_CANONICAL = new Map<string, RoleDefinition>();
const ALIAS_TO_CANONICAL = new Map<string, string>();
const EMAIL_TO_CANONICAL = new Map<string, string>();

for (const role of ROLE_REGISTRY) {
  ROLES_BY_CANONICAL.set(role.canonical.toLowerCase(), role);
  for (const alias of role.aliases) {
    ALIAS_TO_CANONICAL.set(
      normalizeRoleText(alias),
      role.canonical,
    );
  }
  for (const emailAlias of role.emailAliases) {
    EMAIL_TO_CANONICAL.set(emailAlias.toLowerCase(), role.canonical);
  }
}

// Longer aliases first so "vice chancellor" beats "chancellor" and
// "dean student welfare" beats "dean".
const SORTED_ALIASES = [...ALIAS_TO_CANONICAL.entries()].sort(
  (a, b) => b[0].length - a[0].length,
);

export function normalizeRoleText(role?: string | null): string {
  return (role || "")
    .toLowerCase()
    .replace(/[&/]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getRoleByCanonical(
  role?: string | null,
): RoleDefinition | undefined {
  if (!role) return undefined;
  return ROLES_BY_CANONICAL.get(role.toLowerCase().trim());
}

export function normalizeStakeholderRole(role?: string | null): string | undefined {
  const normalized = normalizeRoleText(role);
  if (!normalized) return undefined;
  const canonical = ALIAS_TO_CANONICAL.get(normalized);
  if (canonical) return canonical;

  // Fallback: preserve a small set of clean-ups from the original text
  const fallback = (role || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bVice-Chancellor\b/i, "Vice Chancellor")
    .replace(/\bPro-Vice-Chancellor\b/i, "Pro Vice Chancellor");
  if (fallback) return fallback;
  return undefined;
}

export function isSingletonRole(role?: string | null): boolean {
  const canonical = normalizeStakeholderRole(role);
  if (!canonical) return false;
  return getRoleByCanonical(canonical)?.singleton ?? false;
}

export function isDecisionMakerRole(role?: string | null): boolean {
  if (!role) return false;
  const canonical = normalizeStakeholderRole(role);
  const canonicalDef = canonical ? getRoleByCanonical(canonical) : undefined;
  if (canonicalDef) return canonicalDef.decisionMaker;

  // Fallback: the role is not a known exact form, but contains a decision-maker keyword
  const normalized = normalizeRoleText(role);
  if (!normalized) return false;
  for (const [alias, canonicalName] of SORTED_ALIASES) {
    if (normalized.includes(alias)) {
      const def = getRoleByCanonical(canonicalName);
      if (def?.decisionMaker) return true;
    }
  }
  return false;
}

export function isAcademicNonDecisionRole(role?: string | null): boolean {
  if (!role) return false;
  const normalized = normalizeRoleText(role);
  if (!normalized) return false;
  const ACADEMIC_NON_DECISION_RE =
    /\b(assistant professor|associate professor|professor|lecturer|faculty|research scientist|scientist)\b/i;
  if (!ACADEMIC_NON_DECISION_RE.test(normalized)) return false;
  return !isDecisionMakerRole(role);
}

export function inferRoleFromContactContext(
  context: string | undefined | null,
): string | undefined {
  const normalized = normalizeRoleText(context);
  if (!normalized) return undefined;
  for (const [alias, canonical] of SORTED_ALIASES) {
    if (normalized.includes(alias)) {
      return canonical;
    }
  }
  return undefined;
}

export function getRoleEmailAliases(role?: string | null): string[] {
  const canonical = normalizeStakeholderRole(role);
  if (!canonical) return [];
  return getRoleByCanonical(canonical)?.emailAliases ?? [];
}

export function getRoleEmailRank(
  role: string | undefined | null,
  email: string | undefined | null,
): number {
  if (!role || !email) return Number.POSITIVE_INFINITY;
  const local = email.toLowerCase().trim().split("@")[0] || "";
  const aliases = getRoleEmailAliases(role);
  return aliases.indexOf(local);
}

export function inferPreferredRoleEmail(
  role: string,
  domain: string,
): string | null {
  const aliases = getRoleEmailAliases(role);
  if (!aliases.length || !domain) return null;
  return `${aliases[0]}@${domain}`;
}

export function inferRoleFromInstitutionEmail(
  email: string | undefined | null,
  institutionDomain: string | undefined | null,
): string | undefined {
  const normalizedEmail = (email || "").toLowerCase().trim();
  if (!normalizedEmail.includes("@")) return undefined;
  const [local, domain] = normalizedEmail.split("@");
  if (!local || !domain) return undefined;
  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  if (
    normalizedDomain &&
    domain !== normalizedDomain &&
    !domain.endsWith(`.${normalizedDomain}`)
  ) {
    return undefined;
  }

  for (const [emailAlias, canonical] of EMAIL_TO_CANONICAL) {
    if (
      local === emailAlias ||
      local.startsWith(`${emailAlias}.`) ||
      local.startsWith(`${emailAlias}_`) ||
      local.startsWith(`${emailAlias}-`)
    ) {
      return canonical;
    }
  }
  return undefined;
}

export function normalizeInstitutionDomain(website?: string | null): string {
  return (website || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function isRoleBasedInstitutionEmail(
  email: string | undefined | null,
  role: string | undefined | null,
  institutionDomain: string | undefined | null,
): boolean {
  if (!email || !role) return false;
  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  const domain = email.toLowerCase().split("@")[1] || "";
  if (
    normalizedDomain &&
    domain !== normalizedDomain &&
    !domain.endsWith(`.${normalizedDomain}`)
  ) {
    return false;
  }
  const local = email.toLowerCase().split("@")[0] || "";
  const aliases = getRoleEmailAliases(role);
  return aliases.some(
    (alias) =>
      local === alias ||
      local.startsWith(`${alias}.`) ||
      local.startsWith(`${alias}_`) ||
      local.startsWith(`${alias}-`),
  );
}

export function choosePreferredRoleEmail(
  role: string | undefined | null,
  currentEmail: string | undefined | null,
  candidateEmail: string | undefined | null,
  institutionDomain: string | undefined | null,
): string | undefined {
  const normalizedCurrent =
    canonicalizeInstitutionEmail(currentEmail, institutionDomain) ?? undefined;
  const normalizedCandidate =
    canonicalizeInstitutionEmail(candidateEmail, institutionDomain) ?? undefined;

  if (!normalizedCurrent) return normalizedCandidate ?? undefined;
  if (!normalizedCandidate) return normalizedCurrent;

  const currentRank = getRoleEmailRank(role, normalizedCurrent);
  const candidateRank = getRoleEmailRank(role, normalizedCandidate);

  if (candidateRank >= 0 && currentRank < 0) return normalizedCandidate;
  if (currentRank >= 0 && candidateRank < 0) return normalizedCurrent;
  if (candidateRank >= 0 && currentRank >= 0 && candidateRank < currentRank)
    return normalizedCandidate;
  if (currentRank >= 0 && candidateRank >= 0 && currentRank < candidateRank)
    return normalizedCurrent;

  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  const currentDomain = normalizedCurrent.split("@")[1] || "";
  const candidateDomain = normalizedCandidate.split("@")[1] || "";
  if (normalizedDomain) {
    const currentIsExact = currentDomain === normalizedDomain;
    const candidateIsExact = candidateDomain === normalizedDomain;
    if (candidateIsExact && !currentIsExact) return normalizedCandidate;
    if (currentIsExact && !candidateIsExact) return normalizedCurrent;
  }

  return normalizedCurrent;
}

export function canonicalizeInstitutionEmail(
  email: string | undefined | null,
  institutionDomain: string | undefined | null,
): string | undefined {
  const normalizedEmail = (email || "").toLowerCase().trim();
  if (!normalizedEmail.includes("@")) return undefined;
  const [local, domain] = normalizedEmail.split("@");
  if (!local || !domain) return undefined;
  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  if (normalizedDomain) {
    const cleanedDomain = domain.replace(/^(www\.|mail\.|smtp\.)/, "");
    if (cleanedDomain === normalizedDomain) {
      return `${local}@${normalizedDomain}`;
    }
  }
  return normalizedEmail;
}

export function getEmailParts(email?: string | null): { local: string; domain: string } {
  const normalized = (email || "").toLowerCase().trim();
  const [local = "", domain = ""] = normalized.split("@");
  return { local, domain };
}

export const TARGET_ROLES = ROLE_REGISTRY
  .filter((r) => r.target)
  .map((r) => r.canonical);
