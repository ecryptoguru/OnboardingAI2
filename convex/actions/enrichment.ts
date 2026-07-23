"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createHash } from "crypto";
import { Doc, Id } from "../_generated/dataModel";
import {
  embed,
  LlmUsageEntry,
  LlmUsageSummary,
  summarizeLlmUsage,
} from "../lib/llm";
import {
  withRetry,
  cosineSimilarity,
  withConcurrencyLimit,
} from "../lib/utils";
import {
  isSingletonRole,
  normalizeStakeholderRole,
  normalizeInstitutionDomain,
} from "../lib/contactInference";
import { isDecisionMakerRole } from "../lib/stakeholderQuality";
import { extractContactsWithContext } from "../lib/scrapers";
import * as Sentry from "@sentry/node";

// ─── Constants ─────────────────────────────────────────────────────────────
const IMAGE_RESULTS = 3; // Limit image search results
const DEDUP_THRESHOLD = 0.92; // Cosine similarity threshold for deduplication
const NEWS_MAX_AGE_MONTHS = 18; // Discard news signals older than this
const REENRICH_COOLDOWN_DAYS = 30; // Skip news/image enrichment if last run was within this window
const TOP_DECISION_MAKER_ROLES = new Set([
  "Vice Chancellor",
  "Pro Vice Chancellor",
  "Registrar",
  "Dy Registrar",
  "Dean Student Welfare",
  "Dean Student Affairs",
  "Director Administration",
  "Chief Warden",
  "Controller of Examinations",
  "Owner",
  "President",
  "Chairman",
  "Chairperson",
  "Chancellor",
  "Finance Officer",
  "Librarian",
  "Head of Department",
  "Placement Officer",
  "Public Relations Officer",
  "Director",
  "Rector",
  "Secretary",
  "Treasurer",
  "Dean of Faculty",
  "Head of Administration",
  "Executive Director",
  "Managing Director",
  "Joint Director",
  "Deputy Director",
  "Associate Director",
]);

function hasRoleBasedInstitutionEmail(email?: string | null): boolean {
  const local = (email || "").toLowerCase().split("@")[0] || "";
  return [
    "vc",
    "provc",
    "registrar",
    "reg",
    "dyregistrar",
    "dean",
    "dsw",
    "dsa",
    "director",
    "director-admin",
    "warden",
    "chiefwarden",
    "coe",
    "finance",
    "cfo",
    "librarian",
    "library",
    "placement",
    "tpo",
    "pro",
    "principal",
    "hod",
  ].some((prefix) => local === prefix || local.startsWith(`${prefix}.`) || local.startsWith(`${prefix}_`));
}

function extractCandidateNameFromLinkedinTitle(
  title: string | undefined,
  universityName: string,
  role: string | undefined,
): string | undefined {
  const firstChunk = (title || "").split(/[|\-–]/)[0]?.trim();
  if (!firstChunk || firstChunk.length < 4) return undefined;
  const lower = firstChunk.toLowerCase();
  if (lower.includes(universityName.toLowerCase())) return undefined;
  if (role && lower === role.toLowerCase()) return undefined;
  if (!/\s/.test(firstChunk)) return undefined;
  return firstChunk;
}

/**
 * Validate whether a LinkedIn profile URL/title actually matches a stakeholder name.
 * Checks that at least one non-trivial name token (first or last name) appears in
 * the URL slug or title. Prevents false positives like "puneetred" for "Dr. K R Sridhara Murthi".
 */
function linkedinProfileMatchesName(
  name: string | undefined,
  linkedinUrl: string | undefined,
): boolean {
  if (!name || !linkedinUrl) return false;
  const slugMatch = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
  const slug = slugMatch ? slugMatch[1].toLowerCase() : "";

  const nameTokens = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        !["dr", "prof", "mr", "mrs", "ms", "shri", "smt", "er"].includes(t),
    );

  if (nameTokens.length === 0) return false;

  // A LinkedIn personal profile URL slug should contain a name token.
  // We do not rely on the title because search results can show a person's name
  // while linking to an unrelated profile (e.g. a campus or company page).
  const slugMatches = nameTokens.filter((token) => slug.includes(token)).length;
  return slugMatches >= 1;
}

/**
 * Search the public web for a stakeholder's email and/or phone.
 * Uses Serper and extracts contacts from result snippets, keeping only those
 * whose surrounding context mentions the person's name or role.
 */
async function searchStakeholderEmailPhone(
  name: string | undefined,
  role: string | undefined,
  universityName: string,
  domain: string | undefined,
  serperKey: string,
): Promise<{ email?: string; phone?: string }> {
  if (!name || !serperKey) return {};
  const q = `"${name}" "${universityName}" email phone contact`;
  try {
    const data = await withRetry(async () => {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        throw new Error(`Serper search failed: ${response.status}`);
      }
      return await response.json();
    });

    const organic = (data.organic || []) as Array<{
      title?: string;
      snippet?: string;
    }>;
    const text = organic
      .map((r) => `${r.title || ""}\n${r.snippet || ""}`)
      .join("\n");
    const extracted = extractContactsWithContext(text);

    const nameLower = (name || "").toLowerCase();
    const roleLower = (role || "").toLowerCase();
    const normalizedDomain = (domain || "").toLowerCase().replace(/^www\./, "");

    const emailMatch = extracted.emails.find((e) => {
      const emailDomain = e.value.split("@")[1]?.toLowerCase();
      const context = e.context;
      const relevant =
        context.includes(nameLower) ||
        (!!roleLower && context.includes(roleLower));
      const domainOk =
        !normalizedDomain ||
        !!emailDomain?.endsWith(normalizedDomain) ||
        emailDomain?.endsWith(".ac.in");
      return relevant && domainOk;
    });

    const phoneMatch = extracted.phones.find((p) => {
      const context = p.context;
      return (
        context.includes(nameLower) ||
        (!!roleLower && context.includes(roleLower))
      );
    });

    return {
      email: emailMatch?.value,
      phone: phoneMatch?.value,
    };
  } catch (e) {
    console.warn(`[Enrichment] Contact search failed for ${name}:`, e);
    return {};
  }
}

interface LinkedInBatchResult {
  stakeholderId: Id<"stakeholders">;
  name?: string;
  role?: string;
  linkedin_url?: string;
  signalContent?: string;
  sourceUrl?: string;
  extraSignals?: Array<{ content: string; source_url?: string }>;
}

const LINKEDIN_SEARCH_BATCH_SIZE = 3;

/**
 * Search Serper once for a batch of stakeholders, returning any LinkedIn
 * profile matches found in the results. This cuts Serper query volume from
 * N stakeholders to ceil(N / LINKEDIN_SEARCH_BATCH_SIZE) per university.
 */
async function searchStakeholderLinkedInBatch(
  targets: Array<{
    _id: Id<"stakeholders">;
    name?: string;
    role?: string;
  }>,
  universityName: string,
  city: string | undefined,
  serperKey: string,
): Promise<LinkedInBatchResult[]> {
  if (targets.length === 0 || !serperKey) return [];

  const names = targets
    .map((t) => t.name?.trim())
    .filter((n): n is string => !!n && n.length > 2)
    .map((n) => n.replace(/"/g, ""));

  if (names.length === 0) return [];

  const nameClause =
    names.length === 1 ? `"${names[0]}"` : `(${names.map((n) => `"${n}"`).join(" OR ")})`;

  const q = [
    "site:linkedin.com/in/",
    nameClause,
    `"${universityName.replace(/"/g, "")}"`,
    city ? `"${city.replace(/"/g, "")}"` : "",
    "India",
  ]
    .filter(Boolean)
    .join(" ");

  const data = await withRetry(async () => {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": serperKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ q, num: 10 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      throw new Error(
        `Serper search failed: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  });

  const linkedinResults = (data.organic || []).filter(
    (result: { link?: string }) => result.link?.includes("linkedin.com/in/"),
  ) as Array<{ link?: string; title?: string; snippet?: string }>;

  const results: LinkedInBatchResult[] = [];

  for (const target of targets) {
    if (!target.name) continue;
    const normalizedRole = normalizeStakeholderRole(target.role);

    // Find the best result whose URL slug matches the target's name, optionally
    // supported by the title/snippet mentioning the canonical role.
    let bestResult:
      | { link: string; title?: string; snippet?: string }
      | undefined;
    for (const result of linkedinResults) {
      const link = result.link;
      if (!link) continue;
      const matchesName = linkedinProfileMatchesName(target.name, link);
      const roleInContext =
        !!normalizedRole &&
        `${result.title || ""} ${result.snippet || ""}`
          .toLowerCase()
          .includes(normalizedRole.toLowerCase());
      if (
        matchesName ||
        (roleInContext && linkedinProfileMatchesName(target.name, link))
      ) {
        bestResult = { link, title: result.title, snippet: result.snippet };
        break;
      }
    }

    if (!bestResult) continue;

    const discoveredName =
      target.name ||
      extractCandidateNameFromLinkedinTitle(
        bestResult.title,
        universityName,
        normalizedRole,
      );

    const extraSignals = linkedinResults
      .filter(
        (r) =>
          r.link &&
          r.link !== bestResult!.link &&
          linkedinProfileMatchesName(target.name, r.link),
      )
      .slice(0, 2)
      .map((r) => {
        const signalName =
          target.name ||
          extractCandidateNameFromLinkedinTitle(
            r.title,
            universityName,
            normalizedRole,
          ) ||
          normalizedRole ||
          "Decision maker";
        return {
          content: [
            signalName,
            normalizedRole || "",
            r.title || "",
            r.snippet || "",
          ]
            .filter(Boolean)
            .join(" | "),
          source_url: r.link,
        };
      });

    const signalContent = [
      discoveredName,
      normalizedRole || "",
      bestResult.title || "",
      bestResult.snippet || "",
    ]
      .filter(Boolean)
      .join(" | ");

    results.push({
      stakeholderId: target._id,
      name: discoveredName,
      role: target.role,
      linkedin_url: bestResult.link,
      signalContent,
      sourceUrl: bestResult.link,
      extraSignals,
    });
  }

  return results;
}

/**
 * SHA-256 hash for comparing text content.
 * Used to detect unchanged news synthesis and skip redundant embed() calls.
 */
function hashString(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Extract the most recent year mentioned in text (e.g. "2024", "2025").
 * Returns null if no year found.
 */
function extractLatestYear(text: string): number | null {
  const matches = text.match(/\b20\d{2}\b/g);
  if (!matches || matches.length === 0) return null;
  const years = matches.map((y) => parseInt(y, 10));
  return Math.max(...years);
}

/**
 * Returns true if the news text mentions a year within NEWS_MAX_AGE_MONTHS of now.
 */
function isNewsRecent(text: string): boolean {
  const latestYear = extractLatestYear(text);
  if (!latestYear) {
    // No year found — conservatively reject to avoid stale undated content
    console.warn("[Enrichment] News item has no year; treating as stale.");
    return false;
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  // Compare as "year + month/12" for fractional year comparison
  const textYearDecimal = latestYear;
  const currentYearDecimal = currentYear + currentMonth / 12;
  const ageMonths = (currentYearDecimal - textYearDecimal) * 12;
  return ageMonths <= NEWS_MAX_AGE_MONTHS;
}

export const discoverSocialAndMedia = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    error?: string;
    stakeholdersUpdated?: number;
    signalsAdded?: number;
    imagesAdded?: number;
    llmUsage?: LlmUsageSummary;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
      const uni = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });
      if (!uni) throw new Error("University not found");

      const stakeholders = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        { university_id: args.universityId },
      );

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
      const serperKey = await ctx.runQuery(
        internal.settings.getInternalSerperKey,
      );

      if (!serperKey) {
        console.warn("[Enrichment] No SERPER_API_KEY");
        return {
          success: false,
          reason: "No SERPER_API_KEY",
          llmUsage: summarizeLlmUsage(llmUsageEntries),
        };
      }
      const cleanSerperKey = serperKey.trim();

      // Check for recent signals to avoid redundant re-enrichment
      const existingSignals = await ctx.runQuery(
        internal.signals.listByUniversityInternal,
        { university_id: args.universityId },
      );
      const recentNewsSignals = existingSignals
        .filter((s: Doc<"universitySignals">) => s.signal_type === "news")
        .sort(
          (a: Doc<"universitySignals">, b: Doc<"universitySignals">) =>
            (b.created_at ?? 0) - (a.created_at ?? 0),
        );
      const skipNewsAndImage =
        recentNewsSignals.length > 0 &&
        (recentNewsSignals[0].created_at ?? 0) >
          Date.now() - REENRICH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
      if (skipNewsAndImage) {
        console.log(
          `[Enrichment] Skipping news/image enrichment for ${uni.university_name}: last enriched ${new Date(recentNewsSignals[0].created_at ?? 0).toISOString()}.`,
        );
      }

      // Build a content→embedding cache map from existing signals to avoid redundant embed() calls
      const existingEmbeddingCache = new Map<string, number[]>();
      for (const s of existingSignals) {
        if (s.signal_type === "news" && s.content && s.embedding) {
          existingEmbeddingCache.set(hashString(s.content), s.embedding);
        }
      }

      let updatedCount = 0;
      console.log(
        `[Enrichment] Starting social/media enrichment for ${uni.university_name}`,
      );

      let signalsAdded = 0;
      const allSignals: {
        university_id: Id<"universities">;
        signal_type: "news" | "image" | "linkedin" | "website" | "manual";
        content: string;
        source_url?: string;
        embedding: number[];
      }[] = [];

      // 1. LinkedIn searches for stakeholders (batched to reduce Serper queries)
      const liTargets = stakeholders.filter(
        (st: Doc<"stakeholders">) =>
          ((st.name && st.name.trim().length > 2) ||
            (st.role &&
              isSingletonRole(st.role) &&
              !!normalizeStakeholderRole(st.role) &&
              TOP_DECISION_MAKER_ROLES.has(
                normalizeStakeholderRole(st.role)!,
              )) ||
            !!(st.email && hasRoleBasedInstitutionEmail(st.email))) &&
          // Skip stakeholders whose existing LinkedIn URL already matches their name
          (!st.linkedin_url ||
            !linkedinProfileMatchesName(st.name, st.linkedin_url)),
      );

      // Clear mismatched LinkedIn URLs before searching
      for (const st of liTargets) {
        if (st.linkedin_url && !linkedinProfileMatchesName(st.name, st.linkedin_url)) {
          console.warn(
            `[Enrichment] Clearing mismatched LinkedIn URL for ${st.name || st.role}: ${st.linkedin_url}`,
          );
          await ctx.runMutation(internal.stakeholders.updateLinkedinInternal, {
            id: st._id,
            linkedin_url: undefined,
            name: st.name,
          });
        }
      }

      const liBatches: Array<typeof liTargets> = [];
      for (let i = 0; i < liTargets.length; i += LINKEDIN_SEARCH_BATCH_SIZE) {
        liBatches.push(liTargets.slice(i, i + LINKEDIN_SEARCH_BATCH_SIZE));
      }

      const liBatchTasks = liBatches.map((batch) => async () => {
        try {
          const batchResults = await searchStakeholderLinkedInBatch(
            batch.map((st) => ({ _id: st._id, name: st.name, role: st.role })),
            uni.university_name,
            uni.city,
            cleanSerperKey,
          );

          for (const match of batchResults) {
            if (match.linkedin_url) {
              await ctx.runMutation(internal.stakeholders.updateLinkedinInternal, {
                id: match.stakeholderId,
                linkedin_url: match.linkedin_url,
                name: match.name,
              });
              updatedCount++;
            }

            if (match.signalContent) {
              allSignals.push({
                university_id: args.universityId,
                signal_type: "linkedin",
                content: match.signalContent,
                source_url: match.sourceUrl,
                embedding: apiKey
                  ? await embed(match.signalContent, apiKey)
                  : [],
              });
            }

            for (const extra of match.extraSignals || []) {
              allSignals.push({
                university_id: args.universityId,
                signal_type: "linkedin",
                content: extra.content,
                source_url: extra.source_url,
                embedding: apiKey
                  ? await embed(extra.content, apiKey)
                  : [],
              });
            }

            console.log(
              `[Enrichment] Found LinkedIn candidate for ${match.name || match.role || "stakeholder"}`,
            );
          }
        } catch (e) {
          console.error(`[Enrichment] Batched LinkedIn search failed:`, e);
        }
      });

      await withConcurrencyLimit(liBatchTasks, 3);

      // 2. Search external sources for missing email/phone contacts (top 3 per uni)
      const contactSearchTargets = stakeholders
        .filter(
          (st: Doc<"stakeholders">) =>
            st.name && !st.email && !st.phone && isDecisionMakerRole(st.role),
        )
        .slice(0, 3);

      const contactTasks = contactSearchTargets.map(
        (st: Doc<"stakeholders">) => async () => {
          try {
            const found = await searchStakeholderEmailPhone(
              st.name,
              st.role,
              uni.university_name,
              normalizeInstitutionDomain(uni.website),
              cleanSerperKey,
            );
            if (found.email || found.phone) {
              await ctx.runMutation(internal.stakeholders.updateContactInternal, {
                id: st._id,
                email: found.email,
                phone: found.phone,
                email_source: found.email ? "inferred" : undefined,
                phone_source: found.phone ? "inferred" : undefined,
              });
              console.log(
                `[Enrichment] Found external contact for ${st.name}: ${found.email || ""} ${found.phone || ""}`,
              );
            }
          } catch (e) {
            console.warn(
              `[Enrichment] External contact search failed for ${st.name}:`,
              e,
            );
          }
        },
      );

      await withConcurrencyLimit(contactTasks, 3);

      // 3. Discover News Signals via Serper (cheaper than Gemini Grounding)
      if (!skipNewsAndImage) {
        try {
          const newsQuery = `${uni.university_name} India news partnerships collaborations MOU campus placement`;
          const newsData = await withRetry(async () => {
            const response = await fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: {
                "X-API-KEY": cleanSerperKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ q: newsQuery, num: 8 }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
              throw new Error(
                `Serper news search failed: ${response.status} ${response.statusText}`,
              );
            }
            return await response.json();
          });

          const newsResults = (newsData.organic || []).filter(
            (r: { link?: string; snippet?: string; title?: string }) =>
              r.link &&
              (r.snippet || r.title) &&
              r.title?.toLowerCase() !== uni.university_name.toLowerCase(),
          );

          if (newsResults.length > 0) {
            const newsSynthesis = newsResults
              .slice(0, 5)
              .map(
                (r: { title?: string; snippet?: string; date?: string }) =>
                  `- ${r.title || ""}: ${r.snippet || ""}${r.date ? ` (${r.date})` : ""}`,
              )
              .join("\n");

            if (isNewsRecent(newsSynthesis)) {
              const contentHash = hashString(newsSynthesis);
              const cachedEmbedding = existingEmbeddingCache.get(contentHash);
              const embedding =
                cachedEmbedding ?? (await embed(newsSynthesis, apiKey));
              allSignals.push({
                university_id: args.universityId,
                signal_type: "news",
                content: newsSynthesis,
                source_url: newsResults[0].link,
                embedding,
              });
              console.log(
                `[Enrichment] Serper news for ${uni.university_name}: ${newsResults.length} results, ${newsSynthesis.length} chars`,
              );
            } else {
              const staleYear = extractLatestYear(newsSynthesis);
              console.warn(
                `[Enrichment] Discarding stale news for ${uni.university_name}: latest year ${staleYear} is older than ${NEWS_MAX_AGE_MONTHS} months.`,
              );
            }
          } else {
            console.log(
              `[Enrichment] No recent Serper news for ${uni.university_name}`,
            );
          }
        } catch (e) {
          console.error(`[Enrichment] Serper news search failed:`, e);
        }
      }

      // 3. Discover Images (University Logo/Buildings) — skipped if recently enriched
      let imagesAdded = 0;
      if (!skipNewsAndImage) {
        try {
          const q = `"${uni.university_name}" official logo OR campus building`;
          const data = await withRetry(async () => {
            const response = await fetch("https://google.serper.dev/images", {
              method: "POST",
              headers: {
                "X-API-KEY": cleanSerperKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ q, num: IMAGE_RESULTS }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
              throw new Error(
                `Serper image search failed: ${response.status} ${response.statusText}`,
              );
            }
            return await response.json();
          });

          const imageResults = data.images || [];
          const selectedImages = imageResults.slice(0, IMAGE_RESULTS);
          // Pre-compute all embeddings in parallel
          const imageSnippets = selectedImages.map(
            (img: { title?: string }) =>
              `Image of ${uni.university_name}: ${img.title || "Campus"}`,
          );
          const imageEmbeddings = await Promise.all(
            imageSnippets.map((snippet: string) => embed(snippet, apiKey)),
          );
          for (let i = 0; i < selectedImages.length; i++) {
            const img = selectedImages[i];
            const embedding = imageEmbeddings[i];

            // Deduplicate: skip if this batch already has a near-identical image signal
            const isDuplicate = allSignals.some(
              (s) =>
                s.signal_type === "image" &&
                cosineSimilarity(s.embedding, embedding) > DEDUP_THRESHOLD,
            );
            if (isDuplicate) continue;

            const imgTitle = (img as { title?: string }).title || "Campus";
            const imgUrl = (img as { imageUrl: string }).imageUrl;
            allSignals.push({
              university_id: args.universityId,
              signal_type: "image",
              content: `${imgTitle} | ${imgUrl}`,
              source_url: (img as { link?: string }).link,
              embedding,
            });
            imagesAdded++;
          }
        } catch (e) {
          console.error(`[Enrichment] Serper.dev Image search failed:`, e);
        }
      }

      // 4. Batch Insert Signals
      if (allSignals.length > 0) {
        // Wipe old signals only for the types we actually rebuilt this run,
        // so a cooldown skip doesn't delete existing news/image signals.
        const typesToDelete = [
          ...new Set(allSignals.map((s) => s.signal_type)),
        ] as ("news" | "image" | "linkedin" | "website" | "manual")[];
        await ctx.runMutation(internal.signals.deleteByTypeInternal, {
          university_id: args.universityId,
          signal_types: typesToDelete,
        });

        await ctx.runMutation(internal.signals.batchInsertInternal, {
          signals: allSignals,
        });
        signalsAdded = allSignals.length;
      }

      console.log(
        `[Enrichment] Completed for ${uni.university_name}. Updated ${updatedCount} stakeholders, added ${signalsAdded} signals (${imagesAdded} images).`,
      );

      return {
        success: true,
        stakeholdersUpdated: updatedCount,
        signalsAdded,
        imagesAdded,
        llmUsage: summarizeLlmUsage(llmUsageEntries),
      };
    } catch (e) {
      console.error("[Enrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return {
        success: false,
        error: String(e),
        llmUsage: summarizeLlmUsage([]),
      };
    }
  },
});

/**
 * Debug action: traces LinkedIn enrichment WITHOUT writing to DB.
 * Returns detailed diagnostics on candidate filtering, Serper results,
 * and acceptance decisions to surface why LinkedIn coverage stays at 0.
 */
export const debugLinkedInEnrichment = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const uni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    if (!uni) return { error: "University not found" };

    const stakeholders = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: args.universityId },
    );

    const serperKey = await ctx.runQuery(
      internal.settings.getInternalSerperKey,
    );
    if (!serperKey) return { error: "No SERPER_API_KEY" };
    const cleanSerperKey = serperKey.trim();

    const candidates = stakeholders
      .filter(
        (st: Doc<"stakeholders">) =>
          !st.linkedin_url &&
          ((st.name && st.name.trim().length > 2) ||
            (st.role &&
              isSingletonRole(st.role) &&
              !!normalizeStakeholderRole(st.role) &&
              TOP_DECISION_MAKER_ROLES.has(
                normalizeStakeholderRole(st.role)!,
              )) ||
            !!(st.email && hasRoleBasedInstitutionEmail(st.email))),
      )
      .map((st: Doc<"stakeholders">) => ({ id: st._id, name: st.name, role: st.role, email: st.email }));

    const logs: Record<string, unknown>[] = [];

    for (const st of candidates.slice(0, 8)) {
      const queryParts = [
        "site:linkedin.com/in/",
        st.name ? `"${st.name}"` : st.role ? `"${st.role}"` : "",
        `"${uni.university_name}"`,
        uni.city ? `"${uni.city}"` : "",
        "India",
      ].filter(Boolean);
      const q = queryParts.join(" ");

      try {
        const data = await withRetry(async () => {
          const response = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": cleanSerperKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ q }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            throw new Error(
              `Serper search failed: ${response.status} ${response.statusText}`,
            );
          }
          return await response.json();
        });

        const linkedinResults = (data.organic || []).filter(
          (result: { link?: string }) =>
            result.link?.includes("linkedin.com/in/"),
        );
        const firstResult = linkedinResults[0];

        const normalizedRole = normalizeStakeholderRole(st.role);
        const discoveredName =
          st.name ||
          extractCandidateNameFromLinkedinTitle(
            firstResult?.title,
            uni.university_name,
            normalizedRole,
          );
        const canPatchStakeholder =
          linkedinProfileMatchesName(discoveredName, firstResult?.link) ||
          (!!normalizedRole &&
            linkedinProfileMatchesName(st.name, firstResult?.link) &&
            `${firstResult?.title || ""} ${firstResult?.snippet || ""}`
              .toLowerCase()
              .includes(normalizedRole.toLowerCase()));

        logs.push({
          candidate: st,
          query: q,
          serperResultCount: (data.organic || []).length,
          linkedinResultCount: linkedinResults.length,
          topResult: firstResult
            ? {
                title: firstResult.title,
                snippet: firstResult.snippet,
                link: firstResult.link,
              }
            : null,
          discoveredName,
          canPatchStakeholder,
          reason: canPatchStakeholder
            ? "accepted"
            : firstResult?.link
              ? "rejected: no name match and role not in title/snippet"
              : "rejected: no linkedin results",
        });
      } catch (e) {
        logs.push({
          candidate: st,
          query: q,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      university: uni.university_name,
      totalStakeholders: stakeholders.length,
      candidatesConsidered: candidates.length,
      candidatesSearched: logs.length,
      accepted: logs.filter((l) => l.canPatchStakeholder).length,
      rejected: logs.filter((l) => !l.canPatchStakeholder && !l.error).length,
      errors: logs.filter((l) => l.error).length,
      details: logs,
    };
  },
});
