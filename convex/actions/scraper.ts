"use node";


import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { callGemini } from "../lib/llm";
import { withRetry } from "../lib/utils";
import { SCRAPER_SYSTEM_PROMPT, SCRAPER_SCHEMA } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

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

    const url = typeof university.website === "string" ? university.website : "";
    if (!url) throw new Error("Invalid website URL");

    console.log(`[Scraper] Starting scrape for ${university.university_name}: ${url}`);

    // 2. Fetch markdown content using Jina Reader
    let content = "";
    try {
      // Jina Reader converts any URL into LLM-friendly markdown
      content = await withRetry(async () => {
        const response = await fetch(`https://r.jina.ai/${url}`, {
          headers: {
            Accept: "text/event-stream, text/plain",
          },
        });

        if (!response.ok) {
          throw new Error(`Jina Reader returned status ${response.status}`);
        }
        return await response.text();
      });
    } catch (error) {
      console.error(`[Scraper] Failed to fetch via Jina Reader:`, error);
      throw new Error("Scraping failed");
    }

    if (!content || content.length < 50) {
      console.log(`[Scraper] Not enough content extracted from ${url}.`);
      return { success: false, reason: "No content" };
    }

    // Truncate to safely fit in context window (e.g. max ~200k chars is well within Gemini's 1M limit, but saves time/cost)
    if (content.length > 200000) {
      content = content.substring(0, 200000);
    }

    // 3. Extract stakeholders using Gemini 3 Flash
    console.log(`[Scraper] Pass ${content.length} chars to Gemini 3 Flash...`);
    let extracted;
    try {
      const resultText = await callGemini({
        apiKey,
        systemPrompt: SCRAPER_SYSTEM_PROMPT(TARGET_ROLES),
        userPrompt: content,
        temperature: 0.1, // extremely low temperature for deterministic extraction
        responseAsJson: true,
        responseSchema: SCRAPER_SCHEMA,
      });

      // Gemini native JSON schema guarantees a clean structured object
      extracted = JSON.parse(resultText);
    } catch (e) {
      console.error(`[Scraper] Failed to parse Gemini output:`, e);
      throw new Error("Failed to extract stakeholders from text");
    }

    const stakeholders = extracted.stakeholders || [];
    console.log(`[Scraper] Found ${stakeholders.length} stakeholders.`);

    // 4. Save to database in bulk
    const validStakeholders = stakeholders.filter((st: any) => st.name || st.email);
    if (validStakeholders.length > 0) {
      await ctx.runMutation(internal.stakeholders.bulkInsertInternal, {
        university_id: args.universityId,
        stakeholders: validStakeholders.map((st: any) => ({
          name: st.name || undefined,
          role: st.role || undefined,
          email: st.email || undefined,
          phone: st.phone || undefined,
        })),
        source: "scraper",
      });
    }

    // 5. Update university outreach stage
    await ctx.runMutation(internal.universities.updateOutreachStageInternal, {
      universityId: args.universityId,
      stage: "enriched",
    });

    } catch (e) {
      console.error("[Scraper] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { universityId: args.universityId },
      });
      return { success: false, error: String(e) };
    }
  },
});
