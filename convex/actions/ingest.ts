"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import Papa from "papaparse";
import * as Sentry from "@sentry/nextjs";

export const parseCsv = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<{ count: number }> => {
    try {
    const fileUrl = await ctx.storage.getUrl(args.storageId);
    if (!fileUrl) throw new Error("File not found");

    const response = await fetch(fileUrl);
    const text = await response.text();

    const result = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
    });

    if (result.errors.length > 0) {
      console.error("CSV Parse Errors:", result.errors);
      throw new Error("Failed to parse CSV file");
    }

    const rows = result.data.map((row: any) => ({
      university_name: row.university_name || row.Name || row.University || "Unknown University",
      state: row.state || row.State || "",
      city: row.city || row.City || "",
      website: row.website || row.Website || "",
      student_count: parseInt(row.student_count || row.Students || "0", 10),
      type: row.type || row.Type || "",
      naac_grade: row.naac_grade || row.NAAC || "",
    }));

    // Bulk insert into the DB
    const ids = await ctx.runMutation(api.universities.bulkInsert, { rows });
    return { count: ids.length };
    } catch (e) {
      console.error("[Ingest] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { storageId: args.storageId },
      });
      throw e;
    }
  },
});
