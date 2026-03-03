import { query, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";

export const getFirstUni = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("universities").first();
  },
});

export const testScore = action({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runAction(api.actions.scoring.scoreUniversity, {
      universityId: args.universityId,
    });
  },
});
export const getSignals = query({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("universitySignals")
      .withIndex("by_university", (q) => q.eq("university_id", args.universityId))
      .collect();
  },
});
