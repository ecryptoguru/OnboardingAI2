import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_DAILY_BUDGET_USD = 50.0;

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function getMaxBudgetUsd(): number {
  // process.env is available in V8 isolates at call time, but the budget
  // is passed from the action layer (checkDailyBudget in lib/llm.ts) which
  // reads LLM_DAILY_BUDGET_USD and passes it via the maxBudgetUsd arg.
  return DEFAULT_DAILY_BUDGET_USD;
}

// ─── Budget Queries / Mutations ────────────────────────────────────────────

export const getBudgetInternal = internalQuery({
  args: { dateKey: v.optional(v.string()), maxBudgetUsd: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const dateKey = args.dateKey || getTodayKey();
    const effectiveBudget = args.maxBudgetUsd ?? getMaxBudgetUsd();
    const doc = await ctx.db
      .query("llmBudget")
      .withIndex("by_date", (q) => q.eq("dateKey", dateKey))
      .first();
    return {
      dateKey,
      totalCostUsd: doc?.totalCostUsd ?? 0,
      totalTokens: doc?.totalTokens ?? 0,
      maxBudgetUsd: effectiveBudget,
      withinBudget: (doc?.totalCostUsd ?? 0) < effectiveBudget,
    };
  },
});

export const incrementBudgetInternal = internalMutation({
  args: {
    dateKey: v.optional(v.string()),
    costUsd: v.number(),
    tokens: v.number(),
  },
  handler: async (ctx, args) => {
    const dateKey = args.dateKey || getTodayKey();
    const doc = await ctx.db
      .query("llmBudget")
      .withIndex("by_date", (q) => q.eq("dateKey", dateKey))
      .first();

    if (doc) {
      await ctx.db.patch(doc._id, {
        totalCostUsd: doc.totalCostUsd + args.costUsd,
        totalTokens: doc.totalTokens + args.tokens,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("llmBudget", {
        dateKey,
        totalCostUsd: args.costUsd,
        totalTokens: args.tokens,
        updatedAt: Date.now(),
      });
    }
  },
});

// ─── Cache Queries / Mutations ─────────────────────────────────────────────

export const getCacheEntryInternal = internalQuery({
  args: {
    promptHash: v.string(),
    model: v.string(),
    temperature: v.number(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("llmCache")
      .withIndex("by_hash_model_temp", (q) =>
        q
          .eq("promptHash", args.promptHash)
          .eq("model", args.model)
          .eq("temperature", args.temperature),
      )
      .first();

    if (!doc) return null;
    if (doc.expiresAt < Date.now()) {
      // Expired entries are lazily overwritten on next write;
      // queries cannot mutate, so we just return null here.
      return null;
    }
    return { response: doc.response, expiresAt: doc.expiresAt };
  },
});

export const setCacheEntryInternal = internalMutation({
  args: {
    promptHash: v.string(),
    model: v.string(),
    temperature: v.number(),
    response: v.string(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("llmCache")
      .withIndex("by_hash_model_temp", (q) =>
        q
          .eq("promptHash", args.promptHash)
          .eq("model", args.model)
          .eq("temperature", args.temperature),
      )
      .first();

    const ttl = 48 * 60 * 60 * 1000; // 48 hours default
    const expiresAt = args.expiresAt ?? Date.now() + ttl;

    if (existing) {
      await ctx.db.patch(existing._id, {
        response: args.response,
        expiresAt,
      });
    } else {
      await ctx.db.insert("llmCache", {
        promptHash: args.promptHash,
        model: args.model,
        temperature: args.temperature,
        response: args.response,
        expiresAt,
      });
    }
  },
});
