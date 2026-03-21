import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const list = query({
  args: {
    status: v.optional(v.string()),
    tier: v.optional(v.string()),
    stage: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    
    if (args.type && args.type !== "All") {
      return await ctx.db
        .query("universities")
        .withIndex("by_type", (q) => q.eq("type", args.type))
        .collect();
    }
    
    if (args.status) {
      return await ctx.db
        .query("universities")
        .withIndex("by_website_status", (q) =>
          q.eq("website_status", args.status as any)
        )
        .collect();
    }
    
    if (args.stage) {
      return await ctx.db
        .query("universities")
        .withIndex("by_outreach_stage", (q) =>
          q.eq("outreach_stage", args.stage as any)
        )
        .collect();
    }
    
    return await ctx.db
      .query("universities")
      .withIndex("by_created_at")
      .order("desc")
      .collect();
  },
});
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const universities = await ctx.db.query("universities").collect();
    
    const stats: Record<string, number> = {
      All: universities.length,
      Central: 0,
      State: 0,
      Private: 0,
      Deemed: 0,
      Other: 0,
    };

    universities.forEach((uni) => {
      const type = uni.type || "Other";
      if (stats[type] !== undefined) {
        stats[type]++;
      } else {
        stats.Other++;
      }
    });

    return stats;
  },
});

export const getFunnelStats = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const universities = await ctx.db.query("universities").collect();
    const total = universities.length;
    const enriched = universities.filter(u =>
      u.outreach_stage && !["new", "enriching", "skipped"].includes(u.outreach_stage)
    ).length;
    const outreachActive = universities.filter(u => u.outreach_stage === "outreach_active").length;
    const replied = universities.filter(u => u.outreach_stage === "replied").length;
    const meetingBooked = universities.filter(u => u.outreach_stage === "meeting_booked").length;
    const proposalSent = universities.filter(u => u.outreach_stage === "proposal_sent").length;
    const closed = universities.filter(u => u.outreach_stage === "closed").length;
    const notInterested = universities.filter(u => u.outreach_stage === "not_interested").length;
    const highTier = universities.filter(u => u.lead_tier === "High").length;
    const mediumTier = universities.filter(u => u.lead_tier === "Medium").length;
    return { total, enriched, outreachActive, replied, meetingBooked, proposalSent, closed, notInterested, highTier, mediumTier };
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
    website_status: v.optional(v.union(
      v.literal("pending"), v.literal("valid"),
      v.literal("invalid"), v.literal("discovered")
    )),
    website: v.optional(v.string()),
    lead_tier: v.optional(v.union(
      v.literal("High"), v.literal("Medium"), v.literal("Low")
    )),
    outreach_stage: v.optional(v.union(
      v.literal("new"), v.literal("enriching"), v.literal("enriched"),
      v.literal("sequencing"), v.literal("replied"), v.literal("meeting_booked"),
      v.literal("proposal_sent"), v.literal("closed"), v.literal("not_interested"), v.literal("skipped")
    )),
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
    rows: v.array(v.object({
      university_name: v.string(),
      state: v.optional(v.string()),
      city: v.optional(v.string()),
      website: v.optional(v.string()),
      student_count: v.optional(v.number()),
      type: v.optional(v.string()),
      naac_grade: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const now = Date.now();
    const ids = await Promise.all(
      args.rows.map((row) =>
        ctx.db.insert("universities", {
          ...row,
          website_status: "pending",
          outreach_stage: "new",
          created_at: now,
          updated_at: now,
        })
      )
    );
    return ids;
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
      .withSearchIndex("search_name", (q) => q.search("university_name", args.query))
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
       .withIndex("by_university", (q) => q.eq("university_id", args.id))
       .filter((q) => q.eq(q.field("status"), "active"))
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

    let prevStage: any = uni.outreach_stage;

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
      outreach_stage: prevStage,
      updated_at: Date.now(),
    });
  },
});

export const listSkipped = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("universities")
      .withIndex("by_outreach_stage", (q) => q.eq("outreach_stage", "skipped"))
      .order("desc")
      .collect();
  },
});

// --- Internal API for actions ---
export const getInternal = internalQuery({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.universityId);
  },
});

export const updateOutreachStageInternal = internalMutation({
  args: {
    universityId: v.id("universities"),
    stage: v.union(
      v.literal("new"), v.literal("enriching"), v.literal("enriched"),
      v.literal("sequencing"), v.literal("outreach_active"), v.literal("replied"), 
      v.literal("meeting_booked"), v.literal("proposal_sent"), v.literal("closed"), v.literal("not_interested"), v.literal("skipped")
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
    lead_tier: v.union(v.literal("High"), v.literal("Medium"), v.literal("Low")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.universityId, {
      lead_tier: args.lead_tier,
      updated_at: Date.now(),
    });
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
          })
        )
      ),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.universityId);
    const existingDemo = (existing as any)?.demographics ?? {};
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
    const total = (merged.total_students as number | undefined)
      ?? (merged.nirf_total as number | undefined);

    if (total && typeof total === "number" && total > 0) {
      const hostelites = merged.hostelites as number | undefined;
      if (hostelites && hostelites > total) {
        console.warn(
          `[UpdateDemo] REJECTED hostelites (${hostelites}) — exceeds total/nirf (${total}). Removing.`
        );
        delete merged.hostelites;
        delete merged.hostelites_male;
        delete merged.hostelites_female;
      }
      const dayScholars = merged.day_scholars as number | undefined;
      if (dayScholars && dayScholars > total) {
        console.warn(
          `[UpdateDemo] REJECTED day_scholars (${dayScholars}) — exceeds total/nirf (${total}). Removing.`
        );
        delete merged.day_scholars;
        delete merged.day_scholars_male;
        delete merged.day_scholars_female;
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    await ctx.db.patch(args.universityId, {
      demographics: merged,
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
        vc_name: v.optional(v.string()),
        registrar_name: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    
    // Fetch all existing university keys for efficient deduplication
    const existingUniversities = await ctx.db.query("universities").collect();

    let addedCount = 0;
    let updatedCount = 0;
    const now = Date.now();

    for (const uni of args.universities) {
      // Find matching university by name text search rather than exact string
      const uniNameLower = uni.university_name.toLowerCase();
      const existingRecords = [];
      
      for (const record of existingUniversities) {
        const recordNameLower = record.university_name.toLowerCase();
        
        // Exact and precise matching for Yenepoya and VIT
        const isYenepoya = uniNameLower.includes("yenepoya") && recordNameLower.includes("yenepoya");
        const isVITQuery = uniNameLower.includes("vit") || uniNameLower.includes("vellore");
        const isVITRecord = recordNameLower === "vit university" || recordNameLower === "vellore institute of technology" || recordNameLower === "vit";
        const isVIT = Boolean(isVITQuery && isVITRecord);

        if (isYenepoya || isVIT || (recordNameLower === uniNameLower)) {
          existingRecords.push(record);
        }
      }
      
      console.log(`Processing UGC uni: ${uni.university_name}`);
      if (existingRecords.length === 0) {
        console.log(`-> No match found. Inserting new.`);
        await ctx.db.insert("universities", {
          ...uni,
          website_status: uni.website ? "valid" : "pending",
          outreach_stage: "new",
          created_at: now,
          updated_at: now,
        });
        addedCount++;
        // Refresh local cache to prevent duplicates within the same batch
        existingUniversities.push({ ...uni, _id: "temp" as any, _creationTime: now } as any);
      } else {
        console.log(`-> Found ${existingRecords.length} match(es) for: ${uni.university_name}`);
        const normalizeStr = (val: any) => val ? String(val).trim() : undefined;
        
        for (const existingRecord of existingRecords) {
          // Check if data is missing or different
          const hasUpdates = 
            (uni.website && normalizeStr(existingRecord.website) !== normalizeStr(uni.website)) ||
            (uni.type && normalizeStr(existingRecord.type) !== normalizeStr(uni.type)) ||
            (uni.state && normalizeStr(existingRecord.state) !== normalizeStr(uni.state)) ||
            (uni.address && normalizeStr(existingRecord.address) !== normalizeStr(uni.address)) ||
            (uni.zip_code && normalizeStr(existingRecord.zip_code) !== normalizeStr(uni.zip_code)) ||
            (uni.ugc_status && normalizeStr(existingRecord.ugc_status) !== normalizeStr(uni.ugc_status)) ||
            (uni.vc_name && normalizeStr(existingRecord.vc_name) !== normalizeStr(uni.vc_name)) ||
            (uni.registrar_name && normalizeStr(existingRecord.registrar_name) !== normalizeStr(uni.registrar_name));

          if (hasUpdates) {
            console.log(`-> Updating record: ${existingRecord.university_name} (${existingRecord._id})`);
            await ctx.db.patch(existingRecord._id, {
              website: uni.website || existingRecord.website,
              type: uni.type || existingRecord.type,
              state: uni.state || existingRecord.state,
              address: uni.address || existingRecord.address,
              zip_code: uni.zip_code || existingRecord.zip_code,
              ugc_status: uni.ugc_status || existingRecord.ugc_status,
              vc_name: uni.vc_name || existingRecord.vc_name,
              registrar_name: uni.registrar_name || existingRecord.registrar_name,
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
      .filter((q) => q.eq(q.field("type"), "Deemed to be Universities"))
      .collect();

    let updatedCount = 0;
    for (const uni of deemedUnis) {
      await ctx.db.patch(uni._id, { type: "Deemed" });
      updatedCount++;
    }
    return { updatedCount };
  },
});
