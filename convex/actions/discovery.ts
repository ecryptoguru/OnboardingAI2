"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  findFirstValidWebsiteCandidate,
  looksLikeOwnedDomain,
  rankWebsiteCandidates,
} from "../lib/discoveryCandidates";
import { withRetry } from "../lib/utils";
import {
  createSerperBudget,
  runWithSerperBudget,
  markSerperQuotaExhausted,
} from "../lib/serperBudget";
import { callGeminiWithGrounding, MODELS } from "../lib/llm";

/**
 * Generate progressively shorter query variants for Serper fallback.
 * Keeps the first N words (with generic filler removed) to improve hit rate on long names.
 */
function generateShortNameQueries(fullName: string): string[] {
  // Remove generic filler words (keep in sync with significantWords in looksLikeOwnedDomain)
  const words = fullName
    .replace(
      /\b(university|college|institute|of|technology|management|school|and|&)\b/gi,
      " ",
    )
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

function guessOfficialWebsiteCandidates(
  universityName: string,
  state?: string,
): string[] {
  const tokens = universityName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const fullSlug = tokens.join("");
  const acronym = tokens
    .filter((word) => !["of", "and"].includes(word))
    .map((word) => word[0])
    .join("");
  const stateSlug = (state || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const guessed = new Set<string>();

  for (const slug of [fullSlug, acronym]) {
    if (!slug || slug.length < 3) continue;
    guessed.add(`https://${slug}.ac.in`);
    guessed.add(`https://${slug}.edu.in`);
    guessed.add(`https://${slug}.edu`);
    guessed.add(`https://${slug}.gov.in`);
    if (stateSlug) {
      guessed.add(`https://${slug}.${stateSlug}.gov.in`);
    }
  }

  return Array.from(guessed);
}

export const validateWebsite = action({
  args: {
    universityId: v.id("universities"),
    website: v.string(),
    universityName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let url = args.website.trim();
    const universityName = args.universityName;
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

    // Verify the domain actually looks like it belongs to this university.
    // .gov.in domains are authoritative, but still must resemble the institution.
    function domainMatchesUniversity(targetUrl: string): boolean {
      if (!universityName) return true;
      try {
        return looksLikeOwnedDomain(targetUrl, universityName);
      } catch {
        return false;
      }
    }

    async function tryFetch(
      targetUrl: string,
      method: "HEAD" | "GET",
    ): Promise<boolean> {
      try {
        const response = await fetch(targetUrl, {
          method,
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok || response.status === 405 /* Method Not Allowed */) {
          // HEAD 405 means server is reachable but rejects HEAD; still treat as valid
          if (response.ok || method === "HEAD") {
            if (!domainMatchesUniversity(targetUrl)) {
              console.warn(
                `[Discovery] Reached ${targetUrl} but domain does not match ${universityName}.`,
              );
              return false;
            }
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

    async function tryJinaFallback(targetUrl: string): Promise<boolean> {
      try {
        const response = await fetch(`https://r.jina.ai/${targetUrl}`, {
          headers: { Accept: "text/plain" },
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) return false;
        const text = await response.text();
        if (text.trim().length >= 100) {
          if (!domainMatchesUniversity(targetUrl)) {
            console.warn(
              `[Discovery] Jina reached ${targetUrl} but domain does not match ${universityName}.`,
            );
            return false;
          }
          await ctx.runMutation(internal.universities.updateInternal, {
            id: args.universityId,
            website: targetUrl,
            website_status: "valid",
          });
          return true;
        }
      } catch {
        // fall through
      }
      return false;
    }

    if (await tryFetch(url, "HEAD")) return true;
    if (await tryFetch(url, "GET")) return true;
    if (await tryJinaFallback(url)) return true;

    // Fallback to HTTP if HTTPS failed
    if (url.startsWith("https://")) {
      const httpUrl = url.replace("https://", "http://");
      if (await tryFetch(httpUrl, "HEAD")) return true;
      if (await tryFetch(httpUrl, "GET")) return true;
      if (await tryJinaFallback(httpUrl)) return true;
    }

    // Bypass: Indian government domains (.gov.in) are frequently IP-range
    // blocked from cloud environments but are authoritative. Accept them if
    // they look like an official university portal (owned-domain match or
    // education TLD).
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (hostname.endsWith(".gov.in")) {
        if (!domainMatchesUniversity(url)) {
          console.warn(
            `[Discovery] Rejected .gov.in ${url} — domain does not match ${universityName}.`,
          );
        } else {
          await ctx.runMutation(internal.universities.updateInternal, {
            id: args.universityId,
            website: url,
            website_status: "discovered",
          });
          console.warn(
            `[Discovery] Accepted ${url} as .gov.in without live validation (cloud env blocked).`,
          );
          return true;
        }
      }
    } catch {
      // malformed URL — fall through to invalid
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
    const rawApiKey = await ctx.runQuery(
      internal.settings.getInternalSerperKey,
    );
    const apiKey = rawApiKey ? rawApiKey.trim() : null;
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
      `${args.universityName}${locationSuffix} site:gov.in official website`,
      `${args.universityName}${locationSuffix} site:ac.in official website`,
      ...generateShortNameQueries(args.universityName).map((q) =>
        q.replace(
          "official website India",
          `${locationSuffix} official website India`,
        ),
      ),
      ...generateShortNameQueries(args.universityName),
    ];
    const serperBudget = createSerperBudget({ maxQueries: 2 });

    let data: { organic?: Array<{ link: string }> } | null = null;
    for (const q of nameVariants) {
      if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) {
        console.warn(
          `[Discovery] Serper budget reached for ${args.universityName}. Falling back to grounding.`,
        );
        break;
      }
      try {
        const searchResult = await runWithSerperBudget(serperBudget, () =>
          withRetry(async () => {
            const response = await fetch("https://google.serper.dev/search", {
              method: "POST",
              headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ q, num: 5 }),
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
              const body = await response.text().catch(() => "");
              if (
                response.status === 400 &&
                body.toLowerCase().includes("not enough credits")
              ) {
                markSerperQuotaExhausted(serperBudget);
              }
              throw new Error(
                `Serper search failed: ${response.status} ${response.statusText} — ${body}`,
              );
            }
            return await response.json();
          }),
        );
        if (!searchResult.ok) {
          if (searchResult.quotaExhausted) {
            console.warn(
              `[Discovery] Serper quota exhausted for ${args.universityName}.`,
            );
            break;
          }
          console.error(
            `[Discovery] Serper error for "${q}":`,
            searchResult.reason,
          );
          continue;
        }
        const result = searchResult.value;
        if (result.organic?.length > 0) {
          data = result;
          console.log(`[Discovery] Query hit with: "${q}"`);
          break;
        }
        console.log(
          `[Discovery] Serper returned 0 organic results for: "${q}"`,
        );
      } catch (e) {
        console.error(
          `[Discovery] Serper error for "${q}":`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    let organicResults: Array<{ link: string }> = [];

    if (!data) {
      console.warn(
        `[Discovery] Serper returned no results for ${args.universityName}. Falling back to Gemini Grounding...`,
      );

      try {
        const geminiKey = await ctx.runQuery(
          internal.settings.getInternalGeminiKey,
        );
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
              let candidate = urlMatch[0];
              try {
                candidate = candidate.replace(/[),.;:!?]+$/, "");
                const urlObj = new URL(candidate);
                const hostname = urlObj.hostname.replace(/^www\./, "");
                const tld = hostname.split(".").pop() || "";
                const validTlds = ["edu", "ac", "in", "org", "com", "net"];
                const hasValidTld = validTlds.some(
                  (v) => tld === v || tld.endsWith(`.${v}`),
                );
                if (
                  hasValidTld &&
                  looksLikeOwnedDomain(candidate, args.universityName)
                ) {
                  foundUrl = candidate;
                } else {
                  console.warn(
                    `[Discovery] Rejected grounding URL that failed TLD/ownership checks: ${candidate}`,
                  );
                }
              } catch {
                console.warn(
                  `[Discovery] Rejected malformed URL: ${candidate}`,
                );
              }
            }
          }
          if (foundUrl) {
            console.log(`[Discovery] Gemini Grounding found: ${foundUrl}`);
            organicResults = [{ link: foundUrl }];
            data = { organic: organicResults };
          } else {
            console.warn(
              `[Discovery] Gemini Grounding returned no sources or URL for ${args.universityName}`,
            );
          }
        }
      } catch (e) {
        console.error(
          `[Discovery] Gemini Grounding fallback failed:`,
          e instanceof Error ? e.message : String(e),
        );
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

    const candidates = rankWebsiteCandidates(
      [
        ...organicResults.map((result) => result.link || ""),
        ...guessOfficialWebsiteCandidates(args.universityName, cleanState),
      ],
      args.universityName,
      {
        locationHints: [cleanCity, cleanState].filter(Boolean),
      },
    );
    const selectedCandidate = await findFirstValidWebsiteCandidate(
      candidates,
      async (candidate) =>
        await ctx.runAction(api.actions.discovery.validateWebsite, {
          universityId: args.universityId,
          website: candidate.link,
          universityName: args.universityName,
        }),
    );
    if (selectedCandidate) {
      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        website: selectedCandidate.link,
        website_status: (selectedCandidate.score >= 2
          ? "discovered"
          : "discovered_weak") as
          | "discovered"
          | "pending"
          | "valid"
          | "invalid"
          | undefined,
      });
      console.log(
        `[Discovery] ${args.universityName} → ${selectedCandidate.link} (rankScore=${selectedCandidate.score})`,
      );
      return selectedCandidate.link;
    }

    // If no valid link found
    await ctx.runMutation(internal.universities.updateInternal, {
      id: args.universityId,
      website_status: "invalid",
    });
    return null;
  },
});
