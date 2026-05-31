"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { withRetry } from "../lib/utils";
import { callGeminiWithGrounding, MODELS } from "../lib/llm";

/**
 * Generate progressively shorter query variants for Serper fallback.
 * Keeps the first N words (with generic filler removed) to improve hit rate on long names.
 */
function generateShortNameQueries(fullName: string): string[] {
  // Remove generic filler words (keep in sync with significantWords in looksLikeOwnedDomain)
  const words = fullName
    .replace(/\b(university|college|institute|of|technology|management|school|and|&)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const variants: string[] = [];
  // Take first 5 words, then 4, then 3
  for (const count of [5, 4, 3]) {
    if (words.length >= count) {
      const short = words.slice(0, count).join(" ");
      if (short) variants.push(`${short} official website India`);
    }
  }
  return [...new Set(variants)]; // dedupe
}

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

    async function tryFetch(targetUrl: string, method: "HEAD" | "GET"): Promise<boolean> {
      try {
        const response = await fetch(targetUrl, {
          method,
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok || response.status === 405 /* Method Not Allowed */) {
          // HEAD 405 means server is reachable but rejects HEAD; still treat as valid
          if (response.ok || method === "HEAD") {
            await ctx.runMutation(internal.universities.updateInternal, {
              id: args.universityId,
              website: targetUrl,
              website_status: "valid",
            });
            return true;
          }
        }
      } catch {
        // network error — will fall through
      }
      return false;
    }

    if (await tryFetch(url, "HEAD")) return true;
    if (await tryFetch(url, "GET")) return true;

    // Fallback to HTTP if HTTPS failed
    if (url.startsWith("https://")) {
      const httpUrl = url.replace("https://", "http://");
      if (await tryFetch(httpUrl, "HEAD")) return true;
      if (await tryFetch(httpUrl, "GET")) return true;
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

    // Fetch university details to include state and city in the search
    const university = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    const state = university?.state || "";
    const city = university?.city || "";
    // Clean up state/city if they are placeholders or unknown
    const cleanState = state && !/unknown|test/i.test(state) ? state : "";
    const cleanCity = city && !/unknown|test/i.test(city) ? city : "";
    const locationSuffix = `${cleanCity ? " " + cleanCity : ""}${cleanState ? " " + cleanState : ""}`;

    // Try progressively shorter name variants if the full name yields no results
    // We prioritize variants with the branch's state and city to ensure we get the correct branch website
    const nameVariants = [
      `${args.universityName}${locationSuffix} official website India`,
      `${args.universityName} official website India`,
      ...generateShortNameQueries(args.universityName).map(q => q.replace("official website India", `${locationSuffix} official website India`)),
      ...generateShortNameQueries(args.universityName),
    ];

    let data: { organic?: Array<{ link: string }> } | null = null;
    for (const q of nameVariants) {
      try {
        const result = await withRetry(async () => {
          const response = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
              "X-API-KEY": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ q, num: 3 }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(
              `Serper search failed: ${response.status} ${response.statusText} — ${body}`,
            );
          }
          return await response.json();
        });
        if (result.organic?.length > 0) {
          data = result;
          console.log(`[Discovery] Query hit with: "${q}"`);
          break;
        }
        console.log(`[Discovery] Serper returned 0 organic results for: "${q}"`);
      } catch (e) {
        console.error(`[Discovery] Serper error for "${q}":`, e instanceof Error ? e.message : String(e));
      }
    }

    let organicResults: Array<{ link: string }> = [];

    if (!data) {
      console.warn(
        `[Discovery] Serper returned no results for ${args.universityName}. Falling back to Gemini Grounding...`,
      );

      try {
        const geminiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
        if (geminiKey) {
          const grounding = await callGeminiWithGrounding({
            systemPrompt:
              "You are a research assistant. Find the official website of the given university. Return ONLY the full URL (including https://).",
            userPrompt: `What is the official website of ${args.universityName} in India?`,
            temperature: 0,
            model: MODELS.gemini, // fast, cheap, with search
            apiKey: geminiKey,
          });

          let foundUrl = "";
          if (grounding.sources.length > 0) {
            foundUrl = grounding.sources[0];
          } else if (grounding.text) {
            // Fallback: extract URL from text response using regex, then validate
            const urlMatch = grounding.text.match(/https?:\/\/[^\s\"<>]+/);
            if (urlMatch) {
              const candidate = urlMatch[0];
              try {
                const urlObj = new URL(candidate);
                const hostname = urlObj.hostname.replace(/^www\./, "");
                const tld = hostname.split(".").pop() || "";
                const validTlds = ["edu", "ac", "in", "org", "com", "net"];
                const hasValidTld = validTlds.some((v) => tld === v || tld.endsWith(`.${v}`));
                if (hasValidTld) {
                  foundUrl = candidate;
                } else {
                  console.warn(`[Discovery] Rejected URL with invalid TLD: ${candidate}`);
                }
              } catch {
                console.warn(`[Discovery] Rejected malformed URL: ${candidate}`);
              }
            }
          }
          if (foundUrl) {
            console.log(`[Discovery] Gemini Grounding found: ${foundUrl}`);
            organicResults = [{ link: foundUrl }];
            data = { organic: organicResults };
          } else {
            console.warn(`[Discovery] Gemini Grounding returned no sources or URL for ${args.universityName}`);
          }
        }
      } catch (e) {
        console.error(`[Discovery] Gemini Grounding fallback failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    if (!data) {
      console.warn(
        `[Discovery] No results for ${args.universityName} after ${nameVariants.length} Serper attempts + Gemini fallback.`,
      );
      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        website_status: "invalid",
      });
      return null;
    }

    organicResults = data.organic || [];

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
  },
});

