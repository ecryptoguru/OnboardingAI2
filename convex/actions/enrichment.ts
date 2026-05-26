"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { embed } from "../lib/llm";
import { withRetry, cosineSimilarity } from "../lib/utils";
import * as Sentry from "@sentry/nextjs";

// ─── Constants ─────────────────────────────────────────────────────────────
const NEWS_ITEMS_PER_QUERY = 3; // Limit news items per query
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

      // 1. LinkedIn searches for stakeholders
      const liPromises = stakeholders.map(
        async (st: {
          _id: Id<"stakeholders">;
          linkedin_url?: string;
          name?: string;
          role?: string;
        }) => {
          if (st.linkedin_url || (!st.name && !st.role)) return;

          const q = `site:linkedin.com/in/ "${st.name || st.role}" "${uni.university_name}" India`;
          try {
            const data = await withRetry(async () => {
              const response = await fetch("https://google.serper.dev/search", {
                method: "POST",
                headers: {
                  "X-API-KEY": serperKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ q }),
              });
              if (!response.ok) {
                throw { status: response.status, message: response.statusText };
              }
              return await response.json();
            });

            const firstResult = data.organic?.[0];
            if (firstResult && firstResult.link.includes("linkedin.com/in/")) {
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
            console.error(`[Enrichment] Serper.dev LinkedIn search failed:`, e);
          }
        },
      );

      await Promise.all(liPromises);

      // 2. Discover News Signals
      const queries = [
        `"${uni.university_name}" India partnership OR collaboration OR "mou signed" news`,
        `"${uni.university_name}" India placement OR "new campus" OR "convocation" news`,
      ];
      let signalsAdded = 0;
      const allSignals: {
        university_id: Id<"universities">;
        signal_type: "news" | "image" | "linkedin" | "website" | "manual";
        content: string;
        source_url?: string;
        embedding: number[];
      }[] = [];

      const newsPromises = queries.map(async (q) => {
        try {
          const data = await withRetry(async () => {
            const response = await fetch("https://google.serper.dev/news", {
              method: "POST",
              headers: {
                "X-API-KEY": serperKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ q }),
            });
            if (!response.ok) {
              throw { status: response.status, message: response.statusText };
            }
            return await response.json();
          });

          const newsItems = data.news || [];

          // Limit to latest news per query
          const items = newsItems.slice(0, NEWS_ITEMS_PER_QUERY);
          // Batch embed all news snippets in parallel
          const newsSnippets = items.map(
            (item: { title: string; snippet?: string }) =>
              `${item.title} - ${item.snippet || ""}`,
          );
          const embeddings = await Promise.all(
            newsSnippets.map((snippet: string) => embed(snippet, apiKey)),
          );
          items.forEach(
            (
              item: { title: string; snippet?: string; link?: string },
              idx: number,
            ) => {
              allSignals.push({
                university_id: args.universityId,
                signal_type: "news",
                content: newsSnippets[idx],
                source_url: item.link,
                embedding: embeddings[idx],
              });
            },
          );
        } catch (e) {
          console.error(`[Enrichment] Serper.dev News search failed:`, e);
        }
      });

      await Promise.all(newsPromises);

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
          });
          if (!response.ok) {
            throw { status: response.status, message: response.statusText };
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

          allSignals.push({
            university_id: args.universityId,
            signal_type: "image",
            content: (img as { imageUrl: string }).imageUrl,
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
