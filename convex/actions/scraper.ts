"use node";

import { internalAction, ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  callGeminiWithGroundingAndUsage,
  callGeminiWithUsage,
  LlmUsageEntry,
  LlmUsageSummary,
  MODELS,
  summarizeLlmUsage,
  TEMP,
} from "../lib/llm";
import {
  withRetry,
  sanitizeLlmInput,
  truncateAtNewline,
  isValidEmail,
  isValidIndianPhone,
} from "../lib/utils";
import { isDecisionMakerRole } from "../lib/stakeholderQuality";
import {
  createSerperBudget,
  runWithSerperBudget,
} from "../lib/serperBudget";
import {
  inferPreferredRoleEmail,
  inferRoleFromContactContext,
  inferRoleFromInstitutionEmail,
  isRelevantInstitutionEmailDomain,
  isSingletonRole,
  normalizeInstitutionDomain,
} from "../lib/contactInference";
import {
  isSuspiciousWebsite,
} from "../lib/discoveryCandidates";
import { SCRAPER_SYSTEM_PROMPT, SCRAPER_SCHEMA } from "../lib/prompts";
import {
  extractContactsFromMarkdown,
  extractContactsWithContext,
  matchPhonesToStakeholders,
} from "../lib/scrapers";
import * as Sentry from "@sentry/node";

interface SerperResult {
  organic?: Array<{ link: string; title?: string; snippet?: string }>;
}

// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_CONTENT_CHARS = 200000; // Truncate to fit within Gemini's 1M token limit efficiently
const MIN_CONTENT_LENGTH = 50; // Minimum content length to be worth processing
const GENERIC_PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "rediffmail.com",
  "icloud.com",
  "live.com",
  "me.com",
]);

const TARGET_ROLES = [
  "Chancellor",
  "Vice Chancellor",
  "Pro Vice Chancellor",
  "Registrar",
  "Dy Registrar",
  "Dean",
  "Dean Student Welfare",
  "Dean Student Affairs",
  "Director Administration",
  "Chief Warden",
  "Controller of Examinations",
  "Deputy Controller of Examinations",
  "Finance Officer",
  "Chief Finance Officer",
  "Librarian",
  "Director",
  "Principal",
  "Rector",
  "Secretary",
  "Treasurer",
];

function isConcatenatedOrOverlongRole(role?: string | null): boolean {
  if (!role) return true;
  if (role.length > 80) return true;
  const segments = role.split(/[\/;,&|]+/).filter((s) => s.trim().length > 0);
  return segments.length > 2;
}

async function fetchJinaText(targetUrl: string, timeoutMs = 20000) {
  const response = await fetch(`https://r.jina.ai/${encodeURIComponent(targetUrl)}`, {
    headers: {
      Accept: "text/plain",
      "X-Remove-Selector":
        "nav, header, footer, .menu, .navbar, #menu, .main-navigation, .site-nav, .topbar, .sidebar, aside, .widget, .footer-content, .site-header, .masthead, .main-menu",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Jina Reader status ${response.status}`);
  }
  return await response.text();
}

async function serperSearch(query: string, apiKey: string, num = 5) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Serper search failed: ${response.status} ${response.statusText} — ${body}`,
    );
  }
  return (await response.json()) as SerperResult;
}

/**
 * For .gov.in domains that are unreachable from cloud environments, synthesise
 * contact-rich content from Serper search-result snippets.  This avoids the
 * scraper returning empty-handed when Jina Reader times out.
 */
async function fetchGovInContentViaSearch(
  universityName: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 4 }),
): Promise<string> {
  const queries = [
    `"${universityName}" registrar contact email`,
    `"${universityName}" vice chancellor contact`,
    `"${universityName}" administration directory`,
    `"${universityName}" contact phone email`,
  ];

  const blocks: string[] = [];
  for (const q of queries) {
    if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) break;
    try {
      const searchResult = await runWithSerperBudget(serperBudget, () =>
        withRetry(() => serperSearch(q, serperKey, 5), {
          maxRetries: 1,
        }),
      );
      if (!searchResult.ok) {
        if (searchResult.quotaExhausted) break;
        continue;
      }
      const result = searchResult.value!;
      for (const row of result.organic || []) {
        if (!row.snippet) continue;
        const text = `${row.title || ""}\n${row.snippet}\n${row.link || ""}`;
        blocks.push(text);
      }
    } catch (err) {
      console.warn(
        `[Scraper] Serper snippet search failed for "${q}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const combined = blocks.join("\n\n");
  // Deduplicate roughly by splitting on newlines and keeping unique lines
  const lines = combined.split("\n");
  const seen = new Set<string>();
  const unique = lines.filter((line) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join("\n");
}

/**
 * Last-resort fallback: use Gemini Grounding (Google Search) to find
 * administration contacts for universities whose sites are unreachable
 * from cloud environments (e.g., .gov.in domains).
 * Only called when Jina Reader AND Serper snippet fallbacks both fail.
 */
async function fetchViaGeminiGrounding(
  universityName: string,
  apiKey: string,
  ctx: ActionCtx,
): Promise<{ text: string; usage?: LlmUsageEntry }> {
  const prompt =
    `Find the official administration page of ${universityName} in India. ` +
    `Extract every official email address, phone number, and the name/role ` +
    `of each administrator listed (Vice Chancellor, Registrar, Dean, Finance Officer, etc.). ` +
    `Return the results as plain text with one contact per line: ` +
    `Name - Role - Email - Phone.`;

  const result = await callGeminiWithGroundingAndUsage({
    apiKey,
    systemPrompt:
      "You are a research assistant. Use Google Search to find official university administration contacts. Return only factual data found on official university websites.",
    userPrompt: prompt,
    temperature: TEMP.deterministic,
    model: MODELS.geminiFlash,
    label: "scraper_grounding_fallback",
    ctx,
    skipCache: true,
  });

  if (result.text && result.text.length >= MIN_CONTENT_LENGTH) {
    console.log(
      `[Scraper] Gemini Grounding yielded ${result.text.length} chars for ${universityName}`,
    );
    return { text: result.text, usage: result.usage };
  }
  return { text: "", usage: result.usage };
}

async function discoverOfficialAdminPages(
  universityName: string,
  domain: string,
  serperKey: string,
  serperBudget = createSerperBudget({ maxQueries: 2 }),
): Promise<string[]> {
  const queries = [
    `${universityName} site:${domain} registrar`,
    `${universityName} site:${domain} vice chancellor`,
    `${universityName} site:${domain} administration`,
    `${universityName} site:${domain} contact directory`,
    `${universityName} site:${domain} dean student welfare`,
  ];

  const scored = new Map<string, number>();
  for (const query of queries) {
    if (serperBudget.exhausted || serperBudget.used >= serperBudget.max) break;
    try {
      const searchResult = await runWithSerperBudget(serperBudget, () =>
        withRetry(() => serperSearch(query, serperKey, 5), {
          maxRetries: 1,
        }),
      );
      if (!searchResult.ok) {
        if (searchResult.quotaExhausted) break;
        continue;
      }
      const result = searchResult.value!;
      for (const row of result.organic || []) {
        if (!row.link || !row.link.includes(domain)) continue;
        const haystack =
          `${row.link} ${row.title || ""} ${row.snippet || ""}`.toLowerCase();
        let score = 0;
        if (/\b(registrar|vice.?chancellor|administration|directory|contact)\b/i.test(haystack)) {
          score += 4;
        }
        if (/\b(dean|warden|controller|principal|director)\b/i.test(haystack)) {
          score += 2;
        }
        if (/site\/page|administration|contact|directory|vc|registrar/i.test(haystack)) {
          score += 1;
        }
        if (score > 0) {
          scored.set(row.link, Math.max(scored.get(row.link) || 0, score));
        }
      }
    } catch (error) {
      console.warn(
        `[Scraper] Official admin search failed for "${query}":`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([link]) => link);
}

export const scrapeUniversity = internalAction({
  args: {
    universityId: v.id("universities"),
    maxSerperQueries: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    reason?: string;
    error?: string;
    serperQueriesUsed?: number;
    llmUsage?: LlmUsageSummary;
  }> => {
    try {
      const llmUsageEntries: LlmUsageEntry[] = [];
      // 1. Fetch university
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);
      const rawSerperKey = await ctx.runQuery(internal.settings.getInternalSerperKey);
      const serperKey = rawSerperKey ? rawSerperKey.trim() : null;
      const serperBudget = createSerperBudget({
        maxQueries: args.maxSerperQueries ?? 6,
      });
      const allowSerper = !!serperKey && !serperBudget.exhausted;

      if (!university) throw new Error("University not found");
      if (!university.website) throw new Error("University has no website");

      // Rescue: if the stored website is a known hosted portal / aggregator,
      // wipe it and trigger rediscovery so the next orchestrator cycle can
      // find a real domain.
      if (isSuspiciousWebsite(university.website)) {
        console.warn(
          `[Scraper] Stored website ${university.website} is a suspicious hosted portal. Wiping and requesting rediscovery for ${university.university_name}.`,
        );
        await ctx.runMutation(internal.universities.updateInternal, {
          id: args.universityId,
          website: "",
          website_status: "invalid",
        });
        throw new Error(
          `Website ${university.website} is a suspicious hosted portal — rediscovery required`,
        );
      }

      const url =
        typeof university.website === "string" ? university.website : "";
      if (!url) throw new Error("Invalid website URL");

      console.log(
        `[Scraper] Starting scrape for ${university.university_name}: ${url}`,
      );

      // 2. Fetch markdown content from MULTIPLE pages using Jina Reader
      // Homepages rarely list all stakeholders — we need contact, admin, about, anti-ragging pages.
      const baseUrls = [url];
      if (url.startsWith("http://")) {
        baseUrls.push(url.replace("http://", "https://"));
      } else if (url.startsWith("https://")) {
        baseUrls.push(url.replace("https://", "http://"));
      }

      // Determine working base URL
      let workingBase = url;
      let homepageContent = "";

      // .gov.in domains are frequently IP-blocked from cloud environments.
      // Skip the slow Jina timeouts and go straight to Serper snippet synthesis.
      const isGovIn = url.includes(".gov.in");

      if (!isGovIn) {
        for (const tryUrl of baseUrls) {
          try {
            const text = await withRetry(async () => {
              return await fetchJinaText(tryUrl, 15000);
            });
            if (text && text.length >= MIN_CONTENT_LENGTH) {
              homepageContent = text;
              workingBase = tryUrl.replace(/\/$/, "");
              console.log(`[Scraper] Homepage success: ${tryUrl}`);
              break;
            }
          } catch (error) {
            console.warn(
              `[Scraper] Homepage failed: ${tryUrl}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
      }

      if (!homepageContent || homepageContent.length < MIN_CONTENT_LENGTH) {
        console.error(`[Scraper] Failed to fetch homepage via Jina Reader`);
        // Fallback for .gov.in domains that are IP-blocked from cloud environments:
        // use Serper search snippets to synthesise contact content.
        if (allowSerper && isGovIn) {
          console.log(
            `[Scraper] Attempting Serper snippet fallback for ${university.university_name}`,
          );
          const synthetic = await fetchGovInContentViaSearch(
            university.university_name,
            serperKey,
            serperBudget,
          );
          if (synthetic && synthetic.length >= MIN_CONTENT_LENGTH) {
            homepageContent = synthetic;
            workingBase = url.replace(/\/$/, "");
            console.log(
              `[Scraper] Serper fallback yielded ${synthetic.length} chars for ${university.university_name}`,
            );
          }
        }
        if (!homepageContent || homepageContent.length < MIN_CONTENT_LENGTH) {
          // Last resort: Gemini Grounding search for blocked/unreachable domains
          if (apiKey && isGovIn) {
            console.log(
              `[Scraper] Attempting Gemini Grounding fallback for ${university.university_name}`,
            );
            const groundingResult = await fetchViaGeminiGrounding(
              university.university_name,
              apiKey,
              ctx,
            );
            if (groundingResult.usage) {
              llmUsageEntries.push(groundingResult.usage);
            }
            if (
              groundingResult.text &&
              groundingResult.text.length >= MIN_CONTENT_LENGTH
            ) {
              homepageContent = groundingResult.text;
              workingBase = url.replace(/\/$/, "");
            }
          }
        }

        if (!homepageContent || homepageContent.length < MIN_CONTENT_LENGTH) {
          // .gov.in domains are authoritative but IP-blocked from cloud envs.
          // Don't fail the orchestrator — let other enrichment paths try.
          if (isGovIn) {
            console.warn(
              `[Scraper] ${university.university_name} (.gov.in) unreachable from cloud env. Returning empty but not failing.`,
            );
            return {
              success: true,
              reason: "gov.in_blocked",
              llmUsage: summarizeLlmUsage(llmUsageEntries),
            };
          }
          return {
            success: false,
            reason: "No content",
            llmUsage: summarizeLlmUsage(llmUsageEntries),
          };
        }
      }

      // Scrape high-yield subpages for richer stakeholder data
      const subpages = [
        "/contact",
        "/contact-us",
        "/reach-us",
        "/enquiry",
        "/support",
        "/administration",
        "/admin",
        "/governance",
        "/leadership",
        "/management",
        "/about",
        "/about-us",
        "/profile",
        "/overview",
        "/team",
        "/directory",
        "/people",
        "/faculty",
        "/staff",
        "/anti-ragging",
        "/anti-ragging-committee",
        "/antiragging",
        "/mandatory-disclosure",
        "/mandatory_disclosure",
        "/iqac",
        "/naac",
        "/naac-ssr",
        "/vc",
        "/vice-chancellor",
        "/registrar",
        "/dean",
        "/principal",
      ];
      const subpageContents: string[] = [];

      // Skip Jina subpage scraping for .gov.in domains — every request times out.
      // Rely on the search-discovered admin-page harvest instead.
      if (!isGovIn) {
        for (const path of subpages) {
          try {
            const subUrl = `${workingBase}${path}`;
            const text = await withRetry(async () => {
              try {
                return await fetchJinaText(subUrl, 12000);
              } catch {
                return "";
              }
            });
            if (text && text.length >= MIN_CONTENT_LENGTH) {
              subpageContents.push(`\n=== PAGE: ${path} ===\n${text}`);
            }
          } catch {
            // Ignore subpage failures
          }
        }
      }

      let content = homepageContent;
      if (subpageContents.length > 0) {
        content += "\n\n" + subpageContents.join("\n\n");
        console.log(
          `[Scraper] Combined ${subpageContents.length} subpages with homepage (${content.length} chars).`,
        );
      }

      const domain = normalizeInstitutionDomain(workingBase);
      const initialContacts = extractContactsFromMarkdown(content);
      // For .gov.in domains we already synthesised content from Serper snippets;
      // skip the extra Jina-based admin-page harvest to avoid timeouts.
      const shouldHarvestSearchPages =
        allowSerper &&
        !!domain &&
        !isGovIn &&
        (subpageContents.length <= 1 ||
          initialContacts.emails.length + initialContacts.phones.length < 3);
      if (shouldHarvestSearchPages) {
        const discoveredAdminPages = await discoverOfficialAdminPages(
          university.university_name,
          domain,
          serperKey!,
          serperBudget,
        );
        const extraBlocks: string[] = [];
        for (const pageUrl of discoveredAdminPages) {
          try {
            const text = await withRetry(() => fetchJinaText(pageUrl, 12000), {
              maxRetries: 1,
            });
            if (text && text.length >= MIN_CONTENT_LENGTH) {
              extraBlocks.push(`\n=== SEARCH PAGE: ${pageUrl} ===\n${text}`);
            }
          } catch {
            // Ignore per-page failures.
          }
        }
        if (extraBlocks.length > 0) {
          content += "\n\n" + extraBlocks.join("\n\n");
          console.log(
            `[Scraper] Added ${extraBlocks.length} search-discovered admin pages (${content.length} chars).`,
          );
        }
      }

      // Truncate to safely fit in context window
      if (content.length > MAX_CONTENT_CHARS) {
        content = truncateAtNewline(content, MAX_CONTENT_CHARS);
      }

      // Sanitize before sending to LLM
      const safeContent = sanitizeLlmInput(content);

      // 3. Extract stakeholders using Gemini Flash-Lite (cheapest viable model for deterministic extraction)
      console.log(
        `[Scraper] Pass ${safeContent.length} chars to Gemini Flash-Lite...`,
      );
      let extracted;
      let stakeholders: Array<{
        name?: string | null;
        role?: string | null;
        email?: string | null;
        phone?: string | null;
        email_source?: string;
        phone_source?: string;
      }> = [];

      try {
        const startMs = Date.now();
        const result = await callGeminiWithUsage({
          apiKey,
          model: MODELS.geminiFlash,
          systemPrompt: SCRAPER_SYSTEM_PROMPT(TARGET_ROLES),
          userPrompt: safeContent,
          temperature: TEMP.deterministic,
          responseAsJson: true,
          responseSchema: SCRAPER_SCHEMA,
          label: "scraper_primary_extraction",
          ctx,
          skipCache: true,
        });
        llmUsageEntries.push(result.usage);
        console.log(`[Scraper] Gemini latency: ${Date.now() - startMs}ms`);

        extracted = JSON.parse(result.text);
        if (!extracted || !Array.isArray(extracted.stakeholders)) {
          throw new Error("Malformed extraction: missing stakeholders array");
        }
        stakeholders = extracted.stakeholders || [];
        console.log(`[Scraper] Found ${stakeholders.length} stakeholders.`);
      } catch (e) {
        console.error(
          `[Scraper] Primary extraction failed:`,
          e instanceof Error ? e.message : String(e),
        );
        // Don't throw — try fallback below
      }

      // ─── Fallback: if Gemini found 0 stakeholders, try a simpler name-only prompt
      if (stakeholders.length === 0) {
        try {
          console.log(`[Scraper] Fallback: running name-only extraction...`);
          const fallbackResult = await callGeminiWithUsage({
            apiKey,
            model: MODELS.geminiFlash,
            systemPrompt:
              "Extract ONLY names and roles of university officials from the text. Ignore contact info. Output JSON: {stakeholders: [{name: string, role: string}]}. Use the person's full name with title.",
            userPrompt: safeContent.substring(0, 100000),
            temperature: TEMP.deterministic,
            responseAsJson: true,
            label: "scraper_name_only_fallback",
            ctx,
            skipCache: true,
          });
          llmUsageEntries.push(fallbackResult.usage);
          const fallbackParsed = JSON.parse(fallbackResult.text);
          if (
            Array.isArray(fallbackParsed.stakeholders) &&
            fallbackParsed.stakeholders.length > 0
          ) {
            stakeholders = fallbackParsed.stakeholders.map(
              (st: { name?: string; role?: string }) => ({
                name: st.name || undefined,
                role: st.role || undefined,
                email: undefined,
                phone: undefined,
              }),
            );
            console.log(
              `[Scraper] Fallback found ${stakeholders.length} stakeholders.`,
            );
          }
        } catch (e) {
          console.warn(
            `[Scraper] Fallback extraction failed:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }

      // ─── Regex augmentation: extract emails+phones and try to attach to stakeholders
      const { emails: regexEmails } =
        extractContactsFromMarkdown(content);
      const contactsWithContext = extractContactsWithContext(content);

      const regexRoleFallbackStakeholders = regexEmails
        .flatMap((email) => {
          const emailDomain = email.split("@")[1]?.toLowerCase() || "";
          const domainRelevant =
            GENERIC_PERSONAL_DOMAINS.has(emailDomain) ||
            isRelevantInstitutionEmailDomain(email, domain);
          if (!domainRelevant) {
            console.warn(
              `[Scraper] Rejecting cross-university email ${email} for ${university.university_name}`,
            );
            return [];
          }

          const matchingContext = contactsWithContext.emails.find(
            (entry) => entry.value.toLowerCase() === email.toLowerCase(),
          );
          const role =
            inferRoleFromInstitutionEmail(email, domain) ||
            inferRoleFromContactContext(matchingContext?.context);
          if (!role) return [];
          return [
            {
              name: undefined,
              role,
              email,
              phone: undefined,
              email_source: "regex",
              phone_source: undefined,
            },
          ];
        })
        .filter(
          (candidate, index, arr) =>
            arr.findIndex(
              (entry) =>
                entry.email?.toLowerCase() === candidate.email?.toLowerCase() ||
                entry.role?.toLowerCase() === candidate.role?.toLowerCase(),
            ) === index,
        );
      const regexPhoneFallbackStakeholders = contactsWithContext.phones
        .flatMap(({ value, context }) => {
          const role = inferRoleFromContactContext(context);
          if (!role || !isSingletonRole(role)) return [];
          return [
            {
              name: undefined,
              role,
              email: undefined,
              phone: value,
              email_source: undefined,
              phone_source: "regex",
            },
          ];
        })
        .filter(
          (candidate, index, arr) =>
            arr.findIndex(
              (entry) =>
                entry.phone === candidate.phone ||
                entry.role?.toLowerCase() === candidate.role?.toLowerCase(),
            ) === index,
        );
      if (regexRoleFallbackStakeholders.length > 0) {
        stakeholders.push(...regexRoleFallbackStakeholders);
      }
      if (regexPhoneFallbackStakeholders.length > 0) {
        stakeholders.push(...regexPhoneFallbackStakeholders);
      }

      // Context-based phone→stakeholder association
      const phoneMatches = matchPhonesToStakeholders(
        contactsWithContext.phones,
        stakeholders,
      );

      if (stakeholders.length > 0) {
        for (const st of stakeholders) {
          // Try regex email match by name
          if (!st.email && regexEmails.length > 0) {
            const nameLower = (st.name || "")
              .toLowerCase()
              .replace(/[.\s]/g, "");
            const matched = regexEmails.find((e) => {
              const local = e.split("@")[0].toLowerCase();
              return (
                nameLower.length > 3 &&
                local.includes(nameLower.substring(0, 4))
              );
            });
            if (matched) {
              st.email = matched;
              st.email_source = "regex";
            }
          }
          // Role-based email inference
          if (!st.email && st.role && domain && isSingletonRole(st.role)) {
            const inferredEmail = inferPreferredRoleEmail(st.role, domain);
            if (inferredEmail && isValidEmail(inferredEmail)) {
              st.email = inferredEmail;
              st.email_source = "inferred";
            }
          }
          // Context-based phone assignment (name + role proximity)
          if (!st.phone) {
            const matchedPhone = Array.from(phoneMatches.entries()).find(
              ([, name]) => name.toLowerCase() === (st.name || "").toLowerCase(),
            );
            if (matchedPhone) {
              st.phone = matchedPhone[0];
              st.phone_source = "regex";
            }
          }
        }
      }

      // ─── Cross-domain email guard ──────────────────────────────────────────
      // Reject any stakeholder (LLM or regex) whose email domain doesn't match
      // the university. Prevents stale contacts from old domains (e.g., bub.ernet.in
      // for Bangalore University) from polluting the database.
      stakeholders = stakeholders.filter((st) => {
        if (!st.email) return true;
        const emailDomain = st.email.split("@")[1]?.toLowerCase() || "";
        const domainRelevant =
          GENERIC_PERSONAL_DOMAINS.has(emailDomain) ||
          isRelevantInstitutionEmailDomain(st.email, domain);
        if (!domainRelevant) {
          console.warn(
            `[Scraper] Rejecting cross-domain stakeholder ${st.email} for ${university.university_name}`,
          );
        }
        return domainRelevant;
      });

      // 4. Deduplicate against existing stakeholders before inserting
      const existing = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        { university_id: args.universityId },
      );
      const existingEmails = new Set(
        existing
          .map((e: { email?: string }) => e.email?.toLowerCase())
          .filter(Boolean),
      );
      const existingNames = new Set(
        existing
          .map((e: { name?: string }) => e.name?.toLowerCase())
          .filter(Boolean),
      );

      // Preserve named officials even when sites hide direct contacts.
      // Reject historical/non-current roles even if they still carry old contact
      // details in archived pages — they pollute current outreach lists.
      const HISTORICAL_ROLE_PATTERNS =
        /\b(former|ex-|past|retired|late|historical|emeritus|previous|incumbent)\b|^(founder|chairman emeritus|president emeritus|chancellor emeritus|vice chancellor emeritus)$/i;
      const validStakeholders = (
        stakeholders as Array<{
          name?: string | null;
          role?: string | null;
          email?: string | null;
          phone?: string | null;
          email_source?: string;
          phone_source?: string;
        }>
      ).filter((st) => {
        const hasValidEmail = !!st.email && isValidEmail(st.email);
        const hasValidPhone = !!st.phone && isValidIndianPhone(st.phone);
        const hasValidName = !!st.name?.trim() && st.name.trim().length > 3;
        const hasValidRole = !!st.role?.trim();
        const decisionRole = isDecisionMakerRole(st.role ?? undefined);
        const role = st.role || "";
        const isHistoricalRole = HISTORICAL_ROLE_PATTERNS.test(role);
        if (isHistoricalRole) {
          console.warn(
            `[Scraper] Rejecting historical stakeholder: ${st.name} (${st.role})`,
          );
          return false;
        }
        if (isConcatenatedOrOverlongRole(st.role)) {
          console.warn(
            `[Scraper] Rejecting concatenated/overlong role: ${st.role}`,
          );
          return false;
        }
        // Keep contacts only when they have a real name with a decision-maker role,
        // or a verified contact. A named person with a real, senior role is always
        // retained even without email/phone.
        return (
          hasValidEmail ||
          hasValidPhone ||
          (hasValidName && hasValidRole && decisionRole)
        );
      });
      console.log(
        `[Scraper] Quality gate: ${validStakeholders.length}/${stakeholders.length} stakeholders retained after validating contact/name-role coverage.`,
      );

      // Intra-batch dedup: track emails/names seen within this batch
      const batchEmails = new Set<string>();
      const batchNames = new Set<string>();
      const netNew = validStakeholders.filter((st) => {
        const email = st.email?.toLowerCase();
        const name = st.name?.toLowerCase();
        if (email && existingEmails.has(email)) return false;
        if (name && existingNames.has(name)) return false;
        // Also dedup within the current batch
        if (email && batchEmails.has(email)) return false;
        if (name && batchNames.has(name)) return false;
        if (email) batchEmails.add(email);
        if (name) batchNames.add(name);
        return true;
      });
      console.log(
        `[Scraper] ${netNew.length}/${validStakeholders.length} are net-new after dedup.`,
      );

      if (netNew.length > 0) {
        await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
          university_id: args.universityId,
          stakeholders: netNew.map((st) => ({
            name: st.name || undefined,
            role: st.role || undefined,
            email: st.email || undefined,
            phone: st.phone || undefined,
            email_source: st.email_source,
            phone_source: st.phone_source,
            source_url: (st as { source_url?: string }).source_url,
          })),
          source: "scraper",
        });
      }

      // 5. Update university outreach stage
      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: args.universityId,
        stage: "enriched",
      });

      return {
        success: true,
        serperQueriesUsed: serperBudget.used,
        llmUsage: summarizeLlmUsage(llmUsageEntries),
      };
    } catch (e) {
      console.error("[Scraper] Fatal error:", e);
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
