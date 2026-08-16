"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  findFirstValidWebsiteCandidate,
  hasEducationTld,
  looksLikeOwnedDomain,
  rankWebsiteCandidates,
} from "../lib/discoveryCandidates";
import { assertPublicTarget } from "../lib/urlSafetyNode";
import { withRetry } from "../lib/utils";
import { createSerperBudget, runWithSerperBudget } from "../lib/serperBudget";

interface SerperResult {
  organic?: Array<{ link: string; title?: string; snippet?: string }>;
}

async function serperSearch(
  query: string,
  apiKey: string,
  num = 5,
): Promise<SerperResult> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) throw new Error(`Serper search failed: ${res.status}`);
  return (await res.json()) as SerperResult;
}

function organicLinksToCandidates(result: SerperResult): string[] {
  return (result.organic || [])
    .map((r) => r.link)
    .filter((link): link is string => typeof link === "string" && link.startsWith("http"));
}

function guessOfficialWebsiteCandidates(
  universityName: string,
  state?: string,
): string[] {
  const tokens = universityName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  // Slug forms: full concatenation, leading acronym, and short brand forms.
  const fullSlug = tokens.join("");
  const acronym = tokens
    .filter((word) => !["of", "and"].includes(word))
    .map((word) => word[0])
    .join("");

  // Common Indian university brand patterns, e.g. "Ahmedabad University" -> ahduni
  const shortBrands: string[] = [];
  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    shortBrands.push(`${first.slice(0, 3)}${last}`, `${first.slice(0, 4)}${last}`);
    if (last === "university") {
      shortBrands.push(`${first.slice(0, 3)}uni`, `${first.slice(0, 4)}uni`);
      shortBrands.push(`${first.slice(0, 3)}univ`, `${first.slice(0, 4)}univ`);
    }
    if (last === "institute") {
      shortBrands.push(`${first.slice(0, 3)}inst`, `${first.slice(0, 4)}inst`);
    }
  }

  const stateSlug = (state || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const guessed = new Set<string>();

  const slugs = [fullSlug, acronym, ...shortBrands].filter(
    (s): s is string => typeof s === "string" && s.length >= 3,
  );

  for (const slug of slugs) {
    if (!slug || slug.length < 3) continue;
    for (const tld of ["ac.in", "edu.in", "edu", "gov.in"]) {
      guessed.add(`https://${slug}.${tld}`);
    }
    if (stateSlug) {
      guessed.add(`https://${slug}.${stateSlug}.gov.in`);
    }
  }

  return Array.from(guessed);
}

export const validateWebsite = internalAction({
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

    // Clean up common dataset typos: multiple URLs, duplicate schemes,
    // missing TLD letters, and trailing punctuation/whitespace.
    url = url.split(/[,;\s]+/)[0].trim();
    url = url.replace(/^(?:https?:\/\/){2,}/i, "https://");
    url = url.replace(/^http:\/\/https:\/\//i, "https://");
    url = url.replace(/\.edu\.i(?:\/|$|\s)/i, ".edu.in$1");
    url = url.replace(/\.+$/, "");
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

    // ── SSRF guard ──────────────────────────────────────────────────────────
    // Reject non-http(s) schemes, credentials, private/loopback IP literals,
    // localhost, and hostnames that resolve to non-public addresses (DNS
    // rebinding defense) BEFORE any server-side request is made.
    try {
      await assertPublicTarget(url);
    } catch (e) {
      console.warn(`[Discovery] Rejected unsafe website URL ${url}:`, e);
      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        website_status: "invalid",
      });
      return false;
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

    // Accept any stored/education domain that is reachable. Education TLDs
    // (.ac.in, .edu.in, .edu, .ac) are strong evidence the domain is institutional,
    // even when the heuristic cannot match the university name to a short brand.
    function domainOrEducationTldMatches(targetUrl: string): boolean {
      if (domainMatchesUniversity(targetUrl)) return true;
      try {
        const hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
        return hasEducationTld(hostname);
      } catch {
        return false;
      }
    }

    function contentMatchesUniversity(
      text: string,
      targetUrl: string,
    ): boolean {
      if (!universityName) return true;
      try {
        const hostname = new URL(targetUrl).hostname.replace(/^www\./, "");
        if (hasEducationTld(hostname)) return true;
      } catch {
        // ignore
      }
      const lowerText = text.toLowerCase();
      const tokens = universityName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(
          (w) =>
            w.length >= 4 &&
            !["university", "college", "institute", "technology"].includes(w),
        );
      const matched = tokens.filter((w) => lowerText.includes(w)).length;
      return matched >= 2 || (tokens.length === 1 && matched === 1);
    }

    function isReachableStatus(status: number): boolean {
      // Server is responsive and not a 404: includes 200-299, common blocks
      // (401/403/405), rate limits (429), and temporary failures (503).
      return status < 500 && status !== 404;
    }

    async function tryFetch(
      targetUrl: string,
      method: "HEAD" | "GET",
    ): Promise<boolean> {
      try {
        const response = await fetch(targetUrl, {
          method,
          signal: AbortSignal.timeout(8000),
        });
        if (
          isReachableStatus(response.status) ||
          response.status === 503 ||
          response.status === 504
        ) {
          if (!domainOrEducationTldMatches(targetUrl)) {
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
      } catch {
        // network error — will fall through
      }
      return false;
    }

    async function tryJinaFallback(targetUrl: string): Promise<boolean> {
      try {
        const response = await fetch(`https://r.jina.ai/${encodeURIComponent(targetUrl)}`, {
          headers: { Accept: "text/plain" },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) return false;
        const text = await response.text();
        if (text.trim().length >= 100) {
          if (
            !domainOrEducationTldMatches(targetUrl) &&
            !contentMatchesUniversity(text, targetUrl)
          ) {
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

    // Bypass: Indian government/NIC domains (.gov.in / .nic.in) are frequently
    // IP-range blocked from cloud environments but are authoritative. Accept them
    // if they look like an official university portal.
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (hostname.endsWith(".gov.in") || hostname.endsWith(".nic.in")) {
        if (!domainMatchesUniversity(url)) {
          console.warn(
            `[Discovery] Rejected gov/NIC domain ${url} — domain does not match ${universityName}.`,
          );
        } else {
          await ctx.runMutation(internal.universities.updateInternal, {
            id: args.universityId,
            website: url,
            website_status: "discovered",
          });
          console.warn(
            `[Discovery] Accepted ${url} as gov/NIC domain without live validation (cloud env blocked).`,
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

export const discoverWebsite = internalAction({
  args: { universityId: v.id("universities"), universityName: v.string() },
  handler: async (ctx, args) => {
    // Fetch university details to include state and city in the ranking
    const university = await ctx.runQuery(internal.universities.getInternal, {
      universityId: args.universityId,
    });
    const state = university?.state || "";
    const city = university?.city || "";
    // Clean up state/city if they are placeholders or unknown
    const cleanState = state && !/unknown|test/i.test(state) ? state : "";
    const cleanCity = city && !/unknown|test/i.test(city) ? city : "";

    // Build candidates from local heuristics only — no Serper, no Gemini.
    const candidates = rankWebsiteCandidates(
      guessOfficialWebsiteCandidates(args.universityName, cleanState),
      args.universityName,
      {
        locationHints: [cleanCity, cleanState].filter(Boolean),
      },
    );

    console.log(
      `[Discovery] No-Serper discovery for ${args.universityName}: ${candidates.length} heuristic candidates`,
    );

    let selectedCandidate = await findFirstValidWebsiteCandidate(
      candidates,
      async (candidate) =>
        await ctx.runAction(internal.actions.discovery.validateWebsite, {
          universityId: args.universityId,
          website: candidate.link,
          universityName: args.universityName,
        }),
    );

    // Fallback: use Serper search when local heuristics come up empty.
    if (!selectedCandidate) {
      const rawSerperKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
      const serperKey = rawSerperKey ? rawSerperKey.trim() : null;
      if (serperKey) {
        const budget = createSerperBudget({ maxQueries: 2 });
        const query = `${args.universityName} official website`;
        const searchResult = await runWithSerperBudget(budget, () =>
          withRetry(() => serperSearch(query, serperKey, 8), { maxRetries: 1 }),
        );
        if (searchResult.ok && searchResult.value) {
          const serperCandidates = rankWebsiteCandidates(
            organicLinksToCandidates(searchResult.value),
            args.universityName,
            { locationHints: [cleanCity, cleanState].filter(Boolean) },
          );
          console.log(
            `[Discovery] Serper fallback for ${args.universityName}: ${serperCandidates.length} candidates`,
          );
          selectedCandidate = await findFirstValidWebsiteCandidate(
            serperCandidates,
            async (candidate) =>
              await ctx.runAction(internal.actions.discovery.validateWebsite, {
                universityId: args.universityId,
                website: candidate.link,
                universityName: args.universityName,
              }),
          );
        }
      }
    }

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

    // No heuristic or Serper candidate was reachable
    await ctx.runMutation(internal.universities.updateInternal, {
      id: args.universityId,
      website_status: "invalid",
    });
    return null;
  },
});
