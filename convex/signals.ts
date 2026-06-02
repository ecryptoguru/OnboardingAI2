import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listByUniversity = query({
  args: { university_id: v.id("universities") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    return await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
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
      filter: universityId
        ? (q) => q.eq("university_id", universityId)
        : undefined,
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
    ),
    content: v.string(),
    source_url: v.optional(v.string()),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();
    const isDup = existing.some(
      (s) =>
        s.signal_type === args.signal_type &&
        s.source_url === args.source_url &&
        s.source_url != null,
    );
    if (isDup) {
      return null;
    }
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
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
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
        ),
        content: v.string(),
        source_url: v.optional(v.string()),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    // Load existing signals for all universities in this batch once
    const universityIds = [
      ...new Set(args.signals.map((s) => s.university_id)),
    ];
    const existingByUni = new Map<string, typeof args.signals>();
    for (const uniId of universityIds) {
      const rows = await ctx.db
        .query("universitySignals")
        .withIndex("by_university", (q) => q.eq("university_id", uniId))
        .collect();
      existingByUni.set(uniId, rows as typeof args.signals);
    }

    const ids = [];
    for (const s of args.signals) {
      const existing = existingByUni.get(s.university_id) ?? [];
      const isDup = existing.some(
        (e) =>
          e.signal_type === s.signal_type &&
          e.source_url === s.source_url &&
          e.source_url != null,
      );
      if (isDup) continue;
      const id = await ctx.db.insert("universitySignals", {
        ...s,
        created_at: now,
      });
      ids.push(id);
      existing.push(s);
    }
    return ids;
  },
});

export const deleteByTypeInternal = internalMutation({
  args: {
    university_id: v.id("universities"),
    signal_types: v.array(
      v.union(
        v.literal("news"),
        v.literal("linkedin"),
        v.literal("website"),
        v.literal("manual"),
        v.literal("image"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const existingSignals = await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) =>
        q.eq("university_id", args.university_id),
      )
      .collect();

    for (const signal of existingSignals) {
      if (
        args.signal_types.includes(
          signal.signal_type as (typeof args.signal_types)[number],
        )
      ) {
        await ctx.db.delete(signal._id);
      }
    }
  },
});

// ─── Migration helpers ────────────────────────────────────────────────────────

/** Returns all signals (id + content only) — used by the embedding migration action. */
export const getAllForMigration = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("universitySignals").collect();
    return all.map((s) => ({ _id: s._id, content: s.content }));
  },
});

/** Patches the embedding field on a single signal record. */
export const updateEmbedding = internalMutation({
  args: {
    signalId: v.id("universitySignals"),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.signalId, { embedding: args.embedding });
  },
});
