"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

const TEST_UNIVERSITY_IDS: Id<"universities">[] = [
  "kn7d6jf90vx2kkr7smj132she58a03k3" as Id<"universities">, // Jamia Hamdard
  "kn716mcyxv86myn9hey3c6149h8a0beg" as Id<"universities">, // Gondwana University
  "kn7fr7xj19amm8wb022nm9kce58a1r9j" as Id<"universities">, // Indian Institute of Heritage
];

/**
 * Clean up stale/duplicate stakeholder records across universities:
 * - `scope: "test"` targets Jamia Hamdard, Gondwana University, Indian
 *   Institute of Heritage (our verified re-enrichment set).
 * - `scope: "all-enriched"` targets universities with
 *   `enrichment_phase = "completed"`, processed in batches of `limit`.
 * Always run with `dryRun: true` first; the mutation returns full deleted-row
 * JSON so any row can be restored from the logs if needed.
 */
export const cleanupStakeholders = internalAction({
  args: {
    universityIds: v.optional(v.array(v.string())),
    scope: v.optional(v.union(v.literal("test"), v.literal("all-enriched"))),
    dryRun: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const limit = args.limit ?? 50;

    let universityIds: Id<"universities">[] = [];
    if (args.universityIds && args.universityIds.length > 0) {
      universityIds = args.universityIds as Id<"universities">[];
    } else if (args.scope === "test") {
      universityIds = TEST_UNIVERSITY_IDS;
    } else if (args.scope === "all-enriched") {
      const all = await ctx.runQuery(internal.universities.listAllInternal);
      universityIds = all
        .filter(
          (u) =>
            u.outreach_stage === "enriched" ||
            u.enrichment_phase === "completed",
        )
        .slice(0, limit)
        .map((u) => u._id);
    } else {
      throw new Error(
        "Provide universityIds, scope='test', or scope='all-enriched'",
      );
    }

    const rows: Array<Record<string, unknown>> = [];
    let totalDeleted = 0;
    let totalStripped = 0;
    let totalBackfilled = 0;
    const errors: string[] = [];

    for (const universityId of universityIds) {
      try {
        const result = await ctx.runMutation(
          internal.stakeholders.cleanupStakeholdersInternal,
          { university_id: universityId, dryRun },
        );
        totalDeleted += result.deleted;
        totalStripped += result.stripped;
        totalBackfilled += result.backfilled;
        rows.push({
          university_id: result.university_id,
          university_name: result.university_name,
          rows: result.rows,
          deleted: result.deleted,
          stripped: result.stripped,
          backfilled: result.backfilled,
          deletedRows: result.deletedRows,
          backfillDetails: result.backfillDetails,
        });
      } catch (e) {
        errors.push(
          `${universityId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return {
      dryRun,
      universities: rows.length,
      totalDeleted,
      totalStripped,
      totalBackfilled,
      errors,
      rows,
    };
  },
});
