const ROLE_EMAIL_ALIASES: Record<string, string[]> = {
  "Vice Chancellor": ["vc", "vicechancellor", "vice-chancellor", "rector"],
  "Pro Vice Chancellor": ["provc", "pro-vice-chancellor"],
  Registrar: ["registrar", "reg"],
  "Dean Student Welfare": ["dsw", "dean-student-welfare", "student-welfare"],
  "Dean Student Affairs": ["dsa", "dean-student-affairs", "student-affairs"],
  "Director Administration": [
    "director-admin",
    "admin-director",
    "administration",
  ],
  "Chief Warden": ["warden", "chief-warden", "hostel-warden"],
  "Controller of Examinations": ["coe", "controller-exams", "examination"],
  "Finance Officer": ["finance", "accounts", "fo"],
  Librarian: ["librarian", "library"],
  "Placement Officer": ["placement", "tpo", "training"],
  "Public Relations Officer": ["pro", "public-relations", "pr"],
  Director: ["director", "dir"],
  "Dean of Faculty": ["dean-faculty", "faculty-dean"],
  "Head of Administration": ["head-admin", "admin-head"],
};

const ROLE_CANONICAL_ALIASES: Record<string, string[]> = {
  "Vice Chancellor": ["vice chancellor", "vice-chancellor"],
  "Pro Vice Chancellor": [
    "pro vice chancellor",
    "pro-vice-chancellor",
    "pro vice-chancellor",
  ],
  Registrar: ["registrar"],
  "Dy Registrar": ["dy registrar", "deputy registrar"],
  "Dean Student Welfare": [
    "dean student welfare",
    "dean of student welfare",
    "student welfare dean",
  ],
  "Dean Student Affairs": [
    "dean student affairs",
    "dean of student affairs",
    "student affairs dean",
  ],
  "Director Administration": [
    "director administration",
    "director of administration",
    "director admin",
  ],
  "Chief Warden": ["chief warden", "chief hostel warden"],
  "Controller of Examinations": [
    "controller of examinations",
    "controller examinations",
    "controller examination",
    "coe",
  ],
  "Finance Officer": ["finance officer"],
  Librarian: ["librarian"],
  "Placement Officer": ["placement officer", "training and placement officer"],
  "Public Relations Officer": ["public relations officer"],
  "Head of Department": ["head of department", "hod"],
  Principal: ["principal"],
  Director: ["director"],
  Chancellor: ["chancellor"],
  "Dean of Faculty": ["dean of faculty", "faculty dean"],
  "Head of Administration": ["head of administration", "head admin"],
};

export function normalizeRoleText(role?: string | null): string {
  return (role || "")
    .toLowerCase()
    .replace(/[&/]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStakeholderRole(role?: string | null): string | undefined {
  const normalized = normalizeRoleText(role);
  if (!normalized) return undefined;

  for (const [canonical, aliases] of Object.entries(ROLE_CANONICAL_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }

  return (role || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bVice-Chancellor\b/i, "Vice Chancellor")
    .replace(/\bPro-Vice-Chancellor\b/i, "Pro Vice Chancellor");
}

export function normalizeInstitutionDomain(website?: string | null): string {
  return (website || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function isSingletonRole(role?: string | null): boolean {
  const canonicalRole = normalizeStakeholderRole(role);
  return !!canonicalRole && canonicalRole in ROLE_EMAIL_ALIASES;
}

export function inferPreferredRoleEmail(
  role: string,
  domain: string,
): string | null {
  const canonicalRole = normalizeStakeholderRole(role);
  const aliases = canonicalRole ? ROLE_EMAIL_ALIASES[canonicalRole] : undefined;
  if (!aliases || !domain) return null;
  return `${aliases[0]}@${domain}`;
}

export function inferRoleFromInstitutionEmail(
  email: string | undefined | null,
  institutionDomain: string | undefined | null,
): string | undefined {
  const normalizedEmail =
    canonicalizeInstitutionEmail(email, institutionDomain) ?? undefined;
  if (!normalizedEmail) return undefined;
  const { local, domain } = getEmailParts(normalizedEmail);
  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  if (
    normalizedDomain &&
    domain !== normalizedDomain &&
    !domain.endsWith(`.${normalizedDomain}`)
  ) {
    return undefined;
  }

  for (const [canonicalRole, aliases] of Object.entries(ROLE_EMAIL_ALIASES)) {
    if (
      aliases.some(
        (alias) =>
          local === alias ||
          local.startsWith(`${alias}.`) ||
          local.startsWith(`${alias}_`) ||
          local.startsWith(`${alias}-`),
      )
    ) {
      return canonicalRole;
    }
  }
  return undefined;
}

export function inferRoleFromContactContext(
  context: string | undefined | null,
): string | undefined {
  const normalized = normalizeRoleText(context);
  if (!normalized) return undefined;

  for (const [canonical, aliases] of Object.entries(ROLE_CANONICAL_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return canonical;
    }
  }

  if (normalized.includes("vice chancellor")) return "Vice Chancellor";
  if (normalized.includes("pro vice chancellor")) return "Pro Vice Chancellor";
  if (normalized.includes("student welfare")) return "Dean Student Welfare";
  if (normalized.includes("student affairs")) return "Dean Student Affairs";
  if (normalized.includes("public relations")) {
    return "Public Relations Officer";
  }

  return undefined;
}

function getRoleEmailAliases(role?: string | null): string[] {
  const canonicalRole = normalizeStakeholderRole(role);
  return canonicalRole ? ROLE_EMAIL_ALIASES[canonicalRole] ?? [] : [];
}

function getEmailParts(email?: string | null): { local: string; domain: string } {
  const normalized = (email || "").toLowerCase().trim();
  const [local = "", domain = ""] = normalized.split("@");
  return { local, domain };
}

export function isRoleBasedInstitutionEmail(
  email: string | undefined | null,
  role: string | undefined | null,
  institutionDomain: string | undefined | null,
): boolean {
  if (!email || !role) return false;
  const { local, domain } = getEmailParts(email);
  if (!local || !domain) return false;
  const normalizedDomain = normalizeInstitutionDomain(institutionDomain);
  if (
    normalizedDomain &&
    domain !== normalizedDomain &&
    !domain.endsWith(`.${normalizedDomain}`)
  ) {
    return false;
  }
  return getRoleEmailAliases(role).includes(local);
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

export function getRoleEmailRank(
  role: string | undefined | null,
  email: string | undefined | null,
  institutionDomain: string | undefined | null,
): number {
  if (!role || !email) return Number.POSITIVE_INFINITY;
  if (!isRoleBasedInstitutionEmail(email, role, institutionDomain)) {
    return Number.POSITIVE_INFINITY;
  }
  const { local } = getEmailParts(email);
  const aliases = getRoleEmailAliases(role);
  const aliasRank = aliases.indexOf(local);
  return aliasRank >= 0 ? aliasRank : Number.POSITIVE_INFINITY;
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

  const currentRank = getRoleEmailRank(role, normalizedCurrent, institutionDomain);
  const candidateRank = getRoleEmailRank(role, normalizedCandidate, institutionDomain);

  if (candidateRank < currentRank) return normalizedCandidate;
  if (currentRank < candidateRank) return normalizedCurrent;

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
