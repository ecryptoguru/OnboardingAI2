"use node";

import {
  action,
  internalAction,
  type ActionCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { validateAuth } from "../lib/auth_utils";
import { INSTITUTES_OF_NATIONAL_IMPORTANCE } from "../lib/institutesOfNationalImportance";
import { normalizeState } from "../lib/universityUtils";
import type { Doc, Id } from "../_generated/dataModel";

export type InstituteOfNationalImportance =
  (typeof INSTITUTES_OF_NATIONAL_IMPORTANCE)[number];

type CuratedInstitute = InstituteOfNationalImportance & {
  type: "INI";
  data_source: "curated";
};

type CuratedUpdate = CuratedInstitute & {
  id: Id<"universities">;
  website_status: "valid" | "pending";
};

type SyncResult = {
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
};

function normalizeUrlDomain(url: string | undefined): string | null {
  if (!url) return null;
  let cleaned = url.trim().toLowerCase();
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  try {
    const u = new URL(cleaned);
    let host = u.hostname;
    if (host.startsWith("www.")) {
      host = host.slice(4);
    }
    return host;
  } catch {
    return null;
  }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreMatch(
  institute: InstituteOfNationalImportance,
  record: Doc<"universities">,
): number {
  // Never reuse a curated record that already represents a different institute.
  if (record.data_source === "curated" && record.university_name) {
    if (normalizeName(record.university_name) !== normalizeName(institute.university_name)) {
      return 0;
    }
  }

  if (
    record.state &&
    normalizeState(record.state) !== normalizeState(institute.state)
  ) {
    return 0;
  }

  if (normalizeName(record.university_name) === normalizeName(institute.university_name)) {
    return 100;
  }

  const instituteDomain = normalizeUrlDomain(institute.website);
  const recordDomain = normalizeUrlDomain(record.website);
  if (instituteDomain && recordDomain && instituteDomain === recordDomain) {
    return 90;
  }

  return 0;
}

function findBestMatch(
  institute: InstituteOfNationalImportance,
  existing: Doc<"universities">[],
): { record: Doc<"universities">; score: number } | null {
  let best: { record: Doc<"universities">; score: number } | null = null;
  for (const record of existing) {
    const score = scoreMatch(institute, record);
    if (score > (best?.score ?? 0)) {
      best = { record, score };
    }
  }
  return best;
}

async function doSync(ctx: ActionCtx): Promise<SyncResult> {
  const existingUniversities: Doc<"universities">[] = await ctx.runQuery(
    internal.universities.listAllInternal,
    {},
  );
  console.log(
    `Seeding INIs over ${existingUniversities.length} existing universities.`,
  );

  const inserts: CuratedInstitute[] = [];
  const updates: CuratedUpdate[] = [];
  let skippedCount = 0;

  for (const institute of INSTITUTES_OF_NATIONAL_IMPORTANCE) {
    const best = findBestMatch(institute, existingUniversities);

    if (best && best.score >= 80) {
      const record = best.record;
      const expectedWebsiteStatus = institute.website ? "valid" : "pending";
      const needsWebsiteStatusFix =
        institute.website &&
        record.website_status !== "valid" &&
        (record.website_status === "pending" ||
          record.website_status === "discovered_weak" ||
          record.website_status === undefined);
      const hasDifferences =
        normalizeName(record.university_name) !==
          normalizeName(institute.university_name) ||
        normalizeState(record.state) !== normalizeState(institute.state) ||
        record.city?.trim().toLowerCase() !==
          institute.city?.trim().toLowerCase() ||
        normalizeUrlDomain(record.website) !==
          normalizeUrlDomain(institute.website) ||
        record.established_year !== institute.established_year ||
        record.type !== "INI" ||
        record.category !== institute.category ||
        record.data_source !== "curated" ||
        needsWebsiteStatusFix;

      if (record.data_source === "curated" && !hasDifferences) {
        console.log(`Already curated: ${institute.university_name}`);
        skippedCount++;
        continue;
      }

      updates.push({
        id: record._id as Id<"universities">,
        ...institute,
        type: "INI",
        data_source: "curated",
        website_status: expectedWebsiteStatus,
      });
    } else {
      inserts.push({
        ...institute,
        type: "INI",
        data_source: "curated",
      });
    }
  }

  console.log(
    `Prepared ${inserts.length} inserts, ${updates.length} updates.`,
  );

  const BATCH_SIZE = 50;
  let totalAdded = 0;
  let totalUpdated = 0;

  for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
    const batch = inserts.slice(i, i + BATCH_SIZE);
    const result = await ctx.runMutation(
      internal.universities.bulkSyncCuratedInternal,
      { inserts: batch, updates: [] },
    );
    totalAdded += result.addedCount;
    console.log(`Batch insert ${i / BATCH_SIZE + 1}: +${result.addedCount}`);
  }

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const result = await ctx.runMutation(
      internal.universities.bulkSyncCuratedInternal,
      { inserts: [], updates: batch },
    );
    totalUpdated += result.updatedCount;
    console.log(`Batch update ${i / BATCH_SIZE + 1}: +${result.updatedCount}`);
  }

  console.log(
    `INI seed complete. Added ${totalAdded}, Updated ${totalUpdated}, Skipped ${skippedCount}.`,
  );
  return { addedCount: totalAdded, updatedCount: totalUpdated, skippedCount };
}

export const syncInstitutesOfNationalImportance = action({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    await validateAuth(ctx);
    return await doSync(ctx);
  },
});

export const syncInstitutesOfNationalImportanceInternal = internalAction({
  args: {},
  handler: async (ctx): Promise<SyncResult> => {
    return await doSync(ctx);
  },
});

export { normalizeName, normalizeUrlDomain, scoreMatch };
