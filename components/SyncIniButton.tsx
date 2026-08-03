"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export function SyncIniButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    addedCount: number;
    updatedCount: number;
    skippedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncInstitutes = useAction(
    api.actions.iniSeed.syncInstitutesOfNationalImportance,
  );

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);

    try {
      const result = await syncInstitutes({});
      setSyncResult({
        addedCount: result.addedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
      });
    } catch (err) {
      console.error("INI seed failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to seed INIs.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        {syncResult && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-emerald-400 font-medium tracking-wide">
              INI Seed: {syncResult.addedCount} added, {syncResult.updatedCount} updated
              {syncResult.skippedCount > 0 && `, ${syncResult.skippedCount} already present`}
            </span>
          </div>
        )}

        {error && (
          <span className="text-xs text-red-400 font-medium">{error}</span>
        )}

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${
            isSyncing
              ? "bg-muted/80 text-muted-foreground cursor-not-allowed"
              : "bg-card border border-card-border/80 text-foreground hover:bg-muted/80 hover:border-card-border hover:text-white"
          }`}
        >
          <ArrowPathIcon
            className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          {isSyncing ? "Seeding INIs..." : "Sync IITs / NITs / IIITs"}
        </button>
      </div>
    </div>
  );
}
