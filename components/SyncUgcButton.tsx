"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export function SyncUgcButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ count: number; lastSynced: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bulkSyncUgc = useMutation(api.universities.bulkSyncUgc);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncResult(null);
    
    try {
      // Step 1: Fetch through the Proxy Route Handler
      const response = await fetch("/api/sync-ugc");
      if (!response.ok) {
        throw new Error(`Proxy error: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.List || !Array.isArray(data.List)) {
        throw new Error("Invalid format from UGC API");
      }

      // Step 2: Map data to our schema with normalization
      const mappedUniversities = data.List.map((item: any) => {
        let normalizedType = item.uni_type || "Other";
        if (normalizedType.includes("Deemed")) {
          normalizedType = "Deemed";
        }

        return {
          university_name: item.uni_name?.trim() || "Unknown",
          state: item.state?.trim() || "Unknown",
          address: item.address || undefined,
          zip_code: item.Zip || undefined,
          ugc_status: item.status || undefined,
          website: item.url || undefined,
          type: normalizedType,
          vc_name: item.NM_VC || undefined,
          registrar_name: item.NM_REG || undefined,
        };
      });

      // Step 3: Send to Convex mutation
      const result = await bulkSyncUgc({
        universities: mappedUniversities
      });

      setSyncResult({
        count: result.addedCount,
        lastSynced: Date.now()
      });
    } catch (err) {
      console.error("Sync failed:", err);
      setError("Failed to sync data from UGC.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        {syncResult && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full">
            <CheckCircleIcon className="h-4 w-4 text-green-400" />
            <span className="text-xs text-green-400 font-medium">
              Sync Complete: {syncResult.count} new added
            </span>
          </div>
        )}
        
        {error && (
          <span className="text-xs text-red-400 font-medium">
            {error}
          </span>
        )}

        <button
          onClick={handleSync}
          disabled={isSyncing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            isSyncing 
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
              : "bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 hover:text-white"
          }`}
        >
          <ArrowPathIcon className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync UGC Data"}
        </button>
      </div>
      
      {syncResult && (
        <p className="text-[10px] text-zinc-500 italic">
          Last synced: {new Date(syncResult.lastSynced).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
