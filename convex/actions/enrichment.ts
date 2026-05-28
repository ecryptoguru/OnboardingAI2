"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { embed, callGeminiWithGrounding } from "../lib/llm";
import { withRetry, cosineSimilarity, withConcurrencyLimit } from "../lib/utils";
import * as Sentry from "@sentry/nextjs";

// ─── Constants ─────────────────────────────────────────────────────────────
const IMAGE_RESULTS = 3; // Limit image search results
const DEDUP_THRESHOLD = 0.92; // Cosine similarity threshold for deduplication

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
                        "X-API-KEY": serperKey,
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

      // 2. Discover News Signals via Gemini Grounding
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
          const embedding = await embed(newsSynthesis, apiKey);

          allSignals.push({
            university_id: args.universityId,
            signal_type: "news",
            content: newsSynthesis,
            source_url: sources[0] || undefined,
            embedding,
          });

          if (sources.length > 1) {
            const sourceEmbedding = await embed(
              `News sources for ${uni.university_name}: ${sources.join(", ")}`,
              apiKey,
            );
            allSignals.push({
              university_id: args.universityId,
              signal_type: "news",
              content: `Source URLs: ${sources.join(", ")}`,
              source_url: sources[0],
              embedding: sourceEmbedding,
            });
          }

          console.log(
            `[Enrichment] Grounding news for ${uni.university_name}: ${sources.length} sources, ${newsSynthesis.length} chars`,
          );
        }
      } catch (e) {
        console.error(`[Enrichment] Gemini Grounding news failed:`, e);
      }

      // 3. Discover Images (University Logo/Buildings)
      let imagesAdded = 0;
      try {
        const q = `"${uni.university_name}" official logo OR campus building`;
        const data = await withRetry(async () => {
          const response = await fetch("https://google.serper.dev/images", {
            method: "POST",
            headers: {
              "X-API-KEY": serperKey,
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
