import { internalQuery, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getFirstUni = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("universities").first();
  },
});

export const testScore = internalAction({
  args: { universityId: v.id("universities") },
  handler: async (ctx, args): Promise<unknown> => {
    return await ctx.runAction(api.actions.scoring.scoreUniversity, {
      universityId: args.universityId,
    });
  },
});
