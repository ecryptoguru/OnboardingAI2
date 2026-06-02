import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/**
 * Exact-match duplicate removal for universities.
 * Groups by normalized name (trim + lowercase) and keeps the richest record.
 * Previously used fuzzy matching but it was too aggressive and deleted
 * genuine universities (e.g. different JNTU campuses).
 *
 * Implemented as an action (30s timeout) instead of a mutation (1s timeout)
 * because scanning the full dataset can be slow. Writes are delegated to
 * internal mutations.
 */
export const removeFuzzyDuplicates = action({
  args: {},
  handler: async (ctx): Promise<{
    success: boolean;
    deletedCount: number;
    mergedCount: number;
    groupsFound: number;
  }> => {
    const universities: Doc<"universities">[] = await ctx.runQuery(
      internal.universities.listAllInternal,
      {}
    );

    // Group by EXACT normalized (name, state) pair.
    // Universities with the same name in different states are legitimate
    // separate institutions (e.g. Amity University in UP vs Rajasthan).
    const nameMap = new Map<string, Doc<"universities">[]>();
    for (const u of universities) {
      const key = (
        u.university_name.trim().toLowerCase().replace(/\s+/g, " ") +
        "|" +
        (u.state || "").trim().toLowerCase()
      );
      const list = nameMap.get(key) ?? [];
      list.push(u);
      nameMap.set(key, list);
    }

    const groups: Doc<"universities">[][] = [];
    for (const [, list] of nameMap.entries()) {
      if (list.length > 1) {
        groups.push(list);
      }
    }

    let deletedCount = 0;
    let mergedCount = 0;

    for (const group of groups) {
      // Pick the "richest" record to keep
      const scored = group.map((u) => {
        let score = 0;
        if (u.ugc_status) score += 10;
        if (u.website) score += 5;
        if (u.address) score += 3;
        if (u.vc_name) score += 2;
        if (u.registrar_name) score += 2;
        if (u.type && u.type !== "Other") score += 1;
        if (u.student_count) score += 1;
        return { uni: u, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const keeper = scored[0].uni;
      const victims = scored.slice(1).map((s) => s.uni);

      // Merge any valuable missing fields from victims into keeper
      const updates: Record<string, unknown> = {};
      for (const victim of victims) {
        if (!keeper.ugc_status && victim.ugc_status) {
          updates.ugc_status = victim.ugc_status;
        }
        if (!keeper.website && victim.website) {
          updates.website = victim.website;
          updates.website_status = victim.website_status ?? "pending";
        }
        if (!keeper.address && victim.address) updates.address = victim.address;
        if (!keeper.zip_code && victim.zip_code) updates.zip_code = victim.zip_code;
        if (!keeper.vc_name && victim.vc_name) updates.vc_name = victim.vc_name;
        if (!keeper.registrar_name && victim.registrar_name) {
          updates.registrar_name = victim.registrar_name;
        }
        if (!keeper.type && victim.type) updates.type = victim.type;
        if (!keeper.state && victim.state) updates.state = victim.state;
        if (!keeper.city && victim.city) updates.city = victim.city;
      }

      if (Object.keys(updates).length > 0) {
        await ctx.runMutation(internal.universities.patchInternal, {
          id: keeper._id,
          fields: { ...updates, updated_at: Date.now() },
        });
        mergedCount++;
      }

      for (const victim of victims) {
        await ctx.runMutation(internal.universities.deleteInternal, {
          id: victim._id,
        });
        deletedCount++;
      }
    }

    return { success: true, deletedCount, mergedCount, groupsFound: groups.length };
  },
});


