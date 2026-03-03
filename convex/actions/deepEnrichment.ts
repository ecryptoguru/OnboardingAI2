import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { callGemini, embed } from "../lib/llm";
import { DEEP_ENRICHMENT_SYNTHESIS_PROMPT } from "../lib/prompts";
import * as Sentry from "@sentry/nextjs";

export const runDeepEnrichment = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    try {
      // 1. Fetch university
      const uni = await ctx.runQuery(internal.universities.getInternal, { id: args.universityId });
      if (!uni) throw new Error("University not found");

      // 2. Fetch basic signals to provide context
      const existingSignals = await ctx.runQuery(internal.signals.getInternal, { universityId: args.universityId });
      const context = existingSignals.map(s => s.content).join("\n").slice(0, 10000);

      // 3. User prompt
      const userPrompt = `Perform a deep dive research on ${uni.name} (${uni.url || ''}).
Identify and extract:
1. Total student enrollment, with male/female and day scholar/hostelite splits.
2. Key stakeholders and their contact details, specifically looking for:
   - Placement Officer (crucial)
   - Training & Placement Cell members
   - Provost, Director, Registrar, or specific Deans related to students.
   - Any Fretbox Outreach opportunities.
Context on this university so far:
${context}
Use Google Search grounding where absolutely necessary to fetch specific, up to date numbers and emails. Return only pure JSON matching the schema. Do not return markdown formatted code blocks, just raw json. Ensure the website_urls array is fully fleshed out with any link you searched or read.`;

      // 4. Synthesize data with Gemini
      let resultText;
      let groundingData;
      let synthesizedJson;

      console.log(`[DeepEnrichment] Requesting Gemini for ${uni.name}`);
      try {
        const { text, groundingMetadata } = await callGemini({
          userPrompt,
          systemPrompt: DEEP_ENRICHMENT_SYNTHESIS_PROMPT,
          mode: "fast",
          responseAsJson: false,
          enableGrounding: true
        });
        
        resultText = text;
        groundingData = groundingMetadata;
        
        // Manual JSON cleaning since JSON mode restricts grounding chunks in some packages
        let cleanText = resultText.trim();
        if (cleanText.startsWith("```json")) {
          cleanText = cleanText.substring(7);
          if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);
        } else if (cleanText.startsWith("```")) {
          cleanText = cleanText.substring(3);
          if (cleanText.endsWith("```")) cleanText = cleanText.slice(0, -3);
        }
        
        try {
            synthesizedJson = JSON.parse(cleanText);
            console.log("[DeepEnrichment] Successfully parsed synthesized text");
        } catch (je) {
            console.error("[DeepEnrichment] Error Parsing Fallback! using raw text:", resultText);
            throw new Error("JSON parse failure on output: " + resultText.slice(0, 50));
        }
        
      } catch (e) {
        console.error(`[DeepEnrichment] Failed natively:`, e);
        // Do not crash fully! Push a dummy signal so the UI tells the user it failed due to Load limits
        await ctx.runMutation(internal.signals.batchInsertInternal, {
            signals: [{
                university_id: args.universityId,
                signal_type: "source",
                content: "Deep Enrichment Error. Natively failed. (Likely overloaded API limit or JSON Parsing dropped output)",
                source_url: "",
                embedding: await embed("Deep Enrichment Failed error message.")
            }]
        });
        await ctx.runMutation(internal.universities.updateInternal, {
            id: args.universityId,
            updates: { deepEnriched: true }
        });
        return;
      }

      // 5. Update University Demographics and Stakeholders
      const updates: any = {};
      if (synthesizedJson.demographics) updates.demographics = synthesizedJson.demographics;
      if (synthesizedJson.contacts) updates.contacts = synthesizedJson.contacts;
      updates.deepEnriched = true;
      updates.lastEnriched = Date.now();

      await ctx.runMutation(internal.universities.updateInternal, {
        id: args.universityId,
        updates,
      });

      // 6. Save extracted URLs as signals
      const extractedUrls = new Set<string>();
      if (synthesizedJson.website_urls) {
        synthesizedJson.website_urls.forEach((url: string) => extractedUrls.add(url));
      }
      
      if (groundingData && groundingData.groundingChunks) {
        groundingData.groundingChunks.forEach((chunk: any) => {
          if (chunk.web && chunk.web.uri) {
            extractedUrls.add(chunk.web.uri);
          }
        });
      }

      if (extractedUrls.size > 0) {
        console.log(`[DeepEnrichment] Extracted ${extractedUrls.size} sources.`);

        const sourceSignals = [];
        for (const link of Array.from(extractedUrls)) {
          console.log(`[DeepEnrichment] Processing source link: ${link}`);
          // Sequential embedding generation to avoid massive rapid rate limiting
          try {
            const contentStr = `Extracted Reference URL during Deep Enrichment for ${uni.name}: ${link}`;
            const embeddingArray = await embed(contentStr);
            sourceSignals.push({
              university_id: args.universityId,
              signal_type: "source" as const, // Uses the v.literal("source") schema format
              content: contentStr,
              source_url: link,
              embedding: embeddingArray,
            });
          } catch (embedError) {
             console.error("[DeepEnrichment] Error embedding link: ", link, embedError);
          }
        }
        
        if (sourceSignals.length > 0) {
          await ctx.runMutation(internal.signals.batchInsertInternal, {
            signals: sourceSignals
          });
        }
      }

      console.log(`[DeepEnrichment] Completed for ${uni.name}`);
    } catch (error) {
      console.error("[DeepEnrichmentAction] Unhandled Error:", error);
      Sentry.captureException(error);
      throw error;
    }
  },
});
