import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    // Latest unacknowledged alerts, newest first.
    return await ctx.db
      .query("apiAlerts")
      .withIndex("by_created_at", (q) => q.gt("created_at", 0))
      .order("desc")
      .take(50);
  },
});

export const acknowledge = mutation({
  args: { id: v.id("apiAlerts") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await ctx.db.patch(args.id, { acknowledged_at: Date.now() });
    return { success: true };
  },
});

export const acknowledgeAll = mutation({
  args: {},
  handler: async (ctx) => {
    await validateAuth(ctx);
    const recent = await ctx.db
      .query("apiAlerts")
      .withIndex("by_created_at", (q) => q.gt("created_at", 0))
      .order("desc")
      .take(100);
    const unacked = recent.filter((a) => a.acknowledged_at === undefined);
    const now = Date.now();
    for (const alert of unacked) {
      await ctx.db.patch(alert._id, { acknowledged_at: now });
    }
    return { success: true, acknowledged: unacked.length };
  },
});

export const removeInternal = internalMutation({
  args: { id: v.id("apiAlerts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const recordInternal = internalMutation({
  args: {
    api: v.union(v.literal("gemini"), v.literal("firecrawl"), v.literal("serper")),
    severity: v.union(v.literal("warning"), v.literal("critical")),
    message: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Skip if an identical, unacknowledged alert for the same API already
    // exists — avoids alert spam from repeated quota errors in one run.
    const recent = await ctx.db
      .query("apiAlerts")
      .withIndex("by_created_at", (q) => q.gt("created_at", 0))
      .order("desc")
      .take(50);
    const dup = recent.some(
      (a) =>
        a.api === args.api &&
        a.message === args.message &&
        Date.now() - a.created_at < 6 * 60 * 60 * 1000,
    );
    if (dup) return { success: true, inserted: false };
    await ctx.db.insert("apiAlerts", {
      api: args.api,
      severity: args.severity,
      message: args.message,
      context: args.context,
      created_at: Date.now(),
    });
    return { success: true, inserted: true };
  },
});
