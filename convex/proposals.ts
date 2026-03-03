import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const proposals = await ctx.db.query("proposals").order("desc").collect();
    return await Promise.all(
      proposals.map(async (p) => {
        const uni = await ctx.db.get(p.university_id);
        return { ...p, university_name: uni?.university_name ?? "Unknown" };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const create = mutation({
  args: {
    university_id: v.id("universities"),
    meeting_date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const now = Date.now();
    return await ctx.db.insert("proposals", {
      ...args,
      status: "draft",
      created_at: now,
      updated_at: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("proposals"),
    agenda: v.optional(v.string()),
    proposal_json: v.optional(v.string()),
    recommended_modules: v.optional(v.array(v.string())),
    pdf_storage_id: v.optional(v.id("_storage")),
    status: v.optional(v.union(
      v.literal("draft"), v.literal("ready"), v.literal("sent")
    )),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updated_at: Date.now() });
  },
});

export const getInternal = internalQuery({
  args: { id: v.id("proposals") },
  handler: async (ctx, args) => ctx.db.get(args.id),
});

export const updateInternal = internalMutation({
  args: {
    id: v.id("proposals"),
    agenda: v.optional(v.string()),
    proposal_json: v.optional(v.string()),
    recommended_modules: v.optional(v.array(v.string())),
    pdf_storage_id: v.optional(v.id("_storage")),
    status: v.optional(v.union(
      v.literal("draft"), v.literal("ready"), v.literal("sent")
    )),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updated_at: Date.now() });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const cleanupOldProposalsInternal = internalMutation({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const threshold = Date.now() - args.days * 24 * 60 * 60 * 1000;
    const oldProposals = await ctx.db
      .query("proposals")
      .filter((q) => q.lt(q.field("created_at"), threshold))
      .collect();

    let deletedCount = 0;
    for (const p of oldProposals) {
      if (p.pdf_storage_id) {
        await ctx.storage.delete(p.pdf_storage_id);
      }
      await ctx.db.delete(p._id);
      deletedCount++;
    }
    return { deleted: deletedCount };
  },
});
