"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { callGemini, MODELS } from "../lib/llm";
import { withRetry, sanitizeLlmInput, truncateAtNewline, isValidEmail, isValidIndianPhone } from "../lib/utils";
import { SCRAPER_SYSTEM_PROMPT, SCRAPER_SCHEMA } from "../lib/prompts";
import { extractContactsFromMarkdown } from "../lib/scrapers";
import * as Sentry from "@sentry/node";

// ─── Constants ─────────────────────────────────────────────────────────────
const MAX_CONTENT_CHARS = 200000; // Truncate to fit within Gemini's 1M token limit efficiently
const MIN_CONTENT_LENGTH = 50; // Minimum content length to be worth processing

const TARGET_ROLES = [
  "Owner",
  "President",
  "Chairman",
  "Chancellor",
  "Vice Chancellor",
  "Registrar",
  "Dy Registrar",
  "Dean Student Welfare",
  "Dean Student Affairs",
  "Director Administration",
  "Chief Warden",
  "Director",
  "Principal",
];

export const scrapeUniversity = action({
  args: {
    universityId: v.id("universities"),
  },
  handler: async (ctx, args) => {
    try {
      // 1. Fetch university
      const university = await ctx.runQuery(internal.universities.getInternal, {
        universityId: args.universityId,
      });

      // Fetch dynamic API key
      const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);

      if (!university) throw new Error("University not found");
      if (!university.website) throw new Error("University has no website");

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
      for (const tryUrl of baseUrls) {
        try {
          const text = await withRetry(async () => {
            const response = await fetch(`https://r.jina.ai/${tryUrl}`, {
              headers: { Accept: "text/plain" },
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) throw new Error(`Jina Reader status ${response.status}`);
            return await response.text();
          });
          if (text && text.length >= MIN_CONTENT_LENGTH) {
            homepageContent = text;
            workingBase = tryUrl.replace(/\/$/, "");
            console.log(`[Scraper] Homepage success: ${tryUrl}`);
            break;
          }
        } catch (error) {
          console.warn(`[Scraper] Homepage failed: ${tryUrl}:`, error instanceof Error ? error.message : String(error));
        }
      }

      if (!homepageContent || homepageContent.length < MIN_CONTENT_LENGTH) {
        console.error(`[Scraper] Failed to fetch homepage via Jina Reader`);
        return { success: false, reason: "No content" };
      }

      // Scrape high-yield subpages for richer stakeholder data
      const subpages = [
        "/contact", "/contact-us", "/reach-us", "/enquiry", "/support",
        "/administration", "/admin", "/governance", "/leadership", "/management",
        "/about", "/about-us", "/profile", "/overview",
        "/team", "/directory", "/people", "/faculty", "/staff",
        "/anti-ragging", "/anti-ragging-committee", "/antiragging",
        "/mandatory-disclosure", "/mandatory_disclosure", "/iqac", "/naac", "/naac-ssr",
        "/vc", "/vice-chancellor", "/registrar", "/dean", "/principal",
      ];
      const subpageContents: string[] = [];

      for (const path of subpages) {
        try {
          const subUrl = `${workingBase}${path}`;
          const text = await withRetry(async () => {
            const response = await fetch(`https://r.jina.ai/${subUrl}`, {
              headers: { Accept: "text/plain" },
              signal: AbortSignal.timeout(12000),
            });
            if (!response.ok) return "";
            return await response.text();
          });
          if (text && text.length >= MIN_CONTENT_LENGTH) {
            subpageContents.push(`\n=== PAGE: ${path} ===\n${text}`);
          }
        } catch {
          // Ignore subpage failures
        }
      }

      let content = homepageContent;
      if (subpageContents.length > 0) {
        content += "\n\n" + subpageContents.join("\n\n");
        console.log(`[Scraper] Combined ${subpageContents.length} subpages with homepage (${content.length} chars).`);
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
      let stakeholders: Array<{ name?: string | null; role?: string | null; email?: string | null; phone?: string | null; email_source?: string; phone_source?: string }> = [];

      try {
        const startMs = Date.now();
        const resultText = await callGemini({
          apiKey,
          model: MODELS.geminiFlash,
          systemPrompt: SCRAPER_SYSTEM_PROMPT(TARGET_ROLES),
          userPrompt: safeContent,
          temperature: 0.1,
          responseAsJson: true,
          responseSchema: SCRAPER_SCHEMA,
        });
        console.log(`[Scraper] Gemini latency: ${Date.now() - startMs}ms`);

        extracted = JSON.parse(resultText);
        if (!extracted || !Array.isArray(extracted.stakeholders)) {
          throw new Error("Malformed extraction: missing stakeholders array");
        }
        stakeholders = extracted.stakeholders || [];
        console.log(`[Scraper] Found ${stakeholders.length} stakeholders.`);
      } catch (e) {
        console.error(`[Scraper] Primary extraction failed:`, e instanceof Error ? e.message : String(e));
        // Don't throw — try fallback below
      }

      // ─── Fallback: if Gemini found 0 stakeholders, try a simpler name-only prompt
      if (stakeholders.length === 0) {
        try {
          console.log(`[Scraper] Fallback: running name-only extraction...`);
          const fallbackResult = await callGemini({
            apiKey,
            model: MODELS.geminiFlash,
            systemPrompt:
              "Extract ONLY names and roles of university officials from the text. Ignore contact info. Output JSON: {stakeholders: [{name: string, role: string}]}. Use the person's full name with title.",
            userPrompt: safeContent.substring(0, 100000),
            temperature: 0.1,
            responseAsJson: true,
          });
          const fallbackParsed = JSON.parse(fallbackResult);
          if (Array.isArray(fallbackParsed.stakeholders) && fallbackParsed.stakeholders.length > 0) {
            stakeholders = fallbackParsed.stakeholders.map(
              (st: { name?: string; role?: string }) => ({
                name: st.name || null,
                role: st.role || null,
                email: null,
                phone: null,
              }),
            );
            console.log(`[Scraper] Fallback found ${stakeholders.length} stakeholders.`);
          }
        } catch (e) {
          console.warn(`[Scraper] Fallback extraction failed:`, e instanceof Error ? e.message : String(e));
        }
      }

      // ─── Regex augmentation: extract emails+phones and try to attach to stakeholders
      const { emails: regexEmails, phones: regexPhones } = extractContactsFromMarkdown(content);
      const domain = workingBase.replace(/^https?:\/\//, "");

      // Role-based email inference patterns
      const ROLE_EMAIL_PATTERNS: Record<string, string[]> = {
        "Vice Chancellor": ["vc", "vicechancellor", "vice-chancellor"],
        "Registrar": ["registrar", "reg", "controller"],
        "Dean": ["dean", "dean-academic"],
        "Principal": ["principal", "director"],
        "Chief Warden": ["warden", "hostel", "hostel-warden"],
        "Director": ["director", "director-admin"],
        "Finance Officer": ["finance", "accounts", "cfo"],
        "Librarian": ["library", "librarian"],
        "Placement Officer": ["placement", "tpo", "training"],
      };

      if (stakeholders.length > 0) {
        for (const st of stakeholders) {
          // Try regex email match by name
          if (!st.email && regexEmails.length > 0) {
            const nameLower = (st.name || "").toLowerCase().replace(/[.\s]/g, "");
            const matched = regexEmails.find((e) => {
              const local = e.split("@")[0].toLowerCase();
              return nameLower.length > 3 && local.includes(nameLower.substring(0, 4));
            });
            if (matched) {
              st.email = matched;
              st.email_source = "regex";
            }
          }
          // Role-based email inference
          if (!st.email && st.role && domain) {
            const roleLower = st.role.toLowerCase();
            for (const [roleKey, patterns] of Object.entries(ROLE_EMAIL_PATTERNS)) {
              if (roleLower.includes(roleKey.toLowerCase())) {
                for (const pattern of patterns) {
                  const inferredEmail = `${pattern}@${domain}`;
                  if (isValidEmail(inferredEmail)) {
                    st.email = inferredEmail;
                    st.email_source = "inferred";
                    break;
                  }
                }
                if (st.email) break;
              }
            }
          }
          // Attach phone from regex
          if (!st.phone && regexPhones.length > 0) {
            st.phone = regexPhones[0];
            st.phone_source = "regex";
          }
        }
      }

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

      // QUALITY GATE: Stakeholder MUST have a valid email OR valid Indian phone
      // Name-only entries are rejected per user requirement
      const validStakeholders = (stakeholders as Array<{ name?: string | null; role?: string | null; email?: string | null; phone?: string | null; email_source?: string; phone_source?: string }>).filter(
        (st) => {
          const hasValidEmail = !!st.email && isValidEmail(st.email);
          const hasValidPhone = !!st.phone && isValidIndianPhone(st.phone);
          return hasValidEmail || hasValidPhone;
        },
      );
      console.log(`[Scraper] Quality gate: ${validStakeholders.length}/${stakeholders.length} stakeholders have email or phone.`);

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
          stakeholders: netNew.map(
            (st) => ({
              name: st.name || undefined,
              role: st.role || undefined,
              email: st.email || undefined,
              phone: st.phone || undefined,
              email_source: st.email_source,
              phone_source: st.phone_source,
            }),
          ),
          source: "scraper",
        });
      }

      // 5. Update university outreach stage
      await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
        universityId: args.universityId,
        stage: "enriched",
      });

      return { success: true };
    } catch (e) {
      console.error("[Scraper] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
