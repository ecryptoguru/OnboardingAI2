import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAdmin, validateAuth } from "./lib/auth_utils";
import {
  scheduleWebsiteValidation,
  WEBSITE_STATUSES,
} from "./dispatcherInternal";

const MAX_DISPATCH_LIMIT = 100;

export const dispatchWebsiteValidation = mutation({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("all"),
        ...WEBSITE_STATUSES.map((s) => v.literal(s)),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    await validateAdmin(ctx);
    // Cap the batch server-side so a single call can't sweep the whole DB
    // and schedule unbounded external fetches.
    const limit = Math.min(Math.max(1, Math.floor(args.limit ?? 20)), MAX_DISPATCH_LIMIT);
    return await scheduleWebsiteValidation(ctx, { ...args, limit });
  },
});
