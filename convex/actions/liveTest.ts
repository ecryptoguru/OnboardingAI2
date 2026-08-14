"use node";

import { internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id, Doc } from "../_generated/dataModel";
import { callGeminiWithUsage, type LlmUsageSummary } from "../lib/llm";
import { MODELS, TEMP } from "../lib/models";
import { STAKEHOLDERS_SCHEMA } from "../lib/prompts";
import {
  downloadPdfBuffer,
  extractPdfTables,
  extractPdfText,
} from "../lib/scrapers";

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
  llmUsage?: LlmUsageSummary;
  error?: string;
}

interface TestResultItem {
  university?: Doc<"universities">;
  stakeholders?: Doc<"stakeholders">[];
  name?: string;
  error?: string;
}

type StakeholderDoc = Doc<"stakeholders">;
type SignalDoc = Doc<"universitySignals">;
type UniversityDoc = Doc<"universities">;

interface CleanedStakeholderRow {
  id: Id<"stakeholders">;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source: string | null;
}

interface RecoveryReport {
  found: boolean;
  universityName: string;
  universityId?: Id<"universities">;
  website?: string | null;
  rerun: {
    scraper: boolean;
    governmentData: boolean;
    deepEnrichment: boolean;
    socialEnrichment: boolean;
  };
  demographics: Doc<"universities">["demographics"] | null;
  stakeholders: CleanedStakeholderRow[];
  removedStakeholders: number;
  signalSummary: {
    news: number;
    image: number;
    linkedin: number;
  };
  outreachTable: string;
}

interface PriorityTableReport {
  found: boolean;
  universityName: string;
  universityId?: Id<"universities">;
  website?: string | null;
  demographics: Doc<"universities">["demographics"] | null;
  selected: CleanedStakeholderRow[];
  removedStakeholders: number;
  outreachTable: string;
}

interface StakeholderRepairReport {
  found: boolean;
  universityName: string;
  repaired: boolean;
  stakeholderSummary: {
    total: number;
    named: number;
    withEmail: number;
    withPhone: number;
    withLinkedin: number;
  } | null;
  topStakeholders: Array<{
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source: string | null;
  }>;
}

interface FourUniversitySummaryRow {
  university: string;
  success: boolean;
  rerun?: RecoveryReport["rerun"];
  demographics: {
    total_students?: number;
    total_students_male?: number;
    total_students_female?: number;
    hostelites?: number;
    day_scholars?: number;
    source?: string;
  } | null;
  stakeholderCount: number;
  namedStakeholders: number;
  withPhone: number;
  withLinkedin: number;
  error?: string;
}

interface DirectVerificationReport {
  universityName: string;
  universityId: Id<"universities">;
  created: boolean;
  steps: {
    discovery: boolean;
    orchestrator: boolean;
  };
  orchestrator_status: "completed" | "timed_out" | "failed";
  orchestrator_error?: string | null;
  llmUsage?: LlmUsageSummary | null;
  website: {
    value: string | null;
    status: string | null;
  };
  demographics: Doc<"universities">["demographics"] | null;
  stakeholders: Array<{
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source: string | null;
  }>;
  stakeholderSummary: {
    total: number;
    named: number;
    withEmail: number;
    withPhone: number;
    withLinkedin: number;
    decisionLikeRoles: number;
  };
  signals: {
    news: number;
    image: number;
    linkedin: number;
    total: number;
  };
  score: {
    deterministic_score: number;
    ai_score: number | null;
    final_score: number;
    lead_tier: string | null;
    outreach_stage: string | null;
    scoring_factors: {
      hostelite_score?: number;
      student_scale_score?: number;
      naac_score?: number;
      agility_score?: number;
      stakeholder_score?: number;
      digital_signals_score?: number;
      hostelites_inferred?: boolean;
    } | null;
  } | null;
}

const ROLE_NORMALIZERS: Array<{ role: string; match: RegExp }> = [
  { role: "Owner", match: /\bowner\b/i },
  { role: "President", match: /\bpresident\b/i },
  { role: "Chairman", match: /\bchair(man|person)?\b/i },
  {
    role: "Pro Vice Chancellor",
    match: /\bpro[\s-]*vice[\s-]*chancellor\b|\bprovc\b/i,
  },
  { role: "Vice Chancellor", match: /\bvice[\s-]*chancellor\b|\bvc\b/i },
  { role: "Chancellor", match: /\bchancellor\b/i },
  { role: "Registrar", match: /\bregistrar\b/i },
  { role: "Dy Registrar", match: /\b(dy|deputy)\s*registrar\b/i },
  {
    role: "Dean Student Welfare",
    match: /\bdean\b.*\bstudent\b.*\bwelfare\b|\bdsw\b/i,
  },
  {
    role: "Dean Student Affairs",
    match: /\bdean\b.*\bstudent\b.*\baffairs\b|\bdsa\b/i,
  },
  {
    role: "Director Administration",
    match: /\bdirector\b.*\badministration\b|\bdirector[-_ ]admin\b/i,
  },
  { role: "Chief Warden", match: /\bchief\s*warden\b|\bwarden\b/i },
  { role: "Controller of Examinations", match: /\bcontroller\b.*\bexam/i },
  { role: "Finance Officer", match: /\bfinance\b|\baccounts?\b|\bcfo\b/i },
  { role: "Librarian", match: /\blibrarian\b|\blibrary\b/i },
  { role: "Placement Officer", match: /\bplacement\b|\btpo\b/i },
  {
    role: "Public Relations Officer",
    match: /\bpublic\s*relations?\b|\bpro\b/i,
  },
];

function canonicalRole(role?: string | null): string | null {
  if (!role) return null;
  const clean = role.trim().replace(/[–—]/g, "-");
  if (!clean) return null;
  for (const item of ROLE_NORMALIZERS) {
    if (item.match.test(clean)) return item.role;
  }
  return null;
}

function stakeholderRank(st: StakeholderDoc): number {
  let score = 0;
  if (st.name && st.name.trim()) score += 5;
  if (st.email) score += 4;
  if (st.phone) score += 3;
  if (st.linkedin_url) score += 2;
  if (st.source === "deep_enrichment") score += 2;
  if (st.source === "inferred") score += 1;
  return score;
}

function isNamedStakeholder(st: StakeholderDoc): boolean {
  return !!st.name && st.name.trim().length > 2;
}

function toIntSafe(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const val = Number.parseInt(cleaned, 10);
  if (!Number.isFinite(val)) return null;
  return val;
}

function extractLargestNumber(line: string): number | null {
  const nums = (line.match(/\b\d{3,7}\b/g) || [])
    .map((n) => toIntSafe(n))
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

function strictParseDemographicsFromText(text: string): {
  total_students_male?: number;
  total_students_female?: number;
  hostelites?: number;
  day_scholars?: number;
} {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let male: number | undefined;
  let female: number | undefined;
  let hostel: number | undefined;
  let day: number | undefined;

  for (const line of lines) {
    const low = line.toLowerCase();
    if (!hostel && /hostel(ite|er)s?/.test(low)) {
      const v = extractLargestNumber(line);
      if (v && v > 500 && v < 300000) hostel = v;
    }
    if (!day && /day[\s-]*scholar(s)?|non[\s-]*resident/.test(low)) {
      const v = extractLargestNumber(line);
      if (v && v > 500 && v < 300000) day = v;
    }

    // Captures patterns like "Male: 21000 Female: 19000"
    if (!male || !female) {
      const pairMatch = line.match(
        /male[^0-9]{0,20}([\d,]{3,8})[^a-zA-Z0-9]{0,30}female[^0-9]{0,20}([\d,]{3,8})/i,
      );
      if (pairMatch) {
        const m = toIntSafe(pairMatch[1]);
        const f = toIntSafe(pairMatch[2]);
        if (m && f && m > 500 && f > 500 && m < 300000 && f < 300000) {
          male = male ?? m;
          female = female ?? f;
        }
      }
    }
  }

  const out: {
    total_students_male?: number;
    total_students_female?: number;
    hostelites?: number;
    day_scholars?: number;
  } = {};
  if (male) out.total_students_male = male;
  if (female) out.total_students_female = female;
  if (hostel) out.hostelites = hostel;
  if (day) out.day_scholars = day;
  return out;
}

async function serperSearchUrls(
  query: string,
  serperKey: string,
): Promise<string[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 5 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    organic?: Array<{ link?: string }>;
  };
  return (data.organic || [])
    .map((o) => o.link)
    .filter((u): u is string => !!u && /^https?:\/\//.test(u));
}

async function runTargetedVitDataFetch(
  ctx: ActionCtx,
  uni: UniversityDoc,
): Promise<void> {
  const isVit =
    uni.university_name
      .toLowerCase()
      .includes("vellore institute of technology") ||
    (uni.website || "").toLowerCase().includes("vit.ac.in");
  if (!isVit) return;

  const rawSerper = (await ctx.runQuery(
    internal.settings.getInternalSerperKey,
    {},
  )) as string | null;
  const serperKey = rawSerper?.trim();
  if (!serperKey) return;

  const queries = [
    "Vellore Institute of Technology NIRF student strength hostellers day scholars",
    "VIT Vellore NAAC SSR hostelites day scholars",
    "VIT Vellore AISHE male female enrollment",
  ];

  const sourceUrls = new Set<string>();
  for (const q of queries) {
    const urls = await serperSearchUrls(q, serperKey);
    for (const u of urls) sourceUrls.add(u);
  }

  const strict: {
    total_students_male?: number;
    total_students_female?: number;
    hostelites?: number;
    day_scholars?: number;
  } = {};
  for (const url of Array.from(sourceUrls).slice(0, 6)) {
    try {
      const res = await fetch(`https://r.jina.ai/${encodeURIComponent(url)}`, {
        headers: { Accept: "text/plain" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.length < 200) continue;
      const parsed = strictParseDemographicsFromText(text);
      strict.total_students_male =
        strict.total_students_male ?? parsed.total_students_male;
      strict.total_students_female =
        strict.total_students_female ?? parsed.total_students_female;
      strict.hostelites = strict.hostelites ?? parsed.hostelites;
      strict.day_scholars = strict.day_scholars ?? parsed.day_scholars;
    } catch {
      // Ignore single source failure
    }
  }

  const hasAny =
    typeof strict.total_students_male === "number" ||
    typeof strict.total_students_female === "number" ||
    typeof strict.hostelites === "number" ||
    typeof strict.day_scholars === "number";
  if (!hasAny) return;

  await ctx.runMutation(internal.universities.updateDemographicsInternal, {
    universityId: uni._id,
    demographics: {
      ...strict,
      source: "targeted_vit_parser",
      data_quality: "partial",
    },
  });
}

export const runLiveDeepEnrichmentTest = internalAction({
  args: {
    universities: v.array(
      v.object({
        name: v.string(),
        website: v.string(),
        state: v.optional(v.string()),
        city: v.optional(v.string()),
        type: v.optional(v.string()),
      }),
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
        { name: item.name },
      );

      if (existing) {
        uniId = existing._id;
        console.log(
          `[LiveTest] Found existing university: ${item.name} (${uniId})`,
        );
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
        console.log(
          `[LiveTest] Created new university: ${item.name} (${uniId})`,
        );
      }

      // 2. Trigger Deep Enrichment
      console.log(
        `[LiveTest] Triggering Deep Enrichment action for: ${item.name}`,
      );
      let enrichmentError: string | null = null;
      let enrichmentResult: EnrichmentResult | null = null;
      try {
        enrichmentResult = (await ctx.runAction(
          internal.actions.deepEnrichment.runDeepEnrichment,
          { universityId: uniId },
        )) as EnrichmentResult;
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
        { university_id: uniId },
      );

      // Filter stakeholders to only see the ones created during this/deep enrichment runs
      const enrichedStakeholders = stakeholders.filter(
        (s: Doc<"stakeholders">) => s.source === "deep_enrichment",
      );

      // 4. Cost, Token & Metric calculation
      // LLM cost uses exact per-call token usage captured by the enrichment action.
      // Firecrawl remains an operational estimate: $0.01 per credit (1 map + 1 scrape each).
      const inputTokens = enrichmentResult?.llmUsage?.inputTokens ?? 0;
      const outputTokens = enrichmentResult?.llmUsage?.outputTokens ?? 0;
      const inputCost = enrichmentResult?.llmUsage?.inputCostUsd ?? 0;
      const outputCost = enrichmentResult?.llmUsage?.outputCostUsd ?? 0;
      const firecrawlCredits = enrichmentResult?.success
        ? 1 + (enrichmentResult.contextChars > 0 ? 3 : 0)
        : 0; // estimate maps/scrapes
      const firecrawlCost = firecrawlCredits * 0.01;
      const estimatedCostUsd = inputCost + outputCost + firecrawlCost;

      // Quality assessment
      let qualityScore = 0;
      const qualityChecks: string[] = [];

      if (uniRecord?.demographics) {
        qualityScore += 30;
        qualityChecks.push("Demographics extracted (30pts)");
        if (
          uniRecord.demographics.hostelites &&
          uniRecord.demographics.hostelites > 0
        ) {
          qualityScore += 10;
          qualityChecks.push("Hostelite count extracted (10pts)");
        }
        if (
          uniRecord.demographics.total_students &&
          uniRecord.demographics.total_students > 0
        ) {
          qualityScore += 10;
          qualityChecks.push("Total students count extracted (10pts)");
        }
      } else {
        qualityChecks.push("❌ Missing demographics (0pts)");
      }

      if (enrichedStakeholders.length > 0) {
        qualityScore += 30;
        qualityChecks.push(
          `Stakeholders extracted: ${enrichedStakeholders.length} (30pts)`,
        );

        const hasEmail = enrichedStakeholders.some(
          (s: Doc<"stakeholders">) => s.email && s.email.includes("@"),
        );
        const hasPhone = enrichedStakeholders.some(
          (s: Doc<"stakeholders">) => s.phone,
        );
        const hasPrimaryRoles = enrichedStakeholders.some(
          (s: Doc<"stakeholders">) =>
            [
              "Registrar",
              "Vice Chancellor",
              "Dean",
              "Director",
              "Chancellor",
            ].some((role: string) =>
              (s.role ?? "").toLowerCase().includes(role.toLowerCase()),
            ),
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

      const qualityRating =
        qualityScore >= 90
          ? "Excellent"
          : qualityScore >= 70
            ? "Good"
            : qualityScore >= 50
              ? "Fair"
              : "Poor";

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

    report.totals.totalLatencySeconds = Number(
      (report.totals.totalLatencyMs / 1000).toFixed(2),
    );
    report.totals.totalEstimatedCostUsd = Number(
      report.totals.totalEstimatedCostUsd.toFixed(5),
    );
    report.testCompletedAt = new Date().toISOString();

    return report;
  },
});

export const getTestResults = internalAction({
  args: {
    universityName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<TestResultItem[]> => {
    const uniNames = args.universityName
      ? [args.universityName]
      : ["Shiv Nadar University", "Kalinga Institute of Industrial Technology"];
    const results: TestResultItem[] = [];

    for (const name of uniNames) {
      const existing = await ctx.runQuery(
        internal.universities.findByNameInternal,
        { name },
      );
      if (existing) {
        const stakeholders = await ctx.runQuery(
          internal.stakeholders.getByUniversityInternal,
          { university_id: existing._id },
        );
        const enrichedStakeholders = stakeholders.filter(
          (s: Doc<"stakeholders">) => s.source === "deep_enrichment",
        );
        results.push({
          university: existing,
          stakeholders: enrichedStakeholders,
        });
      } else {
        results.push({ name, error: "Not found" });
      }
    }
    return results;
  },
});

interface UniversitySnapshotResult {
  found: boolean;
  universityName?: string;
  university?: {
    _id: Id<"universities">;
    name: string;
    website: string | undefined;
    ugc_status: string | undefined;
    stage: string | undefined;
    updated_at: number;
    demographics: unknown | null;
  };
  stakeholders?: Array<{
    name: string | null;
    role: string | null;
    email: string | null;
    phone: string | null;
    linkedin_url: string | null;
    source: string | null;
  }>;
  signals?: {
    counts: {
      news: number;
      image: number;
      linkedin: number;
      total: number;
    };
    latest: {
      news: Array<{
        content: string;
        source_url: string | null;
        created_at: number | null;
      }>;
      image: Array<{
        content: string;
        source_url: string | null;
        created_at: number | null;
      }>;
      linkedin: Array<{
        content: string;
        source_url: string | null;
        created_at: number | null;
      }>;
    };
  };
}

export const getUniversitySnapshot = internalAction({
  args: { universityName: v.string() },
  handler: async (ctx, args): Promise<UniversitySnapshotResult> => {
    const uni: Doc<"universities"> | null = await ctx.runQuery(
      internal.universities.findByNameInternal,
      {
        name: args.universityName,
      },
    );
    if (!uni) {
      return { found: false, universityName: args.universityName };
    }

    const stakeholders: Doc<"stakeholders">[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );
    const signals: Doc<"universitySignals">[] = await ctx.runQuery(
      internal.signals.listByUniversityInternal,
      {
        university_id: uni._id,
      },
    );

    const sortedSignals: Doc<"universitySignals">[] = [...signals].sort(
      (a: Doc<"universitySignals">, b: Doc<"universitySignals">) =>
        (b.created_at ?? 0) - (a.created_at ?? 0),
    );
    const byType = {
      news: sortedSignals
        .filter((s: Doc<"universitySignals">) => s.signal_type === "news")
        .slice(0, 5),
      image: sortedSignals
        .filter((s: Doc<"universitySignals">) => s.signal_type === "image")
        .slice(0, 5),
      linkedin: sortedSignals
        .filter((s: Doc<"universitySignals">) => s.signal_type === "linkedin")
        .slice(0, 5),
    };

    return {
      found: true,
      university: {
        _id: uni._id,
        name: uni.university_name,
        website: uni.website,
        ugc_status: uni.ugc_status,
        stage: uni.outreach_stage,
        updated_at: uni.updated_at,
        demographics: uni.demographics ?? null,
      },
      stakeholders: stakeholders.map((s: Doc<"stakeholders">) => ({
        name: s.name ?? null,
        role: s.role ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        linkedin_url: s.linkedin_url ?? null,
        source: s.source ?? null,
      })),
      signals: {
        counts: {
          news: sortedSignals.filter(
            (s: Doc<"universitySignals">) => s.signal_type === "news",
          ).length,
          image: sortedSignals.filter(
            (s: Doc<"universitySignals">) => s.signal_type === "image",
          ).length,
          linkedin: sortedSignals.filter(
            (s: Doc<"universitySignals">) => s.signal_type === "linkedin",
          ).length,
          total: sortedSignals.length,
        },
        latest: {
          news: byType.news.map((s: Doc<"universitySignals">) => ({
            content: s.content,
            source_url: s.source_url ?? null,
            created_at: s.created_at ?? null,
          })),
          image: byType.image.map((s: Doc<"universitySignals">) => ({
            content: s.content,
            source_url: s.source_url ?? null,
            created_at: s.created_at ?? null,
          })),
          linkedin: byType.linkedin.map((s: Doc<"universitySignals">) => ({
            content: s.content,
            source_url: s.source_url ?? null,
            created_at: s.created_at ?? null,
          })),
        },
      },
    };
  },
});

export const verifyUniversityDirect = internalAction({
  args: {
    universityName: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    type: v.optional(v.string()),
    website: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<DirectVerificationReport> => {
    let uni = await ctx.runQuery(internal.universities.findByNameInternal, {
      name: args.universityName,
    });

    let created = false;
    if (!uni) {
      const universityId = await ctx.runMutation(
        internal.universities.createInternal,
        {
          university_name: args.universityName,
          state: args.state,
          city: args.city,
          website: args.website,
          type: args.type,
        },
      );
      created = true;
      uni = await ctx.runQuery(internal.universities.getInternal, {
        universityId,
      });
    }

    if (!uni) {
      throw new Error(
        `Unable to create or fetch university: ${args.universityName}`,
      );
    }

    let discoveryOk = false;
    if (!uni.website) {
      const discovered = await ctx.runAction(
        internal.actions.discovery.discoverWebsite,
        {
          universityId: uni._id,
          universityName: args.universityName,
        },
      );
      discoveryOk = typeof discovered === "string" && discovered.length > 0;
    }

    // Do not wrap Convex action calls in a timeout race here.
    // If we return before `ctx.runAction(...)` settles, Convex reports an
    // "outstanding action call" warning and the verification result can show a
    // misleading timed_out status even though enrichment continues in-flight.
    let orchestratorResult:
      | {
          status: "completed";
          value: {
            success?: boolean;
            llmUsage?: LlmUsageSummary;
          };
        }
      | { status: "failed"; error: string };
    try {
      const orchestratorValue = await ctx.runAction(
        internal.actions.orchestrator.runEnrichmentChainInternal,
        {
          universityId: uni._id,
        },
      );
      orchestratorResult = {
        status: "completed",
        value: orchestratorValue,
      };
    } catch (error) {
      orchestratorResult = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const freshUni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: uni._id,
    });
    const stakeholders = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );
    const signals = await ctx.runQuery(
      internal.signals.listByUniversityInternal,
      {
        university_id: uni._id,
      },
    );
    const score = await ctx.runQuery(internal.priorityScores.getByUniversityInternal, {
      university_id: uni._id,
    });

    const decisionLikeRoles = stakeholders.filter((stakeholder: StakeholderDoc) =>
      ROLE_NORMALIZERS.some((item) => item.match.test(stakeholder.role ?? "")),
    ).length;

    return {
      universityName: args.universityName,
      universityId: uni._id,
      created,
      steps: {
        discovery: discoveryOk,
        orchestrator:
          orchestratorResult.status === "completed" &&
          orchestratorResult.value.success === true,
      },
      orchestrator_status: orchestratorResult.status,
      orchestrator_error:
        orchestratorResult.status === "failed"
          ? orchestratorResult.error
          : null,
      llmUsage:
        orchestratorResult.status === "completed"
          ? ((orchestratorResult.value as { llmUsage?: LlmUsageSummary })
              .llmUsage ?? null)
          : null,
      website: {
        value: freshUni?.website ?? null,
        status: freshUni?.website_status ?? null,
      },
      demographics: freshUni?.demographics ?? null,
      stakeholders: stakeholders.map((stakeholder: StakeholderDoc) => ({
        name: stakeholder.name ?? null,
        role: stakeholder.role ?? null,
        email: stakeholder.email ?? null,
        phone: stakeholder.phone ?? null,
        linkedin_url: stakeholder.linkedin_url ?? null,
        source: stakeholder.source ?? null,
      })),
      stakeholderSummary: {
        total: stakeholders.length,
        named: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.name).length,
        withEmail: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.email)
          .length,
        withPhone: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.phone)
          .length,
        withLinkedin: stakeholders.filter(
          (stakeholder: StakeholderDoc) => !!stakeholder.linkedin_url,
        ).length,
        decisionLikeRoles,
      },
      signals: {
        news: signals.filter((signal: SignalDoc) => signal.signal_type === "news").length,
        image: signals.filter((signal: SignalDoc) => signal.signal_type === "image")
          .length,
        linkedin: signals.filter((signal: SignalDoc) => signal.signal_type === "linkedin")
          .length,
        total: signals.length,
      },
      score: score
        ? {
            deterministic_score: score.deterministic_score,
            ai_score: score.ai_score ?? null,
            final_score: score.final_score,
            lead_tier: freshUni?.lead_tier ?? null,
            outreach_stage: freshUni?.outreach_stage ?? null,
            scoring_factors: score.scoring_factors,
          }
        : null,
    };
  },
});

export const recoverUniversityContacts = internalAction({
  args: { universityName: v.string() },
  handler: async (ctx, args): Promise<RecoveryReport> => {
    const uni = await ctx.runQuery(internal.universities.findByNameInternal, {
      name: args.universityName,
    });
    if (!uni) {
      return {
        found: false,
        universityName: args.universityName,
        rerun: {
          scraper: false,
          governmentData: false,
          deepEnrichment: false,
          socialEnrichment: false,
        },
        demographics: null,
        stakeholders: [],
        removedStakeholders: 0,
        signalSummary: { news: 0, image: 0, linkedin: 0 },
        outreachTable: "",
      };
    }

    // 1) Hard-clean obviously noisy anti-ragging-only records before rerun.
    const beforeStakeholders: StakeholderDoc[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );
    const removableBefore = beforeStakeholders.filter((s) => {
      if (s.source !== "anti_ragging") return false;
      const role = canonicalRole(s.role);
      return !role || !s.name;
    });
    for (const s of removableBefore) {
      await ctx.runMutation(internal.stakeholders.removeInternal, {
        id: s._id,
      });
    }

    // 2) Retry demographics + deep contacts + profile/news/image signals.
    let scraperOk = false;
    let govOk = false;
    let deepOk = false;
    let socialOk = false;
    try {
      const scrape = await ctx.runAction(internal.actions.scraper.scrapeUniversity, {
        universityId: uni._id,
      });
      scraperOk = (scrape as { success?: boolean })?.success === true;
    } catch {
      scraperOk = false;
    }
    try {
      const gov = await ctx.runAction(
        internal.actions.enrichGovernmentData.enrichGovernmentData,
        { universityId: uni._id },
      );
      govOk = (gov as { success?: boolean })?.success === true;
    } catch {
      govOk = false;
    }
    try {
      const deep = await ctx.runAction(
        internal.actions.deepEnrichment.runDeepEnrichment,
        { universityId: uni._id },
      );
      deepOk = (deep as { success?: boolean })?.success === true;
    } catch {
      deepOk = false;
    }
    try {
      const social = await ctx.runAction(
        internal.actions.enrichment.discoverSocialAndMedia,
        { universityId: uni._id },
      );
      socialOk = (social as { success?: boolean })?.success === true;
    } catch {
      socialOk = false;
    }

    // 3) Targeted VIT demographic recovery pass (strict parser on discovered sources).
    await runTargetedVitDataFetch(ctx, uni);

    // 4) Build priority-role shortlist and remove irrelevant records.
    const afterStakeholders: StakeholderDoc[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );
    const grouped = new Map<string, StakeholderDoc[]>();
    for (const st of afterStakeholders) {
      const role = canonicalRole(st.role);
      if (!role) continue;
      const arr = grouped.get(role) ?? [];
      arr.push(st);
      grouped.set(role, arr);
    }

    const selected: StakeholderDoc[] = [];
    for (const role of ROLE_NORMALIZERS.map((r) => r.role)) {
      const items = grouped.get(role) ?? [];
      if (items.length === 0) continue;
      const sorted = [...items].sort(
        (a, b) => stakeholderRank(b) - stakeholderRank(a),
      );
      const named = sorted.find(isNamedStakeholder);
      // Name-first enforcement:
      // keep inferred role-email only when no named stakeholder exists for that role.
      selected.push(named ?? sorted[0]);
    }

    const keepIds = new Set(selected.map((s) => s._id));
    const removeNow = afterStakeholders.filter((s) => {
      const role = canonicalRole(s.role);
      if (!role) return true;
      return !keepIds.has(s._id);
    });
    for (const s of removeNow) {
      await ctx.runMutation(internal.stakeholders.removeInternal, {
        id: s._id,
      });
    }

    const finalStakeholders: StakeholderDoc[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );
    const finalClean = finalStakeholders
      .map((s) => ({ s, role: canonicalRole(s.role) }))
      .filter((x) => !!x.role)
      .sort((a, b) => stakeholderRank(b.s) - stakeholderRank(a.s))
      .map((x) => ({
        id: x.s._id,
        role: x.role as string,
        name: x.s.name ?? null,
        email: x.s.email ?? null,
        phone: x.s.phone ?? null,
        linkedin_url: x.s.linkedin_url ?? null,
        source: x.s.source ?? null,
      }));

    const finalUni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: uni._id,
    });
    const signals: SignalDoc[] = await ctx.runQuery(
      internal.signals.listByUniversityInternal,
      { university_id: uni._id },
    );
    const signalSummary = {
      news: signals.filter((s) => s.signal_type === "news").length,
      image: signals.filter((s) => s.signal_type === "image").length,
      linkedin: signals.filter((s) => s.signal_type === "linkedin").length,
    };

    const lines = [
      "Role | Name | Email | Phone | LinkedIn | Source",
      "--- | --- | --- | --- | --- | ---",
      ...finalClean.map(
        (r) =>
          `${r.role} | ${r.name ?? ""} | ${r.email ?? ""} | ${r.phone ?? ""} | ${r.linkedin_url ?? ""} | ${r.source ?? ""}`,
      ),
    ];

    return {
      found: true,
      universityName: uni.university_name,
      universityId: uni._id,
      website: finalUni?.website ?? null,
      rerun: {
        scraper: scraperOk,
        governmentData: govOk,
        deepEnrichment: deepOk,
        socialEnrichment: socialOk,
      },
      demographics: finalUni?.demographics ?? null,
      stakeholders: finalClean,
      removedStakeholders: removableBefore.length + removeNow.length,
      signalSummary,
      outreachTable: lines.join("\n"),
    };
  },
});

export const repairUniversityStakeholders = internalAction({
  args: { universityName: v.string() },
  handler: async (ctx, args): Promise<StakeholderRepairReport> => {
    const uni = await ctx.runQuery(internal.universities.findByNameInternal, {
      name: args.universityName,
    });
    if (!uni) {
      return {
        found: false,
        universityName: args.universityName,
        repaired: false,
        stakeholderSummary: null,
        topStakeholders: [],
      };
    }

    await ctx.runMutation(internal.stakeholders.dedupeSingletonRoleContactsInternal, {
      university_id: uni._id,
    });

    const stakeholders = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );

    return {
      found: true,
      universityName: uni.university_name,
      repaired: true,
      stakeholderSummary: {
        total: stakeholders.length,
        named: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.name).length,
        withEmail: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.email)
          .length,
        withPhone: stakeholders.filter((stakeholder: StakeholderDoc) => !!stakeholder.phone)
          .length,
        withLinkedin: stakeholders.filter(
          (stakeholder: StakeholderDoc) => !!stakeholder.linkedin_url,
        ).length,
      },
      topStakeholders: stakeholders.slice(0, 12).map((stakeholder: StakeholderDoc) => ({
        name: stakeholder.name ?? null,
        role: stakeholder.role ?? null,
        email: stakeholder.email ?? null,
        phone: stakeholder.phone ?? null,
        linkedin_url: stakeholder.linkedin_url ?? null,
        source: stakeholder.source ?? null,
      })),
    };
  },
});

export const buildPriorityOutreachTable = internalAction({
  args: {
    universityName: v.string(),
    applyCleanup: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<PriorityTableReport> => {
    const uni = await ctx.runQuery(internal.universities.findByNameInternal, {
      name: args.universityName,
    });
    if (!uni) {
      return {
        found: false,
        universityName: args.universityName,
        demographics: null,
        selected: [],
        removedStakeholders: 0,
        outreachTable: "",
      };
    }

    const stakeholders: StakeholderDoc[] = await ctx.runQuery(
      internal.stakeholders.getByUniversityInternal,
      { university_id: uni._id },
    );

    const grouped = new Map<string, StakeholderDoc[]>();
    for (const st of stakeholders) {
      const role = canonicalRole(st.role);
      if (!role) continue;
      const arr = grouped.get(role) ?? [];
      arr.push(st);
      grouped.set(role, arr);
    }

    const selected: StakeholderDoc[] = [];
    for (const role of ROLE_NORMALIZERS.map((r) => r.role)) {
      const candidates = grouped.get(role) ?? [];
      if (candidates.length === 0) continue;
      const sorted = [...candidates].sort(
        (a, b) => stakeholderRank(b) - stakeholderRank(a),
      );
      const best = sorted.find(isNamedStakeholder) ?? sorted[0];
      if (best) selected.push(best);
    }

    const keepIds = new Set(selected.map((s) => s._id));
    let removedStakeholders = 0;
    if (args.applyCleanup) {
      const removable = stakeholders.filter((s) => {
        const role = canonicalRole(s.role);
        if (!role) return true;
        return !keepIds.has(s._id);
      });
      for (const st of removable) {
        await ctx.runMutation(internal.stakeholders.removeInternal, {
          id: st._id,
        });
      }
      removedStakeholders = removable.length;
    }

    const selectedRows = selected
      .map((s) => ({
        id: s._id,
        role: canonicalRole(s.role) as string,
        name: s.name ?? null,
        email: s.email ?? null,
        phone: s.phone ?? null,
        linkedin_url: s.linkedin_url ?? null,
        source: s.source ?? null,
      }))
      .sort((a, b) => {
        const ra = ROLE_NORMALIZERS.findIndex((r) => r.role === a.role);
        const rb = ROLE_NORMALIZERS.findIndex((r) => r.role === b.role);
        return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
      });

    const table = [
      "Role | Name | Email | Phone | LinkedIn | Source",
      "--- | --- | --- | --- | --- | ---",
      ...selectedRows.map(
        (r) =>
          `${r.role} | ${r.name ?? ""} | ${r.email ?? ""} | ${r.phone ?? ""} | ${r.linkedin_url ?? ""} | ${r.source ?? ""}`,
      ),
    ].join("\n");

    const freshUni = await ctx.runQuery(internal.universities.getInternal, {
      universityId: uni._id,
    });

    return {
      found: true,
      universityName: uni.university_name,
      universityId: uni._id,
      website: uni.website ?? null,
      demographics: freshUni?.demographics ?? null,
      selected: selectedRows,
      removedStakeholders,
      outreachTable: table,
    };
  },
});

export const recoverFourUniversities = internalAction({
  args: {
    universityNames: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const names =
      args.universityNames && args.universityNames.length > 0
        ? args.universityNames.slice(0, 4)
        : [
            "Vellore Institute of Technology",
            "Shiv Nadar University",
            "Kalinga Institute of Industrial Technology",
            "Anna University",
          ];

    const rows: FourUniversitySummaryRow[] = [];

    for (const name of names) {
      try {
        const rec = (await ctx.runAction(
          internal.actions.liveTest.recoverUniversityContacts,
          { universityName: name },
        )) as RecoveryReport;

        const demo = rec.demographics as Record<string, unknown> | null;
        const stakeholders = rec.stakeholders ?? [];
        rows.push({
          university: name,
          success: rec.found,
          rerun: rec.rerun,
          demographics: demo
            ? {
                total_students:
                  typeof demo.total_students === "number"
                    ? demo.total_students
                    : undefined,
                total_students_male:
                  typeof demo.total_students_male === "number"
                    ? demo.total_students_male
                    : undefined,
                total_students_female:
                  typeof demo.total_students_female === "number"
                    ? demo.total_students_female
                    : undefined,
                hostelites:
                  typeof demo.hostelites === "number"
                    ? demo.hostelites
                    : undefined,
                day_scholars:
                  typeof demo.day_scholars === "number"
                    ? demo.day_scholars
                    : undefined,
                source:
                  typeof demo.source === "string" ? demo.source : undefined,
              }
            : null,
          stakeholderCount: stakeholders.length,
          namedStakeholders: stakeholders.filter((s) => !!s.name).length,
          withPhone: stakeholders.filter((s) => !!s.phone).length,
          withLinkedin: stakeholders.filter((s) => !!s.linkedin_url).length,
        });
      } catch (e) {
        rows.push({
          university: name,
          success: false,
          demographics: null,
          stakeholderCount: 0,
          namedStakeholders: 0,
          withPhone: 0,
          withLinkedin: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      count: rows.length,
      rows,
    };
  },
});

export const testGeminiModel = internalAction({
  args: {
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const key = await ctx.runQuery(
      internal.settings.getInternalGeminiKey,
    ) as string | null;
    if (!key) return { success: false, error: "No Gemini API key" };
    const model = args.model ?? MODELS.gemini_3_7_flash;
    try {
      const userPrompt =
        "Extract the Vice Chancellor and Registrar from this source as JSON:\n" +
        "Source: Prof. Asgar Ali, Vice Chancellor (Offg.), can be reached at vc@jamiahamdard.ac.in. " +
        "Col. Tahir Mustafa, Registrar, registrar@jamiahamdard.ac.in.";
      const result = await callGeminiWithUsage({
        apiKey: key,
        model,
        fallbackModel: model,
        systemPrompt: "Return a JSON object with a stakeholders array.",
        userPrompt,
        temperature: TEMP.deterministic,
        responseAsJson: true,
        responseSchema: STAKEHOLDERS_SCHEMA,
        maxOutputTokens: 2048,
        label: "test_gemini_model",
        ctx,
        skipCache: true,
      });
      const parsed = JSON.parse(result.text) as {
        stakeholders?: unknown[];
      };
      return {
        success: true,
        model,
        text: result.text,
        stakeholders: parsed.stakeholders?.length ?? 0,
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, model, error: err };
    }
  },
});

/**
 * Diagnostic: confirm unpdf-based PDF parsing works in the Convex node
 * runtime by downloading a real NIRF PDF and running extractPdfText /
 * extractPdfTables against it.
 */
export const testPdfExtraction = internalAction({
  args: {
    url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const url =
      args.url ?? "https://unigug.ac.in/NIRFPORTAL/GON2025.pdf";
    try {
      const buffer = await downloadPdfBuffer(url);
      const [pdfText, pdfTables] = await Promise.all([
        extractPdfText(buffer),
        extractPdfTables(buffer),
      ]);
      return {
        success: true,
        url,
        bytes: buffer.length,
        textLength: pdfText.length,
        tablesLength: pdfTables.length,
        sample: pdfText.slice(0, 200),
      };
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      return { success: false, url, error: err };
    }
  },
});
