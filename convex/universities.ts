import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { validateAuth } from "./lib/auth_utils";
import { namesMatch, normalizeState } from "./lib/universityUtils";

function isDuplicateOfExisting(
  row: { university_name: string; state?: string | null },
  existing: { university_name: string; state?: string | null }[],
): boolean {
  for (const record of existing) {
    if (namesMatch(row.university_name, record.university_name)) {
      // Optional: also compare state to reduce false positives
      if (
        !row.state ||
        !record.state ||
        normalizeState(row.state) === normalizeState(record.state)
      ) {
        return true;
      }
    }
  }
  return false;
}

const websiteStatusValidator = v.optional(
  v.union(
    v.literal("pending"),
    v.literal("valid"),
    v.literal("invalid"),
    v.literal("discovered"),
    v.literal("discovered_weak"),
  ),
);

const outreachStageValidator = v.optional(
  v.union(
    v.literal("new"),
    v.literal("enriching"),
    v.literal("enriched"),
    v.literal("sequencing"),
    v.literal("outreach_active"),
    v.literal("replied"),
    v.literal("meeting_booked"),
    v.literal("proposal_sent"),
    v.literal("closed"),
    v.literal("not_interested"),
    v.literal("skipped"),
  ),
);

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: websiteStatusValidator,
    tier: v.optional(v.string()),
    stage: outreachStageValidator,
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    if (args.type && args.type !== "All") {
      const type = args.type;
      if (args.status) {
        const status = args.status;
        let q = ctx.db
          .query("universities")
          .withIndex("by_type_status", (q) => q.eq("type", type).eq("website_status", status));
        if (args.stage) {
          q = q.filter((q) => q.eq(q.field("outreach_stage"), args.stage));
        }
        return q.paginate(args.paginationOpts);
      }
      if (args.stage) {
        const stage = args.stage;
        return await ctx.db
          .query("universities")
          .withIndex("by_type_stage", (q) => q.eq("type", type).eq("outreach_stage", stage))
          .paginate(args.paginationOpts);
      }
      return await ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", type))
        .paginate(args.paginationOpts);
    }

    if (args.status) {
      const status = args.status;
      if (args.stage) {
        const stage = args.stage;
        return await ctx.db
          .query("universities")
          .withIndex("by_status_stage", (q) => q.eq("website_status", status).eq("outreach_stage", stage))
          .paginate(args.paginationOpts);
      }
      return await ctx.db
        .query("universities")
        .withIndex("by_website_status", (q) => q.eq("website_status", status))
        .paginate(args.paginationOpts);
    }

    if (args.stage) {
      return await ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", args.stage!),
        )
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("universities")
      .withIndex("by_created_at")
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
export const list = query({
  args: {
    status: websiteStatusValidator,
    tier: v.optional(v.string()),
    stage: outreachStageValidator,
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const limit = args.limit ?? 500;

    if (args.type && args.type !== "All") {
      const type = args.type;
      if (args.status) {
        const status = args.status;
        let q = ctx.db
          .query("universities")
          .withIndex("by_type_status", (q) => q.eq("type", type).eq("website_status", status));
        if (args.stage) {
          q = q.filter((q) => q.eq(q.field("outreach_stage"), args.stage));
        }
        return q.take(limit);
      }
      if (args.stage) {
        const stage = args.stage;
        return await ctx.db
          .query("universities")
          .withIndex("by_type_stage", (q) => q.eq("type", type).eq("outreach_stage", stage))
          .take(limit);
      }
      return await ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", type))
        .take(limit);
    }

    if (args.status) {
      const status = args.status;
      if (args.stage) {
        const stage = args.stage;
        return await ctx.db
          .query("universities")
          .withIndex("by_status_stage", (q) => q.eq("website_status", status).eq("outreach_stage", stage))
          .take(limit);
      }
      return await ctx.db
        .query("universities")
        .withIndex("by_website_status", (q) => q.eq("website_status", status))
        .take(limit);
    }

    if (args.stage) {
      return await ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", args.stage!),
        )
        .take(limit);
    }

    return await ctx.db
      .query("universities")
      .withIndex("by_created_at")
      .order("desc")
      .take(limit);
  },
});
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);

    // Use index-scoped collects per type to avoid a full table scan.
    const [central, state, priv, deemed, ini, other] = await Promise.all([
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "Central"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "State"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "Private"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "Deemed"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "INI"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", "Other"))
        .collect()
        .then((r) => r.length),
    ]);

    // Compute total by summing all outreach stages (every uni has a stage).
    // This avoids a full-table .collect() which loads every document into memory.
    const [
      newCount,
      enriching,
      enriched,
      sequencing,
      outreachActive,
      replied,
      meetingBooked,
      proposalSent,
      closed,
      notInterested,
      skipped,
    ] = await Promise.all([
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "new")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "enriching")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "enriched")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "sequencing")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "outreach_active")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "replied")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "meeting_booked")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "proposal_sent")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "closed")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "not_interested")).collect().then((r) => r.length),
      ctx.db.query("universities").withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "skipped")).collect().then((r) => r.length),
    ]);

    const all = newCount + enriching + enriched + sequencing + outreachActive + replied + meetingBooked + proposalSent + closed + notInterested + skipped;
    const allWithType = central + state + priv + deemed + ini + other;

    return {
      All: all,
      Central: central,
      State: state,
      Private: priv,
      Deemed: deemed,
      INI: ini,
      Other: all - allWithType + other,
    };
  },
});

export const getFunnelStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    // Use parallel index-scoped queries instead of full-table scans.
    // Compute total as sum of all stage counts to avoid full table scan.
    const [
      newCount,
      enriching,
      enrichedCount,
      sequencing,
      skipped,
      outreachActive,
      replied,
      meetingBooked,
      proposalSent,
      closed,
      notInterested,
      highTier,
      mediumTier,
    ] = await Promise.all([
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "new"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "enriching"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "enriched"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "sequencing"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "skipped"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "outreach_active"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "replied"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "meeting_booked"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "proposal_sent"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "closed"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", "not_interested"),
        )
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_lead_tier", (q) => q.eq("lead_tier", "High"))
        .collect()
        .then((r) => r.length),
      ctx.db
        .query("universities")
        .withIndex("by_lead_tier", (q) => q.eq("lead_tier", "Medium"))
        .collect()
        .then((r) => r.length),
    ]);

    // Total is the exact sum of all tracked outreach stages.
    const total =
      newCount +
      enriching +
      enrichedCount +
      sequencing +
      skipped +
      outreachActive +
      replied +
      meetingBooked +
      proposalSent +
      closed +
      notInterested;

    return {
      total,
      enriched: enrichedCount,
      outreachActive,
      replied,
      meetingBooked,
      proposalSent,
      closed,
      notInterested,
      highTier,
      mediumTier,
    };
  },
});

export const get = query({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db.get(args.id);
  },
});

export const createInternal = internalMutation({
  args: {
    university_name: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    website: v.optional(v.string()),
    student_count: v.optional(v.number()),
    type: v.optional(v.string()),
    category: v.optional(v.string()),
    data_source: v.optional(v.string()),
    naac_grade: v.optional(v.string()),
    established_year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("universities", {
      ...args,
      website_status: "pending",
      outreach_stage: "new",
      created_at: now,
      updated_at: now,
    });
  },
});

export const create = mutation({
  args: {
    university_name: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    website: v.optional(v.string()),
    student_count: v.optional(v.number()),
    type: v.optional(v.string()),
    category: v.optional(v.string()),
    data_source: v.optional(v.string()),
    naac_grade: v.optional(v.string()),
    established_year: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const now = Date.now();
    return await ctx.db.insert("universities", {
      ...args,
      website_status: "pending",
      outreach_stage: "new",
      created_at: now,
      updated_at: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("universities"),
    website_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("valid"),
        v.literal("invalid"),
        v.literal("discovered"),
        v.literal("discovered_weak"),
      ),
    ),
    website: v.optional(v.string()),
    lead_tier: v.optional(
      v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
    ),
    outreach_stage: v.optional(
      v.union(
        v.literal("new"),
        v.literal("enriching"),
        v.literal("enriched"),
        v.literal("sequencing"),
        v.literal("outreach_active"),
        v.literal("replied"),
        v.literal("meeting_booked"),
        v.literal("proposal_sent"),
        v.literal("closed"),
        v.literal("not_interested"),
        v.literal("skipped"),
      ),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updated_at: Date.now() });
  },
});

export const bulkInsert = mutation({
  args: {
    rows: v.array(
      v.object({
        university_name: v.string(),
        state: v.optional(v.string()),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        student_count: v.optional(v.number()),
        type: v.optional(v.string()),
        category: v.optional(v.string()),
        data_source: v.optional(v.string()),
        naac_grade: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const now = Date.now();

    // Fetch existing universities for deduplication
    const existing = await ctx.db.query("universities").collect();

    const ids: string[] = [];
    const skipped: string[] = [];

    for (const row of args.rows) {
      if (isDuplicateOfExisting(row, existing)) {
        skipped.push(row.university_name);
        continue;
      }

      const inserted = await ctx.db.insert("universities", {
        ...row,
        website_status: "pending",
        outreach_stage: "new",
        created_at: now,
        updated_at: now,
      });

      ids.push(inserted);
      // Update local cache so subsequent rows in same batch don't duplicate each other
      existing.push({
        _id: inserted,
        _creationTime: now,
        university_name: row.university_name,
        state: row.state,
        city: row.city,
        website: row.website,
        website_status: "pending",
        outreach_stage: "new",
        student_count: row.student_count,
        type: row.type,
        category: row.category,
        data_source: row.data_source,
        naac_grade: row.naac_grade,
        created_at: now,
        updated_at: now,
      } as (typeof existing)[0]);
    }

    return { inserted: ids.length, skipped: skipped.length, skippedNames: skipped };
  },
});

export const remove = mutation({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation(async (ctx) => {
  await validateAuth(ctx);
  return await ctx.storage.generateUploadUrl();
});

// --- Skip University Features ---

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    if (!args.query) return [];

    // Using search index on university_name
    return await ctx.db
      .query("universities")
      .withSearchIndex("search_name", (q) =>
        q.search("university_name", args.query),
      )
      .take(10);
  },
});

export const skipUniversity = mutation({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, {
      outreach_stage: "skipped",
      updated_at: Date.now(),
    });

    // Pause any active sequence for this university
    const sequences = await ctx.db
      .query("outreachSequences")
      .withIndex("by_university_status", (q) => q.eq("university_id", args.id).eq("status", "active"))
      .collect();

    for (const seq of sequences) {
      await ctx.db.patch(seq._id, { status: "paused", updated_at: Date.now() });
    }
  },
});

export const unskipUniversity = mutation({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, {
      outreach_stage: "enriched",
      updated_at: Date.now(),
    });
  },
});

export const revertStage = mutation({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const uni = await ctx.db.get(args.id);
    if (!uni) return;

    let prevStage: string | null | undefined = uni.outreach_stage;

    // Define the reverse flow
    if (uni.outreach_stage === "outreach_active") {
      prevStage = "enriched";
      // Delete any active sequences to allow a fresh "Begin Sequence"
      const sequences = await ctx.db
        .query("outreachSequences")
        .withIndex("by_university", (q) => q.eq("university_id", args.id))
        .collect();
      for (const seq of sequences) {
        await ctx.db.delete(seq._id);
      }
    } else if (uni.outreach_stage === "replied") {
      prevStage = "outreach_active";
    } else if (uni.outreach_stage === "meeting_booked") {
      prevStage = "replied";
    } else if (uni.outreach_stage === "not_interested") {
      prevStage = "outreach_active";
    }

    await ctx.db.patch(args.id, {
      outreach_stage: prevStage as
        | "new"
        | "enriching"
        | "enriched"
        | "sequencing"
        | "outreach_active"
        | "replied"
        | "meeting_booked"
        | "proposal_sent"
        | "closed"
        | "not_interested"
        | "skipped",
      updated_at: Date.now(),
    });
  },
});

export const listSkipped = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("universities")
      .withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "skipped"))
      .order("desc")
      .take(args.limit ?? 500);
  },
});

// --- Internal API for actions ---
export const getInternal = internalQuery({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.universityId);
  },
});

export const findByNameInternal = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("universities").collect();
    const lower = args.name.toLowerCase();
    return (
      all.find((u) => u.university_name.toLowerCase().includes(lower)) ?? null
    );
  },
});

export const updateInternal = internalMutation({
  args: {
    id: v.id("universities"),
    website_status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("valid"),
        v.literal("invalid"),
        v.literal("discovered"),
        v.literal("discovered_weak"),
      ),
    ),
    website: v.optional(v.string()),
    lead_tier: v.optional(
      v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
    ),
    outreach_stage: v.optional(
      v.union(
        v.literal("new"),
        v.literal("enriching"),
        v.literal("enriched"),
        v.literal("sequencing"),
        v.literal("outreach_active"),
        v.literal("replied"),
        v.literal("meeting_booked"),
        v.literal("proposal_sent"),
        v.literal("closed"),
        v.literal("not_interested"),
        v.literal("skipped"),
      ),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updated_at: Date.now() });
  },
});

export const updateOutreachStageInternal = internalMutation({
  args: {
    universityId: v.id("universities"),
    stage: v.union(
      v.literal("new"),
      v.literal("enriching"),
      v.literal("enriched"),
      v.literal("sequencing"),
      v.literal("outreach_active"),
      v.literal("replied"),
      v.literal("meeting_booked"),
      v.literal("proposal_sent"),
      v.literal("closed"),
      v.literal("not_interested"),
      v.literal("skipped"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.universityId, {
      outreach_stage: args.stage,
      updated_at: Date.now(),
    });
  },
});

export const updateLeadTierInternal = internalMutation({
  args: {
    universityId: v.id("universities"),
    lead_tier: v.union(
      v.literal("High"),
      v.literal("Medium"),
      v.literal("Low"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.universityId, {
      lead_tier: args.lead_tier,
      updated_at: Date.now(),
    });
  },
});

export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("universities").collect();
  },
});

export const patchInternal = internalMutation({
  args: {
    id: v.id("universities"),
    fields: v.record(
      v.string(),
      v.union(v.string(), v.number(), v.boolean()),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { ...args.fields, updated_at: Date.now() });
  },
});

export const deleteInternal = internalMutation({
  args: { id: v.id("universities") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const updateDemographicsInternal = internalMutation({
  args: {
    universityId: v.id("universities"),
    demographics: v.object({
      total_students: v.optional(v.number()),
      total_students_male: v.optional(v.number()),
      total_students_female: v.optional(v.number()),
      day_scholars: v.optional(v.number()),
      day_scholars_male: v.optional(v.number()),
      day_scholars_female: v.optional(v.number()),
      hostelites: v.optional(v.number()),
      hostelites_male: v.optional(v.number()),
      hostelites_female: v.optional(v.number()),
      source: v.optional(v.string()), // NAAC/AISHE source year
      data_quality: v.optional(v.string()), // "verified" | "partial" | "inferred"
      nirf_source: v.optional(v.string()), // e.g. "NIRF 2024"
      nirf_total: v.optional(v.number()),
      nirf_male: v.optional(v.number()),
      nirf_female: v.optional(v.number()),
      nirf_programs: v.optional(
        v.array(
          v.object({
            name: v.string(),
            male: v.optional(v.number()),
            female: v.optional(v.number()),
            total: v.optional(v.number()),
          }),
        ),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.universityId);
    const existingDemo =
      (existing as Record<string, unknown> | null)?.demographics ?? {};
    // Merge: only overwrite fields that the new run actually found (non-null/undefined)
    const incoming = args.demographics as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...existingDemo };
    for (const [key, val] of Object.entries(incoming)) {
      if (val !== null && val !== undefined) {
        merged[key] = val;
      }
    }

    // ── POST-MERGE SANITY GATE ──────────────────────────────────────────────
    // After merging old + new data, validate numeric coherence.
    // Old data can contain stale bad values (e.g. hostelites > total from a
    // previous buggy run). Discard them here before saving.
    const total =
      (merged.total_students as number | undefined) ??
      (merged.nirf_total as number | undefined);

    if (total && typeof total === "number" && total > 0) {
      const hostelites = merged.hostelites as number | undefined;
      if (hostelites && hostelites > total) {
        console.warn(
          `[UpdateDemo] REJECTED hostelites (${hostelites}) — exceeds total/nirf (${total}). Removing.`,
        );
        delete merged.hostelites;
        delete merged.hostelites_male;
        delete merged.hostelites_female;
      }
      const dayScholars = merged.day_scholars as number | undefined;
      if (dayScholars && dayScholars > total) {
        console.warn(
          `[UpdateDemo] REJECTED day_scholars (${dayScholars}) — exceeds total/nirf (${total}). Removing.`,
        );
        delete merged.day_scholars;
        delete merged.day_scholars_male;
        delete merged.day_scholars_female;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    await ctx.db.patch(args.universityId, {
      demographics: merged,
      student_count: total || undefined,
      updated_at: Date.now(),
    });
  },
});
export const bulkSyncUgc = mutation({
  args: {
    universities: v.array(
      v.object({
        university_name: v.string(),
        state: v.string(),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        type: v.optional(v.string()),
        address: v.optional(v.string()),
        zip_code: v.optional(v.string()),
        ugc_status: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    const BATCH_SIZE_LIMIT = 2000;
    if (args.universities.length > BATCH_SIZE_LIMIT) {
      throw new Error(
        `Batch too large: ${args.universities.length} universities. Max ${BATCH_SIZE_LIMIT} per sync.`,
      );
    }

    const now = Date.now();

    // ─── Distributed rate limit enforcement ─────────────────────────────────
    const userIdentity = await ctx.auth.getUserIdentity();
    const userKey = userIdentity?.email ?? "anonymous";
    const rateKey = `bulkSyncUgc:${userKey}`;
    const rateRecord = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", rateKey))
      .first();
    const RATE_WINDOW_MS = 300000; // 5 min
    const RATE_MAX = 5; // 5 syncs per 5 min
    if (
      rateRecord &&
      now < rateRecord.resetAt &&
      rateRecord.count >= RATE_MAX
    ) {
      throw new Error("Rate limit exceeded. Please wait before syncing again.");
    }
    if (rateRecord && now < rateRecord.resetAt) {
      await ctx.db.patch(rateRecord._id, { count: rateRecord.count + 1 });
    } else if (rateRecord) {
      await ctx.db.patch(rateRecord._id, {
        count: 1,
        resetAt: now + RATE_WINDOW_MS,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        key: rateKey,
        count: 1,
        resetAt: now + RATE_WINDOW_MS,
      });
    }

    // Fetch all existing universities and index by state for O(n * avg_state_size)
    // fuzzy matching instead of O(n * total_universities).
    const existingUniversities = await ctx.db.query("universities").collect();
    const stateMap = new Map<string, typeof existingUniversities>();
    for (const record of existingUniversities) {
      const key = (record.state || "unknown").toLowerCase().trim();
      const list = stateMap.get(key) ?? [];
      list.push(record);
      stateMap.set(key, list);
    }

    let addedCount = 0;
    let updatedCount = 0;

    for (const uni of args.universities) {
      // Only compare against universities in the same state (or "unknown")
      const stateKey = (uni.state || "unknown").toLowerCase().trim();
      const candidates = stateMap.get(stateKey) ?? [];
      const existingRecords = [];

      for (const record of candidates) {
        if (namesMatch(uni.university_name, record.university_name)) {
          existingRecords.push(record);
        }
      }

      console.log(`Processing UGC uni: ${uni.university_name}`);
      if (existingRecords.length === 0) {
        console.log(`-> No match found. Inserting new.`);
        const inserted = await ctx.db.insert("universities", {
          ...uni,
          data_source: "ugc",
          website_status: uni.website ? "valid" : "pending",
          outreach_stage: "new",
          created_at: now,
          updated_at: now,
        });
        addedCount++;
        // Refresh local cache to prevent duplicates within the same batch
        const newRecord = { ...uni, _id: inserted, _creationTime: now };
        existingUniversities.push(
          newRecord as (typeof existingUniversities)[0],
        );
        const list = stateMap.get(stateKey) ?? [];
        list.push(newRecord as (typeof existingUniversities)[0]);
        stateMap.set(stateKey, list);
      } else {
        console.log(
          `-> Found ${existingRecords.length} match(es) for: ${uni.university_name}`,
        );
        const normalizeStr = (val: unknown) =>
          val ? String(val).trim() : undefined;

        for (const existingRecord of existingRecords) {
          if (existingRecord.data_source === "curated") {
            console.log(
              `-> Skipping curated record: ${existingRecord.university_name}`,
            );
            continue;
          }

          const hasUpdates =
            (uni.website &&
              normalizeStr(existingRecord.website) !==
                normalizeStr(uni.website)) ||
            (uni.type &&
              normalizeStr(existingRecord.type) !== normalizeStr(uni.type)) ||
            (uni.state &&
              normalizeStr(existingRecord.state) !== normalizeStr(uni.state)) ||
            (uni.address &&
              normalizeStr(existingRecord.address) !==
                normalizeStr(uni.address)) ||
            (uni.zip_code &&
              normalizeStr(existingRecord.zip_code) !==
                normalizeStr(uni.zip_code)) ||
            (uni.ugc_status &&
              normalizeStr(existingRecord.ugc_status) !==
                normalizeStr(uni.ugc_status));

          if (hasUpdates) {
            console.log(
              `-> Updating record: ${existingRecord.university_name} (${existingRecord._id})`,
            );
            await ctx.db.patch(existingRecord._id, {
              website: uni.website || existingRecord.website,
              type: uni.type || existingRecord.type,
              state: uni.state || existingRecord.state,
              address: uni.address || existingRecord.address,
              zip_code: uni.zip_code || existingRecord.zip_code,
              ugc_status: uni.ugc_status || existingRecord.ugc_status,
              data_source: "ugc",
              updated_at: now,
            });
            updatedCount++;
          }
        }
      }
    }

    console.log(`Done. Added: ${addedCount}, Updated: ${updatedCount}`);
    return { addedCount, updatedCount };
  },
});

export const bulkSyncUgcInternal = internalMutation({
  args: {
    inserts: v.array(
      v.object({
        university_name: v.string(),
        state: v.string(),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        type: v.optional(v.string()),
        address: v.optional(v.string()),
        zip_code: v.optional(v.string()),
        ugc_status: v.optional(v.string()),
        vc_name: v.optional(v.string()),
        registrar_name: v.optional(v.string()),
      }),
    ),
    updates: v.array(
      v.object({
        id: v.id("universities"),
        website: v.optional(v.string()),
        type: v.optional(v.string()),
        state: v.optional(v.string()),
        address: v.optional(v.string()),
        zip_code: v.optional(v.string()),
        ugc_status: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let addedCount = 0;
    let updatedCount = 0;

    for (const uni of args.inserts) {
      await ctx.db.insert("universities", {
        ...uni,
        data_source: "ugc",
        website_status: uni.website ? "valid" : "pending",
        outreach_stage: "new",
        created_at: now,
        updated_at: now,
      });
      addedCount++;
    }

    for (const upd of args.updates) {
      const existing = await ctx.db.get(upd.id);
      if (!existing) {
        console.warn(`Update target missing: ${upd.id}`);
        continue;
      }
      if (existing.data_source === "curated") {
        console.log(`Skipping curated record update: ${existing.university_name}`);
        continue;
      }

      await ctx.db.patch(upd.id, {
        website: upd.website,
        type: upd.type,
        state: upd.state,
        address: upd.address,
        zip_code: upd.zip_code,
        ugc_status: upd.ugc_status,
        data_source: "ugc",
        updated_at: now,
      });
      updatedCount++;
    }

    return { addedCount, updatedCount };
  },
});

export const bulkSyncCuratedInternal = internalMutation({
  args: {
    inserts: v.array(
      v.object({
        university_name: v.string(),
        state: v.string(),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        type: v.optional(v.string()),
        category: v.optional(v.string()),
        data_source: v.optional(v.string()),
        established_year: v.optional(v.number()),
      }),
    ),
    updates: v.array(
      v.object({
        id: v.id("universities"),
        university_name: v.optional(v.string()),
        state: v.optional(v.string()),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        website_status: websiteStatusValidator,
        type: v.optional(v.string()),
        category: v.optional(v.string()),
        data_source: v.optional(v.string()),
        established_year: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let addedCount = 0;
    let updatedCount = 0;

    for (const uni of args.inserts) {
      await ctx.db.insert("universities", {
        ...uni,
        website_status: uni.website ? "valid" : "pending",
        outreach_stage: "new",
        created_at: now,
        updated_at: now,
      });
      addedCount++;
    }

    for (const upd of args.updates) {
      const { id, ...fields } = upd;
      const websiteStatus =
        fields.website_status ??
        (fields.website ? "valid" : undefined);
      await ctx.db.patch(id, {
        ...fields,
        ...(websiteStatus ? { website_status: websiteStatus } : {}),
        updated_at: now,
      });
      updatedCount++;
    }

    return { addedCount, updatedCount };
  },
});

export const patchState = mutation({
  args: { id: v.id("universities"), state: v.string() },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, { state: args.state, updated_at: Date.now() });
  },
});

export const migrateDeemed = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const deemedUnis = await ctx.db
      .query("universities")
      .withIndex("by_type", (q) => q.eq("type", "Deemed to be Universities"))
      .collect();

    let updatedCount = 0;
    for (const uni of deemedUnis) {
      await ctx.db.patch(uni._id, { type: "Deemed" });
      updatedCount++;
    }
    return { updatedCount };
  },
});

