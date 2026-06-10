"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { embed } from "../lib/llm";
import * as Sentry from "@sentry/node";

const BATCH_SIZE = 20; // Process 20 signals at a time to stay within Convex action timeout

/**
 * One-time migration: re-embeds all universitySignals using gemini-embedding-001.
 * Safe to run multiple times — each run processes all signals.
 *
 * Run via: npx convex run actions/migrateEmbeddings:runMigration
 */
export const runMigration = action({
  args: {},
  handler: async (ctx): Promise<{ migrated: number; failed: number; total: number }> => {
    console.log("[EmbeddingMigration] Starting migration to gemini-embedding-001...");

    // Fetch all signals
    const allSignals: { _id: Id<"universitySignals">; content: string }[] = await ctx.runQuery(internal.signals.getAllForMigration);
    const total = allSignals.length;
    console.log(`[EmbeddingMigration] Found ${total} signals to re-embed.`);

    // Fetch dynamic API key
    const apiKey = await ctx.runQuery(internal.settings.getInternalGeminiKey);

    let migrated = 0;
    let failed = 0;

    // Process in batches to avoid hitting Convex action limits
    for (let i = 0; i < allSignals.length; i += BATCH_SIZE) {
      const batch = allSignals.slice(i, i + BATCH_SIZE);
      console.log(`[EmbeddingMigration] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (signals ${i + 1}–${Math.min(i + BATCH_SIZE, total)})...`);

      await Promise.all(
        batch.map(async (signal) => {
          try {
            const newEmbedding = await embed(signal.content, apiKey);
            await ctx.runMutation(internal.signals.updateEmbedding, {
              signalId: signal._id,
              embedding: newEmbedding,
            });
            migrated++;
          } catch (e) {
            console.error(`[EmbeddingMigration] Failed for signal ${signal._id}:`, e);
            Sentry.captureException(e);
            failed++;
          }
        })
      );

      console.log(`[EmbeddingMigration] Progress: ${migrated} migrated, ${failed} failed of ${total} total.`);
    }

    console.log(`[EmbeddingMigration] ✅ Done. Migrated: ${migrated}, Failed: ${failed}, Total: ${total}`);
    return { migrated, failed, total };
  },
});
