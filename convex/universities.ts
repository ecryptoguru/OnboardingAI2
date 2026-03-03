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
      v.literal("proposal_sent"), v.literal("closed"), v.literal("not_interested")
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
      v.literal("meeting_booked"), v.literal("proposal_sent"), v.literal("closed"), v.literal("not_interested")
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
      source: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.universityId, {
      demographics: args.demographics,
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
    const existingKeySet = new Set(
      existingUniversities.map(u => `${u.university_name}|${u.state}`)
    );

    let addedCount = 0;
    const now = Date.now();

    for (const uni of args.universities) {
      const key = `${uni.university_name}|${uni.state}`;
      if (!existingKeySet.has(key)) {
        await ctx.db.insert("universities", {
          ...uni,
          website_status: uni.website ? "valid" : "pending",
          outreach_stage: "new",
          created_at: now,
          updated_at: now,
        });
        addedCount++;
        // Add to set to prevent duplicates within the same batch
        existingKeySet.add(key);
      }
    }

    return { addedCount };
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
