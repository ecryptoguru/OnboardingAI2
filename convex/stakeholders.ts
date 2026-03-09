import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});

export const getPrimary = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
    return all.find((s) => s.is_primary) ?? all[0] ?? null;
  },
});

export const upsertByEmail = mutation({
  args: {
    university_id: v.id("universities"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    phone: v.optional(v.string()),
    linkedin_url: v.optional(v.string()),
    is_primary: v.optional(v.boolean()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const existing = await ctx.db
      .query("stakeholders")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name ?? existing.name,
        role: args.role ?? existing.role,
        phone: args.phone ?? existing.phone,
        linkedin_url: args.linkedin_url ?? existing.linkedin_url,
      });
      return existing._id;
    }

    return await ctx.db.insert("stakeholders", {
      university_id: args.university_id,
      email: args.email,
      name: args.name,
      role: args.role,
      phone: args.phone,
      linkedin_url: args.linkedin_url,
      is_primary: args.is_primary ?? false,
      source: args.source ?? "scraper",
      created_at: Date.now(),
    });
  },
});

export const create = mutation({
  args: {
    university_id: v.id("universities"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    is_primary: v.boolean(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db.insert("stakeholders", {
      ...args,
      created_at: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("stakeholders"),
    linkedin_url: v.optional(v.string()),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
  },
});

export const insertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("stakeholders", {
      ...args,
      is_primary: false,
      created_at: Date.now(),
    });
  },
});

export const bulkInsertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholders: v.array(v.object({
      name: v.optional(v.string()),
      role: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
    })),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const st of args.stakeholders) {
      await ctx.db.insert("stakeholders", {
        university_id: args.university_id,
        name: st.name,
        role: st.role,
        email: st.email,
        phone: st.phone,
        is_primary: false,
        source: args.source || "scraper",
        created_at: now,
      });
    }
  },
});

export const upsertBulkInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    stakeholders: v.array(v.object({
      name: v.optional(v.string()),
      role: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      linkedin_url: v.optional(v.string()),
    })),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    
    // Get existing stakeholders for this university to avoid duplicates
    const existingStakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();

    for (const st of args.stakeholders) {
      // Match on email (most reliable) OR name — NOT role alone.
      // FIX: role-only match removed: two different people can hold e.g. "Registrar" at the same university.
      const match = existingStakeholders.find((e) => {
        if (st.email && e.email && e.email.toLowerCase() === st.email.toLowerCase()) return true;
        if (st.name && e.name && e.name.toLowerCase() === st.name.toLowerCase()) return true;
        return false;
      });

      if (match) {
        // Prefer NEW enrichment data over old — this fills in missing emails/phones from re-enrichment
        await ctx.db.patch(match._id, {
          name: st.name || match.name,
          role: st.role || match.role,
          email: st.email || match.email,
          phone: st.phone || match.phone,
          linkedin_url: st.linkedin_url || match.linkedin_url,
          source: args.source || match.source || "deep_enrichment",
        });
      } else {
        // Insert new
        await ctx.db.insert("stakeholders", {
          university_id: args.university_id,
          name: st.name,
          role: st.role,
          email: st.email,
          phone: st.phone,
          linkedin_url: st.linkedin_url,
          is_primary: false,
          source: args.source || "deep_enrichment",
          created_at: now,
        });
      }
    }
  },
});

export const getByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});

export const updateLinkedinInternal = internalMutation({
  args: {
    id: v.id("stakeholders"),
    linkedin_url: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { linkedin_url: args.linkedin_url });
  },
});

export const getByIdInternal = internalQuery({
  args: { id: v.id("stakeholders") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stakeholders")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});
