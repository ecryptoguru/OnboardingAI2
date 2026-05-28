"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { withRetry } from "../lib/utils";

export const validateWebsite = action({
  args: { universityId: v.id("universities"), website: v.string() },
  handler: async (ctx, args) => {
    let url = args.website.trim();
    if (!url) {
      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        website_status: "invalid",
      });
      return false;
    }

    if (!url.startsWith("http")) {
      url = `https://${url}`;
    }

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        await ctx.runMutation(internal.universities.updateInternal, {
          id: args.universityId,
          website: url, // save normalized URL
          website_status: "valid",
        });
        return true;
      }
    } catch {
      // Fallback to http if https fails
      if (url.startsWith("https://")) {
        try {
          const httpUrl = url.replace("https://", "http://");
          const httpResponse = await fetch(httpUrl, {
            method: "HEAD",
            signal: AbortSignal.timeout(5000),
          });
          if (httpResponse.ok) {
            await ctx.runMutation(internal.universities.updateInternal, {
              id: args.universityId,
              website: httpUrl,
              website_status: "valid",
            });
            return true;
          }
        } catch (fallbackError) {
          console.warn(
            `[validateWebsite] Both HTTPS and HTTP failed for ${url}:`,
            fallbackError,
          );
        }
      }
    }

    await ctx.runMutation(internal.universities.updateInternal, {
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
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
          throw new Error(
            `Serper search failed: ${response.status} ${response.statusText}`,
          );
        }
        return await response.json();
      });

      const organicResults = data.organic || [];

      // Ownership heuristic: domain should contain a significant word from the university name
      const uniNameLower = args.universityName.toLowerCase();
      const significantWords = uniNameLower
        .replace(
          /university|college|institute|of|technology|management|school|and|&/gi,
          "",
        )
        .split(/\s+/)
        .filter((w) => w.length >= 4);

      function looksLikeOwnedDomain(link: string): boolean {
        try {
          const hostname = new URL(link).hostname.replace(/^www\./, "");
          const domainRoot = hostname.split(".")[0];
          // Strong match: domain root contains a significant word from the uni name
          return significantWords.some((word) => domainRoot.includes(word));
        } catch {
          return false;
        }
      }

      // Basic heuristic: take the first non-social/non-wiki link
      let bestLink = "";
      for (const result of organicResults) {
        const link = result.link || "";
        if (
          !link.includes("wikipedia.org") &&
          !link.includes("facebook.com") &&
          !link.includes("linkedin.com") &&
          !link.includes("twitter.com") &&
          !link.includes("instagram.com") &&
          !link.includes("youtube.com")
        ) {
          if (looksLikeOwnedDomain(link)) {
            bestLink = link;
            break;
          }
          // Fallback: keep first plausible candidate if no strong match
          if (!bestLink) bestLink = link;
        }
      }

      if (bestLink) {
        const isStrongMatch = looksLikeOwnedDomain(bestLink);
        await ctx.runMutation(internal.universities.updateInternal, {
          id: args.universityId,
          website: bestLink,
          website_status: (isStrongMatch ? "discovered" : "discovered_weak") as
            | "discovered"
            | "pending"
            | "valid"
            | "invalid"
            | undefined,
        });
        console.log(
          `[Discovery] ${args.universityName} → ${bestLink} (${isStrongMatch ? "strong" : "weak"} match)`,
        );
        return bestLink;
      }

      // If no valid link found
      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        website_status: "invalid",
      });
      return null;
    } catch (_error) {
      console.error("Error discovering website via Serper API:", _error);
      return null;
    }
  },
});
