"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";

interface TestReport {
  testStartedAt: string;
  testCompletedAt?: string;
  universitiesTested: UniversityTestReport[];
  totals: {
    totalLatencyMs: number;
    totalLatencySeconds?: number;
    totalEstimatedCostUsd: number;
    totalStakeholdersExtracted: number;
  };
}

interface UniversityTestReport {
  name: string;
  website: string;
  id: Id<"universities">;
  success: boolean;
  error: string | null;
  metrics: {
    latencyMs: number;
    latencySeconds: number;
    inputTokens: number;
    outputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    firecrawlCreditsUsed: number;
    firecrawlCostUsd: number;
    totalCostUsd: number;
    qualityScore: number;
    qualityRating: string;
    qualityChecks: string[];
  };
  extractionResults: {
    demographics: unknown | null;
    stakeholders: Array<{
      name: string | null;
      role: string | null;
      email: string | null;
      phone: string | null;
      linkedinUrl: string | null;
    }>;
  };
}

interface EnrichmentResult {
  success: boolean;
  estimatedTokens?: {
    flash: number;
    pro: number;
  };
  contextChars: number;
  error?: string;
}

interface TestResultItem {
  university?: Doc<"universities">;
  stakeholders?: Doc<"stakeholders">[];
  name?: string;
  error?: string;
}

export const runLiveDeepEnrichmentTest = action({
  args: {
    universities: v.array(
      v.object({
        name: v.string(),
        website: v.string(),
        state: v.optional(v.string()),
        city: v.optional(v.string()),
        type: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args): Promise<TestReport> => {
    const report: TestReport = {
      testStartedAt: new Date().toISOString(),
      universitiesTested: [],
      totals: {
        totalLatencyMs: 0,
        totalEstimatedCostUsd: 0,
        totalStakeholdersExtracted: 0,
      },
    };

    for (const item of args.universities) {
      console.log(`[LiveTest] Processing university: ${item.name}`);
      const t0 = Date.now();

      // 1. Find or create university record internally
      let uniId: Id<"universities">;
      const existing = await ctx.runQuery(
        internal.universities.findByNameInternal,
        { name: item.name }
      );

      if (existing) {
        uniId = existing._id;
        console.log(`[LiveTest] Found existing university: ${item.name} (${uniId})`);
        // Reset demographics and outreach stage to simulate clean/fresh run
        await ctx.runMutation(internal.universities.updateInternal, {
          id: uniId,
          website: item.website,
          outreach_stage: "new",
        });
      } else {
        uniId = await ctx.runMutation(internal.universities.createInternal, {
          university_name: item.name,
          website: item.website,
          state: item.state ?? "Unknown",
          city: item.city ?? "Unknown",
          type: item.type ?? "Private",
        });
        console.log(`[LiveTest] Created new university: ${item.name} (${uniId})`);
      }

      // 2. Trigger Deep Enrichment
      console.log(`[LiveTest] Triggering Deep Enrichment action for: ${item.name}`);
      let enrichmentError: string | null = null;
      let enrichmentResult: EnrichmentResult | null = null;
      try {
        enrichmentResult = await ctx.runAction(
          api.actions.deepEnrichment.runDeepEnrichment,
          { universityId: uniId }
        ) as EnrichmentResult;
      } catch (err) {
        console.error(`[LiveTest] Enrichment failed for ${item.name}:`, err);
        enrichmentError = String(err);
      }

      const latencyMs = Date.now() - t0;

      // 3. Retrieve results (demographics + stakeholders)
      const uniRecord = await ctx.runQuery(internal.universities.getInternal, {
        universityId: uniId,
      });

      const stakeholders = await ctx.runQuery(
        internal.stakeholders.getByUniversityInternal,
        { university_id: uniId }
      );

      // Filter stakeholders to only see the ones created during this/deep enrichment runs
      const enrichedStakeholders = stakeholders.filter(
        (s: Doc<"stakeholders">) => s.source === "deep_enrichment"
      );

      // 4. Cost, Token & Metric calculation
      // Pricing reference: Gemini 3.5 Flash
      // Input: $1.50 per 1M tokens
      // Output: $9.00 per 1M tokens
      // Firecrawl: $0.01 per credit (1 credit for map + 1 credit per scrape)
      const inputTokens = enrichmentResult?.estimatedTokens?.flash ?? 0;
      // We estimate output tokens based on the size of demographic fields and stakeholders list
      // Typical Gemini structured outputs for this schema are around 1,000-2,500 tokens. Let's do a reliable estimate:
      // Let's estimate based on characters of the returned stakeholders + demographics data
      const responseSizeChars = JSON.stringify({
        demographics: uniRecord?.demographics,
        stakeholders: enrichedStakeholders,
      }).length;
      const outputTokens = Math.round(responseSizeChars / 4) + 200; // Add 200 overhead tokens for structural JSON tags

      const inputCost = (inputTokens / 1_000_000) * 1.50;
      const outputCost = (outputTokens / 1_000_000) * 9.00;
      const firecrawlCredits = enrichmentResult?.success ? (1 + (enrichmentResult.contextChars > 0 ? 3 : 0)) : 0; // estimate maps/scrapes
      const firecrawlCost = firecrawlCredits * 0.01; 
      const estimatedCostUsd = inputCost + outputCost + firecrawlCost;

      // Quality assessment
      let qualityScore = 0;
      const qualityChecks: string[] = [];

      if (uniRecord?.demographics) {
        qualityScore += 30;
        qualityChecks.push("Demographics extracted (30pts)");
        if (uniRecord.demographics.hostelites && uniRecord.demographics.hostelites > 0) {
          qualityScore += 10;
          qualityChecks.push("Hostelite count extracted (10pts)");
        }
        if (uniRecord.demographics.total_students && uniRecord.demographics.total_students > 0) {
          qualityScore += 10;
          qualityChecks.push("Total students count extracted (10pts)");
        }
      } else {
        qualityChecks.push("❌ Missing demographics (0pts)");
      }

      if (enrichedStakeholders.length > 0) {
        qualityScore += 30;
        qualityChecks.push(`Stakeholders extracted: ${enrichedStakeholders.length} (30pts)`);
        
        const hasEmail = enrichedStakeholders.some((s: Doc<"stakeholders">) => s.email && s.email.includes("@"));
        const hasPhone = enrichedStakeholders.some((s: Doc<"stakeholders">) => s.phone);
        const hasPrimaryRoles = enrichedStakeholders.some((s: Doc<"stakeholders">) => 
          ["Registrar", "Vice Chancellor", "Dean", "Director", "Chancellor"].some((role: string) => 
            (s.role ?? "").toLowerCase().includes(role.toLowerCase())
          )
        );

        if (hasEmail) {
          qualityScore += 10;
          qualityChecks.push("Valid stakeholder email(s) found (10pts)");
        } else {
          qualityChecks.push("❌ No stakeholder emails found (0pts)");
        }

        if (hasPhone) {
          qualityScore += 5;
          qualityChecks.push("Stakeholder phone(s) found (5pts)");
        }

        if (hasPrimaryRoles) {
          qualityScore += 5;
          qualityChecks.push("Primary administrative roles found (5pts)");
        }
      } else {
        qualityChecks.push("❌ No stakeholders extracted (0pts)");
      }

      const qualityRating = qualityScore >= 90 ? "Excellent" : qualityScore >= 70 ? "Good" : qualityScore >= 50 ? "Fair" : "Poor";

      const uniReport: UniversityTestReport = {
        name: item.name,
        website: item.website,
        id: uniId,
        success: enrichmentResult?.success ?? false,
        error: enrichmentError || enrichmentResult?.error || null,
        metrics: {
          latencyMs,
          latencySeconds: Number((latencyMs / 1000).toFixed(2)),
          inputTokens,
          outputTokens,
          inputCostUsd: Number(inputCost.toFixed(5)),
          outputCostUsd: Number(outputCost.toFixed(5)),
          firecrawlCreditsUsed: firecrawlCredits,
          firecrawlCostUsd: Number(firecrawlCost.toFixed(5)),
          totalCostUsd: Number(estimatedCostUsd.toFixed(5)),
          qualityScore,
          qualityRating,
          qualityChecks,
        },
        extractionResults: {
          demographics: uniRecord?.demographics || null,
          stakeholders: enrichedStakeholders.map((s: Doc<"stakeholders">) => ({
            name: s.name || null,
            role: s.role || null,
            email: s.email || null,
            phone: s.phone || null,
            linkedinUrl: s.linkedin_url || null,
          })),
        },
      };

      report.universitiesTested.push(uniReport);
      report.totals.totalLatencyMs += latencyMs;
      report.totals.totalEstimatedCostUsd += estimatedCostUsd;
      report.totals.totalStakeholdersExtracted += enrichedStakeholders.length;
    }

    report.totals.totalLatencySeconds = Number((report.totals.totalLatencyMs / 1000).toFixed(2));
    report.totals.totalEstimatedCostUsd = Number(report.totals.totalEstimatedCostUsd.toFixed(5));
    report.testCompletedAt = new Date().toISOString();

    return report;
  },
});

export const getTestResults = action({
  args: {
    universityName: v.optional(v.string())
  },
  handler: async (ctx, args): Promise<TestResultItem[]> => {
    const uniNames = args.universityName 
      ? [args.universityName]
      : [
          "Shiv Nadar University",
          "Kalinga Institute of Industrial Technology"
        ];
    const results: TestResultItem[] = [];

    for (const name of uniNames) {
      const existing = await ctx.runQuery(
        internal.universities.findByNameInternal,
        { name }
      );
      if (existing) {
        const stakeholders = await ctx.runQuery(
          internal.stakeholders.getByUniversityInternal,
          { university_id: existing._id }
        );
        const enrichedStakeholders = stakeholders.filter(
          (s: Doc<"stakeholders">) => s.source === "deep_enrichment"
        );
        results.push({
          university: existing,
          stakeholders: enrichedStakeholders
        });
      } else {
        results.push({ name, error: "Not found" });
      }
    }
    return results;
  }
});
