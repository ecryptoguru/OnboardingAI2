/**
 * Normalized fuzzy name matcher for university deduplication.
 * Handles common abbreviations, substring overlap, and normalized whitespace.
 */
export function namesMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();

  if (na === nb) return true;

  const stopWords = new Set([
    "university",
    "college",
    "of",
    "the",
    "and",
    "national",
    "indian",
    "technical",
    "state",
    "private",
    "public",
    "international",
    "global",
    "institutions",
    "institution",
  ]);

  const academicFields = new Set([
    "technology",
    "science",
    "sciences",
    "applied",
    "engineering",
    "management",
    "studies",
    "research",
    "arts",
    "humanities",
    "education",
    "law",
    "medicine",
    "health",
    "business",
    "design",
    "planning",
  ]);

  const campusKeywords = new Set([
    "campus",
    "regional",
    "center",
    "centre",
    "branch",
    "extension",
    "sub",
    "offcampus",
    "constituent",
  ]);

  // Substring check with strict campus/branch/location filtering
  if (na.includes(nb) || nb.includes(na)) {
    const [longer, shorter] = na.length >= nb.length ? [na, nb] : [nb, na];
    const extra = longer.replace(shorter, "").trim();
    const extraTokens = extra.split(/[\s,\-\(\)]+/).filter((t) => t.length > 0);
    // If any extra token is a campus keyword, or if it is not a stopword and not an academic field,
    // then it's a location/branch differentiator, so they do NOT match.
    const hasBranchDiff = extraTokens.some(
      (t) =>
        campusKeywords.has(t) ||
        (!stopWords.has(t) && !academicFields.has(t))
    );
    if (hasBranchDiff) {
      return false;
    }
  }

  const getTokens = (s: string) =>
    s.split(/[\s,]+/).filter((t) => t.length > 2 && !stopWords.has(t));

  const tokensA = getTokens(na);
  const tokensB = getTokens(nb);

  // Acronym check: e.g., "VIT" ↔ "Vellore Institute of Technology"
  const getAcronym = (s: string) =>
    s
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(
        (w) =>
          w.length > 0 &&
          !["university", "college", "of", "the", "and"].includes(w),
      )
      .map((w) => w[0])
      .join("");

  const acrA = getAcronym(na);
  const acrB = getAcronym(nb);

  for (const token of tokensA) {
    if (token === acrB) return true;
  }
  for (const token of tokensB) {
    if (token === acrA) return true;
  }

  // Campus keyword check for token/acronym matches (preventing sub-campuses from matching parent abbreviations)
  const uniqueA = tokensA.filter((t) => !tokensB.includes(t));
  const uniqueB = tokensB.filter((t) => !tokensA.includes(t));
  
  const hasBranchMismatch = (uniqueTokens: string[]) =>
    uniqueTokens.some((t) => campusKeywords.has(t));

  if (hasBranchMismatch(uniqueA) || hasBranchMismatch(uniqueB)) {
    return false;
  }

  // Shared distinctive tokens
  const shared = tokensA.filter((t) => tokensB.includes(t));
  if (shared.length >= 2) return true;

  // Single shared token must be long enough or make up the majority of the shorter name
  for (const token of shared) {
    if (token.length >= 5) return true;
    const shortLen = Math.min(tokensA.join("").length, tokensB.join("").length);
    if (shortLen > 0 && token.length / shortLen > 0.5) return true;
  }

  return false;
}
