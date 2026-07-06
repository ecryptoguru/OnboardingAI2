import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateAdmin } from "./lib/auth_utils";

export const resetUniversityEnrichment = mutation({
  args: { nameKeyword: v.string() },
  handler: async (ctx, args) => {
    await validateAdmin(ctx);
    // 1. Find university by name search (use search index, not full table scan)
    const matches = await ctx.db
      .query("universities")
      .withSearchIndex("search_name", (q) =>
        q.search("university_name", args.nameKeyword),
      )
      .take(10);
    const uni = matches.find((u) =>
      u.university_name.toLowerCase().includes(args.nameKeyword.toLowerCase()),
    );

    if (!uni) return "University not found";

    // 2. Clear demographics, scores, and stage
    await ctx.db.patch(uni._id, {
      demographics: undefined,
      outreach_stage: "new",
      updated_at: Date.now() - 31 * 24 * 60 * 60 * 1000, // Reset to 31 days ago to bypass 30 day limit
    });

    // 3. Delete stakeholders
    const stakeholders = await ctx.db
      .query("stakeholders")
      .withIndex("by_university", (q) => q.eq("university_id", uni._id))
      .collect();

    for (const s of stakeholders) {
      await ctx.db.delete(s._id);
    }

    return `Reset enrichment data for ${uni.university_name} (${stakeholders.length} stakeholders deleted)`;
  },
});
