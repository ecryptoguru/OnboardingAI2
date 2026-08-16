"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Id, Doc } from "../../../../convex/_generated/dataModel";
import dynamic from "next/dynamic";
import { useRequireGeminiKey } from "../../../../components/ApiKeyModal";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function scoreRecordQuality(u: Doc<"universities">) {
  let score = 0;
  if (u.state) score += 2;
  if (u.city) score += 1;
  return score;
}

function dedupeUniversities(unis: Doc<"universities">[] | undefined) {
  if (!unis) return unis;
  const groups = new Map<string, Doc<"universities">[]>();
  for (const u of unis) {
    const key = normalizeName(u.university_name);
    const existing = groups.get(key);
    if (existing) existing.push(u);
    else groups.set(key, [u]);
  }
  const result: Doc<"universities">[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => scoreRecordQuality(b) - scoreRecordQuality(a));
    result.push(group[0]);
  }
  return result;
}

const UniversityDetail = dynamic(
  () =>
    import("../../../../components/UniversityDetail").then(
      (mod) => mod.UniversityDetail,
    ),
  { ssr: false },
);

export default function EnrichmentPage() {
  const [selectedId, setSelectedId] = useState<Id<"universities"> | null>(null);

  // Live clock for the enrichment elapsed-time display (30s tick). Keeps the
  // timer fresh even when no Convex query re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Custom filter if needed, but we can use the existing list with stage param
  const rawNewUniversities = useQuery(api.universities.list, { stage: "new" });
  const rawEnrichingUniversities = useQuery(api.universities.list, {
    stage: "enriching",
  });
  const rawEnrichedUniversities = useQuery(api.universities.list, {
    stage: "enriched",
  });

  const newUniversities = useMemo(
    () => dedupeUniversities(rawNewUniversities),
    [rawNewUniversities],
  );
  const enrichingUniversities = useMemo(
    () => dedupeUniversities(rawEnrichingUniversities),
    [rawEnrichingUniversities],
  );
  const enrichedUniversities = useMemo(
    () => dedupeUniversities(rawEnrichedUniversities),
    [rawEnrichedUniversities],
  );

  // Track ids the user just enqueued so we can show them in "In Progress"
  // immediately while the backend query catches up.
  const runDeepEnrichment = useAction(
    api.actions.orchestrator.runEnrichmentChain,
  );
  const [enrichingIds, setEnrichingIds] = useState<Set<Id<"universities">>>(
    new Set(),
  );
  const [selectedNewIds, setSelectedNewIds] = useState<Set<Id<"universities">>>(
    new Set(),
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Track when each id was optimistically added so we can expire stuck ones.
  const enrichingAddedAt = useRef<Record<string, number>>({});

  const { withKeyCheck, keyModal } = useRequireGeminiKey();

  const filterBySearch = useCallback(
    (unis: Doc<"universities">[] | undefined) => {
      if (!searchQuery.trim() || !unis) return unis;
      const q = searchQuery.toLowerCase().trim();
      return unis.filter(
        (u) =>
          u.university_name.toLowerCase().includes(q) ||
          (u.city && u.city.toLowerCase().includes(q)) ||
          (u.state && u.state.toLowerCase().includes(q)),
      );
    },
    [searchQuery],
  );

  const toggleSelection = (e: React.MouseEvent, id: Id<"universities">) => {
    e.stopPropagation();
    setSelectedNewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Optimistic in-progress set: backend enriching query plus recently-queued ids.
  const inProgressIds = useMemo(() => {
    const ids = new Set<Id<"universities">>();
    for (const u of enrichingUniversities || []) ids.add(u._id);

    const now = Date.now();
    for (const id of enrichingIds) {
      const addedAt = enrichingAddedAt.current[id];
      const isNew = newUniversities?.some((u) => u._id === id);
      const isEnriching = enrichingUniversities?.some((u) => u._id === id);
      // Keep recently-queued ids in progress until the query catches them,
      // but release them if they fall back to "new" (error) for >30s.
      if (
        isEnriching ||
        (!isNew && !isEnriching) ||
        !addedAt ||
        now - addedAt < 30_000
      ) {
        ids.add(id);
      }
    }
    return ids;
  }, [enrichingIds, enrichingUniversities, newUniversities]);

  const filteredNew = filterBySearch(
    newUniversities?.filter((u) => !inProgressIds.has(u._id)),
  );

  const inProgressUniversities = useMemo(() => {
    const byId = new Map<Id<"universities">, Doc<"universities">>();
    for (const u of [...(enrichingUniversities || []), ...(newUniversities || [])]) {
      if (inProgressIds.has(u._id)) byId.set(u._id, u);
    }
    return filterBySearch([...byId.values()]);
  }, [enrichingUniversities, newUniversities, inProgressIds, filterBySearch]);

  // Clean up optimistic ids once the backend query owns them or they time out.
  useEffect(() => {
    const now = Date.now();
    const enrichedIds = new Set(enrichedUniversities?.map((u) => u._id));
    const newIds = new Set(newUniversities?.map((u) => u._id));
    setEnrichingIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of next) {
        const addedAt = enrichingAddedAt.current[id];
        if (enrichedIds.has(id)) {
          next.delete(id);
          delete enrichingAddedAt.current[id];
          changed = true;
        } else if (newIds.has(id) && addedAt && now - addedAt > 30_000) {
          next.delete(id);
          delete enrichingAddedAt.current[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enrichedUniversities, newUniversities]);

  const selectAll = () => {
    if (!filteredNew) return;
    if (selectedNewIds.size === filteredNew.length) {
      setSelectedNewIds(new Set());
    } else {
      setSelectedNewIds(
        new Set(filteredNew.map((u: Doc<"universities">) => u._id)),
      );
    }
  };

  const handleDeepEnrichSelected = async () => {
    if (selectedNewIds.size === 0) return;

    const idsToEnrich = Array.from(selectedNewIds);
    setEnrichingIds((prev) => {
      const next = new Set(prev);
      for (const id of idsToEnrich) {
        next.add(id);
        enrichingAddedAt.current[id] = Date.now();
      }
      return next;
    });
    setSelectedNewIds(new Set()); // clear selection

    // Run them in parallel; the action enqueues and returns immediately.
    await Promise.allSettled(
      idsToEnrich.map(async (id) => {
        try {
          await runDeepEnrichment({ universityId: id });
        } catch (error) {
          console.error(`Deep enrichment failed for ${id}:`, error);
        }
      }),
    );
  };

  const renderUniversityCard = (
    uni: Doc<"universities">,
    isNew: boolean,
    isEnriching: boolean,
  ) => (
    <div
      key={uni._id}
      onClick={() => setSelectedId(uni._id)}
      className="p-4 bg-muted border border-card-border/60 rounded-xl hover:bg-card cursor-pointer transition-colors group mb-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {isNew && !isEnriching && (
            <div
              className="mt-1 flex-shrink-0 cursor-pointer"
              onClick={(e) => toggleSelection(e, uni._id)}
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  selectedNewIds.has(uni._id)
                    ? "bg-blue-500 border-blue-500 text-white"
                    : "border-card-border bg-background group-hover:border-zinc-500"
                }`}
              >
                {selectedNewIds.has(uni._id) && (
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-foreground truncate">
              {uni.university_name}
            </h3>
            <p className="text-xs text-muted-foreground truncate mt-1">
              {uni.city && uni.state
                ? `${uni.city}, ${uni.state}`
                : uni.state || "Unknown Location"}
            </p>
          </div>
        </div>

        {isEnriching && (
          <div className="flex-shrink-0 flex items-center justify-center text-blue-400">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        )}

        {!isNew && !isEnriching && uni.lead_tier && (
          <div className="flex-shrink-0">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                uni.lead_tier === "High"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : uni.lead_tier === "Medium"
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {uni.lead_tier}
            </span>
          </div>
        )}
      </div>

      {isEnriching && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {uni.enrichment_status === "failed" ? (
            <span className="text-red-400">
              Failed
              {uni.enrichment_error
                ? `: ${uni.enrichment_error.slice(0, 80)}`
                : ""}
            </span>
          ) : (
            <>
              <span className="capitalize">
                {uni.enrichment_phase?.replace(/-/g, " ") ?? "Enriching"}
              </span>
              {uni.enrichment_started_at && (
                <>
                  {" "}
                  ·{" "}
                  {Math.max(
                    0,
                    Math.round(
                      (now - uni.enrichment_started_at) / 60000,
                    ),
                  )}
                  m
                  {now - uni.enrichment_started_at > 10 * 60 * 1000 && (
                    <span className="text-amber-500 ml-1">
                      (may have timed out)
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div
      className="p-8 h-screen max-h-screen overflow-hidden flex flex-col relative text-zinc-200"
      suppressHydrationWarning
    >
      <div className="flex items-start justify-between mb-8 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
            Deep Enrichment Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            Bulk process universities to gather stakeholders, demographics, and
            generate AI priority scores.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search universities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-card border border-card-border/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 shadow-sm transition-shadow text-foreground placeholder:text-muted-foreground placeholder:font-medium"
            />
          </div>

          {selectedNewIds.size > 0 && (
            <button
              type="button"
              onClick={withKeyCheck(handleDeepEnrichSelected)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm transition-colors flex items-center gap-2"
            >
              <span>Deep Enrich {selectedNewIds.size} Selected</span>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        {/* Column 1: Pending / New */}
        <div className="flex flex-col w-1/3 bg-background border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-card-border/60 bg-card flex items-center justify-between">
            <h2 className="text-sm font-semibold font-heading tracking-wide text-foreground flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-zinc-500"></div>
              Pending / New
              <span className="text-xs bg-muted text-muted-foreground px-2 rounded-full font-medium ml-1">
                {filteredNew ? filteredNew.length : 0}
              </span>
            </h2>
            {filteredNew && filteredNew.length > 0 && (
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors"
              >
                {selectedNewIds.size === filteredNew.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {newUniversities === undefined ? (
              // Loading skeletons
              Array(4)
                .fill(0)
                .map((_: number, i: number) => (
                  <div
                    key={i}
                    className="h-20 bg-muted/30 border border-card-border/50 animate-pulse rounded-xl mb-3"
                  />
                ))
            ) : filteredNew && filteredNew.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-zinc-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <p className="text-sm">
                  {searchQuery.trim()
                    ? "No matches found."
                    : "No pending universities."}
                </p>
              </div>
            ) : (
              filteredNew?.map((uni: Doc<"universities">) =>
                renderUniversityCard(uni, true, false),
              )
            )}
          </div>
        </div>

        {/* Column 2: In Progress */}
        <div className="flex flex-col w-1/3 bg-background border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-card-border/60 bg-card flex items-center justify-between">
            <h2 className="text-sm font-semibold font-heading tracking-wide text-foreground flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500"></div>
              In Progress
              <span className="text-xs bg-muted text-muted-foreground px-2 rounded-full font-medium ml-1">
                {inProgressUniversities ? inProgressUniversities.length : 0}
              </span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {inProgressUniversities === undefined ? (
              // Loading skeletons
              Array(2)
                .fill(0)
                .map((_: number, i: number) => (
                  <div
                    key={i}
                    className="h-20 bg-muted/30 border border-card-border/50 animate-pulse rounded-xl mb-3"
                  />
                ))
            ) : inProgressUniversities.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-zinc-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <p className="text-sm">No enrichment processes running.</p>
              </div>
            ) : (
              inProgressUniversities.map((uni: Doc<"universities">) =>
                renderUniversityCard(uni, true, true),
              )
            )}
          </div>
        </div>

        {/* Column 3: Enriched */}
        <div className="flex flex-col w-1/3 bg-background border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-card-border/60 bg-card flex items-center justify-between">
            <h2 className="text-sm font-semibold font-heading tracking-wide text-foreground flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Enriched
              <span className="text-xs bg-muted text-muted-foreground px-2 rounded-full font-medium ml-1">
                {enrichedUniversities ? enrichedUniversities.length : 0}
              </span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {enrichedUniversities === undefined ? (
              Array(4)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="h-20 bg-muted/30 border border-card-border/50 animate-pulse rounded-xl mb-3"
                  />
                ))
            ) : enrichedUniversities.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <div className="w-12 h-12 bg-card rounded-full flex items-center justify-center mb-3">
                  <svg
                    className="w-5 h-5 text-zinc-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <p className="text-sm">
                  Processed universities will appear here.
                </p>
              </div>
            ) : (
              filterBySearch(enrichedUniversities)?.map(
                (uni: Doc<"universities">) =>
                  renderUniversityCard(uni, false, false),
              )
            )}
          </div>
        </div>
      </div>

      {selectedId && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={() => setSelectedId(null)}
        />
      )}
      <UniversityDetail
        universityId={selectedId}
        onClose={() => setSelectedId(null)}
      />
      {keyModal}
    </div>
  );
}
