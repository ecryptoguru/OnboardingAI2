"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import { validateAuth } from "../lib/auth_utils";
import { MAX_BULK_INSERT_ROWS, MAX_CSV_BYTES, MAX_CSV_ROWS } from "../lib/limits";
import Papa from "papaparse";
import * as Sentry from "@sentry/node";

export const parseCsv = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<{ count: number; skipped: number }> => {
    await validateAuth(ctx);
    try {
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      if (!fileUrl) throw new ConvexError("File not found");

      const response = await fetch(fileUrl, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new ConvexError("Failed to fetch uploaded CSV");

      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_CSV_BYTES) {
        throw new ConvexError(
          `CSV exceeds the ${Math.floor(MAX_CSV_BYTES / (1024 * 1024))} MB size limit`,
        );
      }

      const text = await response.text();
      if (text.length > MAX_CSV_BYTES) {
        throw new ConvexError(
          `CSV exceeds the ${Math.floor(MAX_CSV_BYTES / (1024 * 1024))} MB size limit`,
        );
      }

      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      });

      if (result.errors.length > 0) {
        console.error("CSV Parse Errors:", result.errors);
        throw new ConvexError("Failed to parse CSV file");
      }

      const rows = (result.data as unknown[]).map((row) => {
        const r = row as Record<string, string>;
        return {
          university_name:
            r.university_name || r.Name || r.University || "Unknown University",
          state: r.state || r.State || "",
          city: r.city || r.City || "",
          website: r.website || r.Website || "",
          student_count: parseInt(r.student_count || r.Students || "0", 10),
          type: r.type || r.Type || "",
          naac_grade: r.naac_grade || r.NAAC || "",
        };
      });

      if (rows.length === 0) {
        throw new ConvexError("CSV contains no data rows");
      }
      if (rows.length > MAX_CSV_ROWS) {
        throw new ConvexError(
          `CSV has too many rows (max ${MAX_CSV_ROWS.toLocaleString()})`,
        );
      }

      // Bulk insert into the DB via an internal mutation (server-to-server).
      const insertResult = await ctx.runMutation(
        internal.universities.bulkInsertInternal,
        { rows: rows.slice(0, MAX_BULK_INSERT_ROWS) },
      );
      if (insertResult.skipped > 0) {
        console.log(`[Ingest] Skipped ${insertResult.skipped} duplicate universities.`);
      }
      return { count: insertResult.inserted, skipped: insertResult.skipped };
    } catch (e) {
      console.error("[Ingest] Fatal error:", e);
      Sentry.captureException(e, {
        extra: { storageId: args.storageId },
      });
      throw e;
    }
  },
});
