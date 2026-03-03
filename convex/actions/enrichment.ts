"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { embed } from "../lib/llm";
import { withRetry } from "../lib/utils";
import * as Sentry from "@sentry/nextjs";

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
      { university_id: args.universityId }
    );

    const serperKey = process.env.SERPER_API_KEY;
    if (!serperKey) {
      console.warn("[Enrichment] No SERPER_API_KEY");
      return { success: false, reason: "No SERPER_API_KEY" };
    }

    let updatedCount = 0;
    console.log(`[Enrichment] Starting social/media enrichment for ${uni.university_name}`);

    // 1. LinkedIn searches for stakeholders
    const liPromises = stakeholders.map(async (st: any) => {
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
          await ctx.runMutation(internal.stakeholders.updateLinkedinInternal, {
            id: st._id,
            linkedin_url: firstResult.link,
          });
          updatedCount++;
          console.log(`[Enrichment] Found LinkedIn for ${st.name || st.role}`);
        }
      } catch (e) {
        console.error(`[Enrichment] Serper.dev LinkedIn search failed:`, e);
      }
    });
    
    await Promise.all(liPromises);

    // 2. Discover News Signals
    const queries = [
      `"${uni.university_name}" India partnership OR collaboration OR "mou signed" news`,
      `"${uni.university_name}" India placement OR "new campus" OR "convocation" news`,
    ];
    let signalsAdded = 0;
    const allSignals: any[] = [];

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

        // Limit to 3 latest news per query
        const items = newsItems.slice(0, 3);
        for (const item of items) {
          const snippet = `${item.title} - ${item.snippet || ""}`;
          // Generate embedding for Vector Search
          const embedding = await embed(snippet);
          allSignals.push({
            university_id: args.universityId,
            signal_type: "news",
            content: snippet,
            source_url: item.link,
            embedding,
          });
        }
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
          body: JSON.stringify({ q, num: 3 }),
        });
        if (!response.ok) {
          throw { status: response.status, message: response.statusText };
        }
        return await response.json();
      });

      const imageResults = data.images || [];
      for (const img of imageResults.slice(0, 3)) {
        // We'll store a mock embedding for images or a real one if needed, 
        // but for now let's use a zero-vector or simple embedding of the title
        const snippet = `Image of ${uni.university_name}: ${img.title || "Campus"}`;
        const embedding = await embed(snippet);
        allSignals.push({
          university_id: args.universityId,
          signal_type: "image",
          content: img.imageUrl,
          source_url: img.link,
          embedding,
        });
        imagesAdded++;
      }
    } catch (e) {
      console.error(`[Enrichment] Serper.dev Image search failed:`, e);
    }

    // 4. Batch Insert Signals
    if (allSignals.length > 0) {
      await ctx.runMutation(internal.signals.batchInsertInternal, {
        signals: allSignals,
      });
      signalsAdded = allSignals.length;
    }

    console.log(
      `[Enrichment] Completed for ${uni.university_name}. Updated ${updatedCount} stakeholders, added ${signalsAdded} signals (${imagesAdded} images).`
    );

    return { success: true, stakeholdersUpdated: updatedCount, signalsAdded, imagesAdded };
    } catch (e) {
      console.error("[Enrichment] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
