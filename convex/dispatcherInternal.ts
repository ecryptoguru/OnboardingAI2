import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

export const WEBSITE_STATUSES = [
  "pending",
  "valid",
  "invalid",
  "discovered",
  "discovered_weak",
] as const;

export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const WEBSITE_VALIDATION_ARGS = {
  limit: v.optional(v.number()),
  status: v.optional(
    v.union(
      v.literal("all"),
      ...WEBSITE_STATUSES.map((s) => v.literal(s)),
    ),
  ),
  cursor: v.optional(v.id("universities")),
};

type DispatchResult = { scheduled: number; statuses: WebsiteStatus[]; firstId?: string };

export async function scheduleWebsiteValidation(
  ctx: MutationCtx,
  args: { limit?: number; status?: "all" | WebsiteStatus; cursor?: string },
): Promise<DispatchResult> {
  const requested = args.status ?? "pending";
  const statuses: WebsiteStatus[] =
    requested === "all"
      ? (["pending", "invalid", "discovered", "discovered_weak"] as WebsiteStatus[])
      : [requested];

  const limit = args.limit ?? 20;
  const universities: Doc<"universities">[] = [];

  for (const status of statuses) {
    const remaining = Math.max(0, limit - universities.length);
    if (remaining === 0) break;
    let q = ctx.db
      .query("universities")
      .withIndex("by_website_status", (q) => q.eq("website_status", status));
    if (args.cursor) {
      q = q.filter((q) => q.gt(q.field("_id"), args.cursor as Id<"universities">));
    }
    const batch = await q.take(remaining);
    universities.push(...batch);
  }

  let delayMs = 0;
  const staggerMs = 500;

  function isPlaceholderWebsite(url?: string): boolean {
    if (!url) return true;
    const trimmed = url.trim().toLowerCase();
    return ["null", "none", "n/a", "na", "-", "--", "~"].includes(trimmed);
  }

  for (const uni of universities) {
    // Re-validate any stored URL with fetch/Jina. Only run heuristic discovery
    // when there is no URL to validate (no Serper / Gemini involved).
    if (uni.website && !isPlaceholderWebsite(uni.website)) {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.actions.discovery.validateWebsite,
        {
          universityId: uni._id,
          website: uni.website,
          universityName: uni.university_name,
        },
      );
    } else {
      await ctx.scheduler.runAfter(
        delayMs,
        internal.actions.discovery.discoverWebsite,
        {
          universityId: uni._id,
          universityName: uni.university_name,
        },
      );
    }
    delayMs += staggerMs;
  }

  return {
    scheduled: universities.length,
    statuses,
    firstId: universities[0]?._id,
  };
}

export const dispatchWebsiteValidationInternal = internalMutation({
  args: WEBSITE_VALIDATION_ARGS,
  handler: async (ctx, args): Promise<DispatchResult> => {
    return await scheduleWebsiteValidation(ctx, args);
  },
});
