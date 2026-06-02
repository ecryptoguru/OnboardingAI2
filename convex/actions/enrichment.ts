"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { embed, callGeminiWithGrounding } from "../lib/llm";
import { withRetry, cosineSimilarity, withConcurrencyLimit } from "../lib/utils";
import * as Sentry from "@sentry/node";

// ─── Constants ─────────────────────────────────────────────────────────────
const IMAGE_RESULTS = 3; // Limit image search results
const DEDUP_THRESHOLD = 0.92; // Cosine similarity threshold for deduplication
const NEWS_MAX_AGE_MONTHS = 18; // Discard news signals older than this
const REENRICH_COOLDOWN_DAYS = 30; // Skip news/image enrichment if last run was within this window

/**
 * Simple non-cryptographic hash for comparing text content.
 * Used to detect unchanged news synthesis and skip redundant embed() calls.
 */
function hashString(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return String(h);
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

export const discoverSocialAndMedia = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
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
        return { success: false, reason: "No SERPER_API_KEY" };
      }
      const cleanSerperKey = serperKey.trim();

      // Check for recent signals to avoid redundant re-enrichment
      const existingSignals = await ctx.runQuery(
        internal.signals.listByUniversityInternal,
        { university_id: args.universityId },
      );
      const recentNewsSignals = existingSignals
        .filter((s) => s.signal_type === "news")
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
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

      // 1. LinkedIn searches for stakeholders (capped at 5 concurrent requests)
      // Only search when we have an actual name — role-only queries are too broad and produce false positives
      const liTasks = stakeholders
        .filter(
          (st) => !st.linkedin_url && st.name && st.name.trim().length > 2,
        )
        .map(
          (st: {
            _id: Id<"stakeholders">;
            linkedin_url?: string;
            name?: string;
            role?: string;
          }) => {
            return async () => {
              const q = `site:linkedin.com/in/ "${st.name}" "${uni.university_name}" India`;
              try {
                const data = await withRetry(async () => {
                  const response = await fetch(
                    "https://google.serper.dev/search",
                    {
                      method: "POST",
                      headers: {
                        "X-API-KEY": cleanSerperKey,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ q }),
                      signal: AbortSignal.timeout(15000),
                    },
                  );
                  if (!response.ok) {
                    throw new Error(
                      `Serper search failed: ${response.status} ${response.statusText}`,
                    );
                  }
                  return await response.json();
                });

                const firstResult = data.organic?.[0];
                if (
                  firstResult &&
                  firstResult.link.includes("linkedin.com/in/")
                ) {
                  await ctx.runMutation(
                    internal.stakeholders.updateLinkedinInternal,
                    {
                      id: st._id,
                      linkedin_url: firstResult.link,
                    },
                  );
                  updatedCount++;
                  console.log(
                    `[Enrichment] Found LinkedIn for ${st.name || st.role}`,
                  );
                }
              } catch (e) {
                console.error(
                  `[Enrichment] Serper.dev LinkedIn search failed:`,
                  e,
                );
              }
            };
          },
        );

      await withConcurrencyLimit(liTasks, 5);

      let signalsAdded = 0;
      const allSignals: {
        university_id: Id<"universities">;
        signal_type: "news" | "image" | "linkedin" | "website" | "manual";
        content: string;
        source_url?: string;
        embedding: number[];
      }[] = [];

      // 2. Discover News Signals via Gemini Grounding (skipped if recently enriched)
      if (!skipNewsAndImage) {
        try {
          const { text: newsSynthesis, sources } = await withRetry(
            async () => {
              return await callGeminiWithGrounding({
                systemPrompt:
                  "You are a university intelligence analyst. Search the web for the latest news about the given university in India. Return a concise summary of recent partnerships, collaborations, MOUs signed, placement drives, new campus openings, convocation events, and any other notable news relevant to business partnerships. Return your findings as plain text with bullet points. Be factual and cite specific events.",
                userPrompt: `Search for the latest news about "${uni.university_name}" in India. Focus on partnerships, collaborations, campus events, and business-relevant activities in the past 12 months.`,
                apiKey,
                temperature: 0.3,
                maxOutputTokens: 2048,
              });
            },
            { maxRetries: 1 },
          );

          if (newsSynthesis) {
            if (!isNewsRecent(newsSynthesis)) {
              const staleYear = extractLatestYear(newsSynthesis);
              console.warn(
                `[Enrichment] Discarding stale news for ${uni.university_name}: latest year ${staleYear} is older than ${NEWS_MAX_AGE_MONTHS} months.`,
              );
            } else {
              // Reuse cached embedding if content hash matches an existing signal
              const contentHash = hashString(newsSynthesis);
              const cachedEmbedding = existingEmbeddingCache.get(contentHash);
              const embedding = cachedEmbedding ?? await embed(newsSynthesis, apiKey);
              if (cachedEmbedding) {
                console.log(`[Enrichment] Reusing cached embedding for news signal (hash: ${contentHash})`);
              }

              allSignals.push({
                university_id: args.universityId,
                signal_type: "news",
                content: newsSynthesis,
                source_url: sources[0] || undefined,
                embedding,
              });

              if (sources.length > 1) {
                const sourceContent = `News sources for ${uni.university_name}: ${sources.join(", ")}`;
                const sourceHash = hashString(sourceContent);
                const cachedSourceEmbedding = existingEmbeddingCache.get(sourceHash);
                const sourceEmbedding = cachedSourceEmbedding ?? await embed(sourceContent, apiKey);
                if (cachedSourceEmbedding) {
                  console.log(`[Enrichment] Reusing cached embedding for news sources (hash: ${sourceHash})`);
                }
                allSignals.push({
                  university_id: args.universityId,
                  signal_type: "news",
                  content: `Source URLs: ${sources.join(", ")}`,
                  source_url: sources[0],
                  embedding: sourceEmbedding,
                });
              }
            }

            console.log(
              `[Enrichment] Grounding news for ${uni.university_name}: ${sources.length} sources, ${newsSynthesis.length} chars`,
            );
          }
        } catch (e) {
          console.error(`[Enrichment] Gemini Grounding news failed:`, e);
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
        // Wipe old signals of the same type to prevent duplicates across multiple enrichment runs
        await ctx.runMutation(internal.signals.deleteByTypeInternal, {
          university_id: args.universityId,
          signal_types: ["news", "image"],
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
      };
    } catch (e) {
      console.error("[Enrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
