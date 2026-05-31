import {
  action,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";

/**
 * Distributed rate limiter backed by Convex.
 * Replaces in-memory Map limiters that fail in serverless environments.
 */

export const checkRateLimitMutation = mutation({
  args: {
    key: v.string(),
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> => {
    await validateAuth(ctx);
    const now = Date.now();
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!record || now > record.resetAt) {
      if (record) {
        await ctx.db.patch(record._id, {
          count: 1,
          resetAt: now + args.windowMs,
        });
      } else {
        await ctx.db.insert("rateLimits", {
          key: args.key,
          count: 1,
          resetAt: now + args.windowMs,
        });
      }
      return { allowed: true, remaining: args.maxRequests - 1 };
    }

    if (record.count >= args.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      };
    }

    await ctx.db.patch(record._id, { count: record.count + 1 });
    return { allowed: true, remaining: args.maxRequests - record.count - 1 };
  },
});

export const checkRateLimit = action({
  args: {
    key: v.string(), // e.g., "ugc_sync:<ip>"
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> => {
    const now = Date.now();
    const record = await ctx.runQuery(internal.rateLimits.getByKey, {
      key: args.key,
    });

    if (!record) {
      await ctx.runMutation(internal.rateLimits.upsert, {
        key: args.key,
        count: 1,
        resetAt: now + args.windowMs,
      });
      return { allowed: true, remaining: args.maxRequests - 1 };
    }

    if (now > record.resetAt) {
      await ctx.runMutation(internal.rateLimits.upsert, {
        key: args.key,
        count: 1,
        resetAt: now + args.windowMs,
      });
      return { allowed: true, remaining: args.maxRequests - 1 };
    }

    if (record.count >= args.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      };
    }

    await ctx.runMutation(internal.rateLimits.increment, {
      key: args.key,
    });
    return { allowed: true, remaining: args.maxRequests - record.count - 1 };
  },
});

export const getByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
  },
});

export const upsert = internalMutation({
  args: {
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: args.count,
        resetAt: args.resetAt,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        key: args.key,
        count: args.count,
        resetAt: args.resetAt,
      });
    }
  },
});

export const increment = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        count: existing.count + 1,
      });
    }
  },
});

export const checkRateLimitInternal = internalMutation({
  args: {
    key: v.string(),
    windowMs: v.number(),
    maxRequests: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> => {
    const now = Date.now();
    const record = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (!record || now > record.resetAt) {
      if (record) {
        await ctx.db.patch(record._id, {
          count: 1,
          resetAt: now + args.windowMs,
        });
      } else {
        await ctx.db.insert("rateLimits", {
          key: args.key,
          count: 1,
          resetAt: now + args.windowMs,
        });
      }
      return { allowed: true, remaining: args.maxRequests - 1 };
    }

    if (record.count >= args.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((record.resetAt - now) / 1000),
      };
    }

    await ctx.db.patch(record._id, { count: record.count + 1 });
    return { allowed: true, remaining: args.maxRequests - record.count - 1 };
  },
});
