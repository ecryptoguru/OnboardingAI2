import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});

export const insert = mutation({
  args: {
    university_id: v.id("universities"),
    signal_type: v.union(
      v.literal("news"),
      v.literal("linkedin"),
      v.literal("website"),
      v.literal("manual"),
      v.literal("image"),
      v.literal("source")
    ),
    content: v.string(),
    source_url: v.optional(v.string()),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db.insert("universitySignals", {
      ...args,
      created_at: Date.now(),
    });
  },
});

export const vectorSearch = action({
  args: {
    embedding: v.array(v.float64()),
    university_id: v.optional(v.id("universities")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const universityId = args.university_id;
    return await ctx.vectorSearch("universitySignals", "by_embedding", {
      vector: args.embedding,
      filter: universityId ? (q) => q.eq("university_id", universityId) : undefined,
      limit: args.limit ?? 10,
    });
  },
});

export const insertInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    signal_type: v.union(
      v.literal("news"),
      v.literal("linkedin"),
      v.literal("website"),
      v.literal("manual"),
      v.literal("image"),
      v.literal("source")
    ),
    content: v.string(),
    source_url: v.optional(v.string()),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("universitySignals", {
      ...args,
      created_at: Date.now(),
    });
  },
});

export const listByUniversityInternal = internalQuery({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();
  },
});
export const batchInsertInternal = internalMutation({
  args: {
    signals: v.array(
      v.object({
        university_id: v.id("universities"),
        signal_type: v.union(
          v.literal("news"),
          v.literal("linkedin"),
          v.literal("website"),
          v.literal("manual"),
          v.literal("image"),
          v.literal("source")
        ),
        content: v.string(),
        source_url: v.optional(v.string()),
        embedding: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const ids = [];
    for (const s of args.signals) {
      const id = await ctx.db.insert("universitySignals", {
        ...s,
        created_at: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const deleteByTypeInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    signal_types: v.array(v.union(
      v.literal("news"),
      v.literal("linkedin"),
      v.literal("website"),
      v.literal("manual"),
      v.literal("image"),
      v.literal("source")
    )),
  },
  handler: async (ctx, args) => {
    const existingSignals = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) => q.eq("university_id", args.university_id))
      .collect();

    for (const signal of existingSignals) {
      if (args.signal_types.includes(signal.signal_type as any)) {
        await ctx.db.delete(signal._id);
      }
    }
  }
});
