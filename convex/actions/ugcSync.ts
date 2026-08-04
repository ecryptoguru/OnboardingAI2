"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { validateAuth } from "../lib/auth_utils";
import { normalizeState } from "../lib/universityUtils";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Strict matching for UGC sync. Much more conservative than namesMatch()
 * to avoid false positives that swallow genuinely missing universities.
 *
 * Rules (in order):
 * 1. Exact normalized-name match
 * 2. Substring match with >=70% length overlap
 * 3. Acronym match (3+ chars, as standalone token)
 * 4. >=3 shared distinctive non-stopword tokens
 */
function strictMatch(ugcName: string, dbName: string): boolean {
  const na = ugcName.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = dbName.toLowerCase().replace(/\s+/g, " ").trim();

  if (na === nb) return true;

  // Substring with substantial overlap
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    if (shorter.length / longer.length >= 0.7) return true;
  }

  // Acronym check (3+ chars, must appear as standalone token)
  const getAcronym = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !["university", "college", "of", "the", "and", "institute", "institution"].includes(w),
      )
      .map((w) => w[0])
      .join("");

  const acrA = getAcronym(ugcName);
  const acrB = getAcronym(dbName);

  if (acrA.length >= 3) {
    const tokensB = nb.split(/\s+/);
    if (tokensB.some((t) => t === acrA)) return true;
  }
  if (acrB.length >= 3) {
    const tokensA = na.split(/\s+/);
    if (tokensA.some((t) => t === acrB)) return true;
  }

  // Token overlap: require >=3 shared distinctive tokens
  const stopWords = new Set([
    "university", "college", "of", "the", "and",
    "institute", "institution", "technology", "science", "sciences",
    "engineering", "management", "studies", "research", "arts",
    "national", "indian", "state", "private", "public", "international",
    "global", "deemed", "central", "technical",
  ]);

  const tokensA = na.split(/\s+/).filter((t) => t.length > 2 && !stopWords.has(t));
  const tokensB = nb.split(/\s+/).filter((t) => t.length > 2 && !stopWords.has(t));

  const shared = tokensA.filter((t) => tokensB.includes(t));
  if (shared.length >= 3) return true;

  // Or 2 shared where at least one is >=5 chars
  if (shared.length === 2 && shared.some((t) => t.length >= 5)) return true;

  return false;
}

export const syncUgcData = action({
  args: {
    universities: v.array(
      v.object({
        university_name: v.string(),
        state: v.string(),
        city: v.optional(v.string()),
        website: v.optional(v.string()),
        type: v.optional(v.string()),
        address: v.optional(v.string()),
        zip_code: v.optional(v.string()),
        ugc_status: v.optional(v.string()),
        vc_name: v.optional(v.string()),
        registrar_name: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ addedCount: number; updatedCount: number }> => {
    await validateAuth(ctx);
    console.log(`Starting UGC sync with ${args.universities.length} universities...`);

    // Fetch all existing universities for in-memory fuzzy matching
    const existingUniversities: Doc<"universities">[] = await ctx.runQuery(
      internal.universities.listAllInternal,
      {},
    );
    console.log(`Found ${existingUniversities.length} existing universities.`);

    // Build state-indexed map for O(1) candidate lookup
    const stateMap = new Map<string, Doc<"universities">[]>();
    for (const record of existingUniversities) {
      const key = normalizeState(record.state) ?? "unknown";
      const list = stateMap.get(key) ?? [];
      list.push(record);
      stateMap.set(key, list);
    }

    const inserts: {
      university_name: string;
      state: string;
      city?: string;
      website?: string;
      type?: string;
      address?: string;
      zip_code?: string;
      ugc_status?: string;
      vc_name?: string;
      registrar_name?: string;
    }[] = [];

    const updates: {
      id: Id<"universities">;
      website?: string;
      type?: string;
      state?: string;
      address?: string;
      zip_code?: string;
      ugc_status?: string;
    }[] = [];

    // Pre-deduplicate UGC input by exact (name, state) pair.
    // The UGC API itself has ~43 duplicate names. Keeping only the
    // richest record per (name, state) prevents creating DB duplicates.
    const ugcDedupMap = new Map<string, typeof args.universities[0]>();
    for (const uni of args.universities) {
      const key = (uni.university_name.trim().toLowerCase() + "|" + (normalizeState(uni.state) ?? "unknown"));
      const existing = ugcDedupMap.get(key);
      if (!existing) {
        ugcDedupMap.set(key, uni);
      } else {
        // Keep the richer record (more fields populated)
        const score = (u: typeof uni) =>
          (u.website ? 1 : 0) + (u.address ? 1 : 0) + (u.ugc_status ? 1 : 0) +
          (u.zip_code ? 1 : 0) + (u.vc_name ? 1 : 0) + (u.registrar_name ? 1 : 0);
        if (score(uni) > score(existing)) {
          ugcDedupMap.set(key, uni);
        }
      }
    }
    const dedupedUniversities = Array.from(ugcDedupMap.values());
    console.log(`Deduplicated UGC input: ${args.universities.length} → ${dedupedUniversities.length}`);

    for (const uni of dedupedUniversities) {
      // Normalize type if provided by caller. Do NOT default to "Other" here —
      // defaulting to "Other" would overwrite the existing type on every sync.
      let normalizedType: string | undefined = uni.type;
      if (normalizedType && normalizedType.includes("Deemed")) {
        normalizedType = "Deemed";
      }
      // NOTE: we intentionally do NOT mutate uni.type here to avoid a side
      // effect on the caller's input array. We use normalizedType below.

      const stateKey = normalizeState(uni.state) ?? "unknown";
      const candidates = stateMap.get(stateKey) ?? [];
      const matched: Doc<"universities">[] = [];

      for (const record of candidates) {
        if (strictMatch(uni.university_name, record.university_name)) {
          matched.push(record);
        }
      }

      if (matched.length === 0) {
        // New inserts: fall back to "Other" if the UGC source provided no type
        inserts.push({ ...uni, type: normalizedType || "Other" });
      } else {
        for (const record of matched) {
          // Never overwrite records that came from the curated INI seed.
          if (record.data_source === "curated") {
            console.log(
              `Skipping curated record: ${record.university_name}`,
            );
            continue;
          }

          const normalizeStr = (val: unknown) =>
            val ? String(val).trim() : undefined;

          const hasUpdates =
            (uni.website &&
              normalizeStr(record.website) !== normalizeStr(uni.website)) ||
            (normalizedType &&
              normalizeStr(record.type) !== normalizeStr(normalizedType)) ||
            (uni.state &&
              normalizeStr(record.state) !== normalizeStr(uni.state)) ||
            (uni.address &&
              normalizeStr(record.address) !== normalizeStr(uni.address)) ||
            (uni.zip_code &&
              normalizeStr(record.zip_code) !== normalizeStr(uni.zip_code)) ||
            (uni.ugc_status &&
              normalizeStr(record.ugc_status) !== normalizeStr(uni.ugc_status));

          if (hasUpdates) {
            updates.push({
              id: record._id as Id<"universities">,
              website: uni.website || record.website || undefined,
              type: normalizedType || record.type || undefined,
              state: uni.state || record.state || undefined,
              address: uni.address || record.address || undefined,
              zip_code: uni.zip_code || record.zip_code || undefined,
              ugc_status: uni.ugc_status || record.ugc_status || undefined,
            });
          }
        }
      }
    }

    console.log(`Prepared ${inserts.length} inserts, ${updates.length} updates.`);

    // Batch writes to avoid 1-second mutation timeout
    const BATCH_SIZE = 50;
    let totalAdded = 0;
    let totalUpdated = 0;

    for (let i = 0; i < inserts.length; i += BATCH_SIZE) {
      const batch = inserts.slice(i, i + BATCH_SIZE);
      const result = await ctx.runMutation(
        internal.universities.bulkSyncUgcInternal,
        { inserts: batch, updates: [] },
      );
      totalAdded += result.addedCount;
      console.log(`Batch insert ${i / BATCH_SIZE + 1}: +${result.addedCount}`);
    }

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const result = await ctx.runMutation(
        internal.universities.bulkSyncUgcInternal,
        { inserts: [], updates: batch },
      );
      totalUpdated += result.updatedCount;
      console.log(`Batch update ${i / BATCH_SIZE + 1}: +${result.updatedCount}`);
    }

    console.log(
      `Sync complete. Added ${totalAdded}, Updated ${totalUpdated}.`,
    );
    return { addedCount: totalAdded, updatedCount: totalUpdated };
  },
});
