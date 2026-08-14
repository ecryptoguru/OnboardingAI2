"use node";

export interface WebsiteCandidate {
  link: string;
  score: number;
}

export interface RankWebsiteCandidatesOptions {
  locationHints?: string[];
}

const BLOCKED_DOMAINS = [
  "wikipedia.org",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "shiksha.com",
  "collegedunia.com",
  "careers360.com",
  "justdial.com",
  "sulekha.com",
  "getmyuni.com",
  "universitykart.com",
  "admissionfever.com",
  "asklaila.com",
  "inhawk.com",
];

function tokenizeText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

function tokenizeUniversityName(universityName: string): string[] {
  return tokenizeText(universityName);
}

function isCommonWord(word: string): boolean {
  return ["the", "and", "for", "but", "with"].includes(word);
}

function getSignificantWords(universityName: string): string[] {
  return tokenizeUniversityName(universityName).filter(
    (word) =>
      word.length >= 4 &&
      ![
        "university",
        "college",
        "institute",
        "technology",
        "management",
        "school",
      ].includes(word),
  );
}

function getUniversityAcronyms(universityName: string): string[] {
  const rawTokens = tokenizeUniversityName(universityName);
  const tokens = rawTokens.filter((word) => !["of", "and"].includes(word));
  const acronym = tokens.map((word) => word[0]).join("");
  const acronyms: string[] = acronym.length >= 2 ? [acronym] : [];

  // Capture dotted initialisms like "S.R.M" / "I.I.T" as well as short
  // leading tokens like "SRM" / "VIT" that are effectively brand acronyms.
  const dotted = universityName.match(/^([A-Z](?:\.[A-Z]){1,4})/);
  if (dotted) {
    const initialism = dotted[1].replace(/\./g, "").toLowerCase();
    if (initialism.length >= 3 && !isCommonWord(initialism)) {
      acronyms.push(initialism);
    }
  }

  const first = rawTokens[0];
  if (
    first &&
    first.length >= 3 &&
    first.length <= 5 &&
    /^[a-z]+$/.test(first) &&
    !isCommonWord(first)
  ) {
    acronyms.push(first);
  }

  return [...new Set(acronyms)];
}

function matchesAcronymDomainRoot(acronym: string, domainRoot: string): boolean {
  if (!acronym || !domainRoot) return false;
  if (domainRoot === acronym) return true;
  if (acronym.length >= 3) {
    return domainRoot.includes(acronym);
  }
  // Two-letter acronyms like "bu" are too fuzzy to match arbitrary roots such
  // as "bub". Only accept exact short acronyms or common institutional suffixes.
  return new RegExp(`^${acronym}(?:uni|univ|university|edu|college|campus)?$`).test(
    domainRoot,
  );
}

function getLocationTokens(locationHints: string[]): string[] {
  const seen = new Set<string>();
  return locationHints
    .flatMap((hint) => tokenizeText(hint))
    .filter((token) => token.length >= 4)
    .filter((token) => {
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
}

export function hasEducationTld(hostname: string): boolean {
  return (
    hostname.endsWith(".edu") ||
    hostname.endsWith(".edu.in") ||
    hostname.endsWith(".ac") ||
    hostname.endsWith(".ac.in") ||
    hostname.endsWith(".gov.in")
  );
}

function isHostedPortal(hostname: string): boolean {
  return [
    "inhawk.com",
    "sites.google.com",
    "wordpress.com",
    "wixsite.com",
    "webs.com",
  ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * Returns true if a stored website looks like a hosted portal or aggregator
 * that should be discarded and re-discovered.
 */
export function isSuspiciousWebsite(website?: string | null): boolean {
  if (!website) return false;
  try {
    const hostname = new URL(website).hostname.replace(/^www\./, "");
    return (
      isHostedPortal(hostname) ||
      BLOCKED_DOMAINS.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))
    );
  } catch {
    return false;
  }
}

function getCandidateScore(
  link: string,
  universityName: string,
  locationHints: string[],
): number {
  let score = 0;

  if (looksLikeOwnedDomain(link, universityName)) {
    score += 2;
  }

  try {
    const url = new URL(link);
    const hostname = url.hostname.replace(/^www\./, "");
    const searchable = `${hostname}${url.pathname}`.toLowerCase();
    const owned = looksLikeOwnedDomain(link, universityName);
    if (hasEducationTld(hostname)) {
      score += 1;
    }
    if (hostname.endsWith(".gov.in")) {
      score += 2;
    }
    if (!owned && !hasEducationTld(hostname)) {
      score -= 2;
    }
    if (isHostedPortal(hostname)) {
      score -= 6;
    }
    if (
      getLocationTokens(locationHints).some((token) =>
        searchable.includes(token),
      )
    ) {
      score += 1;
    }
  } catch {
    // Leave malformed links with only their ownership score.
  }

  return score;
}

function compareCandidates(a: WebsiteCandidate, b: WebsiteCandidate): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const safeParse = (link: string) => {
    try {
      return new URL(link);
    } catch {
      return null;
    }
  };

  const aUrl = safeParse(a.link);
  const bUrl = safeParse(b.link);
  const aHostnameParts =
    aUrl?.hostname.replace(/^www\./, "").split(".").length ?? 99;
  const bHostnameParts =
    bUrl?.hostname.replace(/^www\./, "").split(".").length ?? 99;
  if (aHostnameParts !== bHostnameParts) {
    return aHostnameParts - bHostnameParts;
  }

  const aPathSegments = aUrl?.pathname.split("/").filter(Boolean).length ?? 99;
  const bPathSegments = bUrl?.pathname.split("/").filter(Boolean).length ?? 99;
  if (aPathSegments !== bPathSegments) {
    return aPathSegments - bPathSegments;
  }

  return a.link.localeCompare(b.link);
}

export function looksLikeOwnedDomain(
  link: string,
  universityName: string,
): boolean {
  const significantWords = getSignificantWords(universityName);
  const acronyms = getUniversityAcronyms(universityName);
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "");
    const parts = hostname.split(".").filter((p) => p.length >= 2);
    return parts.some(
      (part) =>
        significantWords.some((word) => part.includes(word)) ||
        acronyms.some((acronym) => matchesAcronymDomainRoot(acronym, part)),
    );
  } catch {
    return false;
  }
}

export function rankWebsiteCandidates(
  links: string[],
  universityName: string,
  options: RankWebsiteCandidatesOptions = {},
): WebsiteCandidate[] {
  const seen = new Set<string>();
  const locationHints = options.locationHints ?? [];

  return links
    .filter(
      (link) =>
        !!link &&
        !BLOCKED_DOMAINS.some((blockedDomain) =>
          link.toLowerCase().includes(blockedDomain),
        ),
    )
    .filter((link) => {
      if (seen.has(link)) return false;
      seen.add(link);
      return true;
    })
    .map((link) => ({
      link,
      score: getCandidateScore(link, universityName, locationHints),
    }))
    .sort(compareCandidates);
}

export async function findFirstValidWebsiteCandidate(
  candidates: WebsiteCandidate[],
  validate: (candidate: WebsiteCandidate) => Promise<boolean>,
): Promise<WebsiteCandidate | null> {
  for (const candidate of candidates) {
    try {
      if (await validate(candidate)) {
        return candidate;
      }
    } catch {
      // Skip broken candidates and continue through the fallback list.
    }
  }

  return null;
}
