"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

export const listUniversities = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    Array<{
      _id: string;
      name: string;
      stage: string | null;
      website: string | null;
      city: string | null;
      state: string | null;
    }>
  > => {
    const all: Doc<"universities">[] = await ctx.runQuery(
      internal.universities.listAllInternal,
    );
    return all.map((u) => ({
      _id: u._id as string,
      name: u.university_name,
      stage: u.outreach_stage ?? null,
      website: u.website ?? null,
      city: u.city ?? null,
      state: u.state ?? null,
    }));
  },
});
