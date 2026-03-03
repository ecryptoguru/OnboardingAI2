import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const dispatchWebsiteValidation = mutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Find universities that are 'pending' or 'invalid' to try validating or discovering
    const pending = await ctx.db
      .query("universities")
      .withIndex("by_website_status", (q) => q.eq("website_status", "pending"))
      .take(args.limit ?? 20);

    let delayMs = 0;
    const staggerMs = 500; // 500ms between each external ping

    for (const uni of pending) {
      if (uni.website) {
        // Schedule validation
        await ctx.scheduler.runAfter(delayMs, api.actions.discovery.validateWebsite, {
          universityId: uni._id,
          website: uni.website,
        });
      } else {
        // Schedule discovery
        await ctx.scheduler.runAfter(delayMs, api.actions.discovery.discoverWebsite, {
          universityId: uni._id,
          universityName: uni.university_name,
        });
      }
      delayMs += staggerMs;
    }

    return { scheduled: pending.length };
  },
});
