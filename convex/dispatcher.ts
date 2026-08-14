import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAuth } from "./lib/auth_utils";
import {
  scheduleWebsiteValidation,
  WEBSITE_STATUSES,
} from "./dispatcherInternal";

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
    return await scheduleWebsiteValidation(ctx, args);
  },
});
