"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { withRetry } from "../lib/utils";

export const validateWebsite = action({
  args: { universityId: v.id("universities"), website: v.string() },
  handler: async (ctx, args) => {
    let url = args.website.trim();
    if (!url) {
      await ctx.runMutation(api.universities.update, {
        id: args.universityId,
        website_status: "invalid",
      });
      return false;
    }

    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    try {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        await ctx.runMutation(api.universities.update, {
          id: args.universityId,
          website: url, // save normalized URL
          website_status: "valid",
        });
        return true;
      }
    } catch (e) {
      // Fallback to http if https fails
      if (url.startsWith("https://")) {
        try {
          const httpUrl = url.replace("https://", "http://");
          const httpResponse = await fetch(httpUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
          if (httpResponse.ok) {
            await ctx.runMutation(api.universities.update, {
              id: args.universityId,
              website: httpUrl,
              website_status: "valid",
            });
            return true;
          }
        } catch (err) {
          // Both failed
        }
      }
    }

    await ctx.runMutation(api.universities.update, {
      id: args.universityId,
      website_status: "invalid",
    });
    return false;
  },
});

export const discoverWebsite = action({
  args: { universityId: v.id("universities"), universityName: v.string() },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
    if (!apiKey) {
      console.warn("SERPER_API_KEY is not set. Cannot discover website.");
      return null;
    }

    const query = `${args.universityName} official website India`;
    try {
      const data = await withRetry(async () => {
        const response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: query, num: 3 }),
        });
        if (!response.ok) {
          throw { status: response.status, message: response.statusText };
        }
        return await response.json();
      });

      const organicResults = data.organic || [];
      
      // Basic heuristic: take the first non-social/non-wiki link
      let bestLink = "";
      for (const result of organicResults) {
        const link = result.link || "";
        if (!link.includes("wikipedia.org") && !link.includes("facebook.com") && !link.includes("linkedin.com")) {
          bestLink = link;
          break;
        }
      }

      if (bestLink) {
        await ctx.runMutation(api.universities.update, {
          id: args.universityId,
          website: bestLink,
          website_status: "discovered",
        });
        return bestLink;
      }

      // If no valid link found
      await ctx.runMutation(api.universities.update, {
        id: args.universityId,
        website_status: "invalid",
      });
      return null;
    } catch (error) {
      console.error("Error discovering website via Serper API:", error);
      return null;
    }
  },
});
