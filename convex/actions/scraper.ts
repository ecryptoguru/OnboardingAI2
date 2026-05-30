"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { callGemini, MODELS } from "../lib/llm";
import { withRetry, sanitizeLlmInput, truncateAtNewline, isValidEmail } from "../lib/utils";
import { SCRAPER_SYSTEM_PROMPT, SCRAPER_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

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

      // 2. Fetch markdown content using Jina Reader
      let content = "";
      const urlsToTry = [url];
      // If original is HTTP, also try HTTPS as a fallback (and vice-versa)
      if (url.startsWith("http://")) {
        urlsToTry.push(url.replace("http://", "https://"));
      } else if (url.startsWith("https://")) {
        urlsToTry.push(url.replace("https://", "http://"));
      }

      for (const tryUrl of urlsToTry) {
        try {
          content = await withRetry(async () => {
            const response = await fetch(`https://r.jina.ai/${tryUrl}`, {
              headers: {
                Accept: "text/event-stream, text/plain",
              },
              signal: AbortSignal.timeout(15000),
            });
            if (!response.ok) {
              throw new Error(`Jina Reader returned status ${response.status}`);
            }
            return await response.text();
          });
          if (content && content.length >= MIN_CONTENT_LENGTH) {
            console.log(`[Scraper] Success with ${tryUrl}`);
            break;
          }
        } catch (error) {
          console.warn(`[Scraper] Failed with ${tryUrl}:`, error instanceof Error ? error.message : String(error));
        }
      }

      if (!content || content.length < MIN_CONTENT_LENGTH) {
        console.error(`[Scraper] Failed to fetch via Jina Reader for all URL variants`);
        return { success: false, reason: "No content" };
      }

      // Truncate to safely fit in context window (newline-aware to avoid slicing data)
      if (content.length > MAX_CONTENT_CHARS) {
        content = truncateAtNewline(content, MAX_CONTENT_CHARS);
      }

      // Sanitize before sending to LLM to prevent prompt injection from compromised sites
      const safeContent = sanitizeLlmInput(content);

      // 3. Extract stakeholders using Gemini Flash-Lite (cheapest viable model for deterministic extraction)
      console.log(
        `[Scraper] Pass ${safeContent.length} chars to Gemini Flash-Lite...`,
      );
      let extracted;
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

        // Gemini native JSON schema guarantees a clean structured object
        extracted = JSON.parse(resultText);
        if (!extracted || !Array.isArray(extracted.stakeholders)) {
          throw new Error("Malformed extraction: missing stakeholders array");
        }
      } catch (e) {
        console.error(`[Scraper] Failed to parse Gemini output:`, e);
        throw new Error("Failed to extract stakeholders from text");
      }

      const stakeholders = extracted.stakeholders || [];
      console.log(`[Scraper] Found ${stakeholders.length} stakeholders.`);

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

      const validStakeholders = stakeholders.filter(
        (st: { name?: string; email?: string }) => {
          const hasName = !!st.name?.trim();
          const hasValidEmail = !!st.email && isValidEmail(st.email);
          return hasName || hasValidEmail;
        },
      );
      const netNew = validStakeholders.filter((st: { name?: string; email?: string }) => {
        const email = st.email?.toLowerCase();
        const name = st.name?.toLowerCase();
        if (email && existingEmails.has(email)) return false;
        if (name && existingNames.has(name)) return false;
        return true;
      });
      console.log(
        `[Scraper] ${netNew.length}/${validStakeholders.length} are net-new after dedup.`,
      );

      if (netNew.length > 0) {
        await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
          university_id: args.universityId,
          stakeholders: netNew.map(
            (st: {
              name?: string;
              role?: string;
              email?: string;
              phone?: string;
            }) => ({
              name: st.name || undefined,
              role: st.role || undefined,
              email: st.email || undefined,
              phone: st.phone || undefined,
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
