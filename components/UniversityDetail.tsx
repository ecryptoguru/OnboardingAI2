"use client";

import React, { useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Doc, Id } from "../convex/_generated/dataModel";
import {
  XMarkIcon,
  UserGroupIcon,
  SignalIcon,
  ChartBarIcon,
  SparklesIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useRequireGeminiKey } from "./ApiKeyModal";

interface UniversityDetailProps {
  universityId: Id<"universities"> | null;
  onClose: () => void;
}

export function UniversityDetail({
  universityId,
  onClose,
}: UniversityDetailProps) {
  const university = useQuery(
    api.universities.get,
    universityId ? { id: universityId } : "skip",
  );
  const stakeholders = useQuery(
    api.stakeholders.listByUniversity,
    universityId ? { university_id: universityId } : "skip",
  );
  const signals = useQuery(
    api.signals.listByUniversity,
    universityId ? { university_id: universityId } : "skip",
  );
  const scores = useQuery(
    api.priorityScores.getByUniversity,
    universityId ? { university_id: universityId } : "skip",
  );

  const runEnrichmentChain = useAction(
    api.actions.orchestrator.runEnrichmentChain,
  );
  const [isDeepEnriching, setIsDeepEnriching] = useState(false);
  const [enrichStep, setEnrichStep] = useState<string | null>(null);

  const { withKeyCheck, keyModal } = useRequireGeminiKey();

  const handleDeepEnrich = useCallback(async () => {
    if (!universityId) return;
    setIsDeepEnriching(true);
    setEnrichStep("Scraping NIRF, AISHE & NAAC sources…");
    try {
      await runEnrichmentChain({ universityId });
      setEnrichStep("Done!");
      setTimeout(() => setEnrichStep(null), 2000);
    } catch (e) {
      console.error(e);
      setEnrichStep("Error — check console");
      setTimeout(() => setEnrichStep(null), 3000);
    } finally {
      setIsDeepEnriching(false);
    }
  }, [universityId, runEnrichmentChain]);

  if (!universityId) return null;

  const rawDemo = university?.demographics;
  const viewDemo = rawDemo ? {
    total_students: rawDemo.total_students || rawDemo.nirf_total || null,
    total_students_male: rawDemo.total_students_male || rawDemo.nirf_male || null,
    total_students_female: rawDemo.total_students_female || rawDemo.nirf_female || null,
    day_scholars: rawDemo.day_scholars ?? null,
    day_scholars_male: rawDemo.day_scholars_male ?? null,
    day_scholars_female: rawDemo.day_scholars_female ?? null,
    hostelites: rawDemo.hostelites ?? null,
    hostelites_male: rawDemo.hostelites_male ?? null,
    hostelites_female: rawDemo.hostelites_female ?? null,
    source: rawDemo.source || rawDemo.nirf_source || "NIRF Fallback",
  } : null;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full max-w-xl bg-background border-l border-card-border/60 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
        universityId ? "translate-x-0" : "translate-x-full"
      } flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-card-border/60 bg-card/80 backdrop-blur-md sticky top-0 z-10">
        <div>
          <h2 className="text-2xl font-heading font-bold tracking-tight text-foreground">
            {university?.university_name || "Loading..."}
          </h2>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-muted-foreground text-sm">
              {university?.city ? `${university.city}, ` : ""}
              {university?.state} {university?.zip_code}
            </p>
            {university?.website && (
              <a
                href={
                  university.website.startsWith("http")
                    ? university.website
                    : `https://${university.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 w-fit mt-0.5"
              >
                <span className="font-medium">
                  {university.website
                    .replace(/^https?:\/\/(www\.)?/, "")
                    .replace(/\/$/, "")}
                </span>
                <span className="text-xs">↗</span>
              </a>
            )}

            <button
              onClick={withKeyCheck(handleDeepEnrich)}
              disabled={isDeepEnriching}
              aria-label="Run deep enrichment"
              className={`mt-3 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all w-fit shadow-sm ${
                isDeepEnriching
                  ? "bg-muted text-muted-foreground cursor-not-allowed shadow-none"
                  : enrichStep === "Done!"
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-blue-600 text-white hover:bg-blue-500"
              }`}
            >
              {isDeepEnriching ? (
                <span className="flex items-center gap-1.5">
                  <svg
                    className="animate-spin h-3 w-3 text-muted-foreground"
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
                  {enrichStep ?? "Enriching…"}
                </span>
              ) : (
                <>
                  <SparklesIcon className="w-3.5 h-3.5" />
                  {enrichStep ?? "Deep Enrich (AISHE + Social)"}
                </>
              )}
            </button>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close details panel"
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors self-start"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-card-border/60 p-4 rounded-xl shadow-sm">
            <p className="text-muted-foreground text-[10px] uppercase font-bold mb-1 tracking-wider">
              Students
            </p>
            <p className="text-foreground font-semibold">
              {university?.student_count?.toLocaleString() || "-"}
            </p>
          </div>
          <div className="bg-card border border-card-border/60 p-4 rounded-xl shadow-sm">
            <p className="text-muted-foreground text-[10px] uppercase font-bold mb-1 tracking-wider">
              UGC Status
            </p>
            <p
              className="text-foreground font-semibold cursor-help"
              title={
                university?.ugc_status
                  ? [
                      university.ugc_status.includes("2(f)")
                        ? "Section 2(f) of the UGC Act, 1956: Provision for granting degrees to students."
                        : null,
                      university.ugc_status.includes("12(B)")
                        ? "Section 12(B) of the UGC Act, 1956: Eligibility to receive central assistance (grants) from UGC/Government of India."
                        : null,
                    ]
                      .filter(Boolean)
                      .join("\n\n")
                  : "UGC Official Recognition Status"
              }
            >
              {university?.ugc_status || "-"}
            </p>
          </div>
        </div>

        {/* UGC Leadership & Address */}
        <div className="bg-card border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-muted px-5 py-3 border-b border-card-border/60">
            <h3 className="text-sm font-semibold font-heading tracking-wide text-foreground">
              UGC Information
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase font-bold">
                  Vice Chancellor
                </p>
                <p className="text-zinc-200 text-sm">
                  {university?.vc_name || "N/A"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[10px] uppercase font-bold">
                  Registrar
                </p>
                <p className="text-zinc-200 text-sm">
                  {university?.registrar_name || "N/A"}
                </p>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-[10px] uppercase font-bold">
                Full Address
              </p>
              <p className="text-zinc-200 text-sm leading-relaxed">
                {university?.address || "No detailed address recorded."}
              </p>
            </div>
          </div>
        </div>

        {/* ── CARD 1: NIRF Student Strength (program-wise) ─────────────────── */}
        {university?.demographics?.nirf_programs?.length ||
        university?.demographics?.nirf_total ? (
          <div className="bg-card border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
            <div className="bg-muted px-5 py-3 border-b border-card-border/60 flex justify-between items-center">
              <h3 className="text-sm font-semibold font-heading tracking-wide text-foreground">
                Student Strength{" "}
                <span className="text-muted-foreground font-normal">
                  (NIRF)
                </span>
              </h3>
              {university.demographics?.nirf_source && (
                <span className="text-[10px] uppercase font-bold text-sky-400/80 bg-sky-400/10 px-2 py-0.5 rounded border border-sky-500/20">
                  {university.demographics.nirf_source}
                </span>
              )}
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Program rows table */}
              {university.demographics.nirf_programs &&
                university.demographics.nirf_programs.length > 0 && (
                  <div className="w-full text-xs">
                    {/* Header */}
                    <div className="grid grid-cols-4 gap-2 text-muted-foreground uppercase font-bold text-[10px] pb-2 border-b border-card-border/60">
                      <span className="col-span-2">Program</span>
                      <span className="text-right text-blue-400">Male</span>
                      <span className="text-right text-pink-400">Female</span>
                    </div>
                    {/* Program rows */}
                    {university.demographics.nirf_programs.map(
                      (
                        prog: { name: string; male?: number; female?: number },
                        i: number,
                      ) => (
                        <div
                          key={i}
                          className="grid grid-cols-4 gap-2 py-1.5 border-b border-card-border/30 last:border-b-0"
                        >
                          <span className="col-span-2 text-foreground truncate">
                            {prog.name}
                          </span>
                          <span className="text-right text-zinc-200">
                            {prog.male?.toLocaleString() ?? "—"}
                          </span>
                          <span className="text-right text-zinc-200">
                            {prog.female?.toLocaleString() ?? "—"}
                          </span>
                        </div>
                      ),
                    )}
                    {/* Totals row */}
                    {(university.demographics.nirf_total ||
                      university.demographics.nirf_male != null) && (
                      <div className="grid grid-cols-4 gap-2 py-2 mt-1 border-t-2 border-card-border/50">
                        <span className="col-span-2 text-foreground font-bold text-[11px]">
                          Total —{" "}
                          {(
                            university.demographics.nirf_total ??
                            (university.demographics.nirf_male ?? 0) +
                              (university.demographics.nirf_female ?? 0)
                          ).toLocaleString()}
                        </span>
                        <span className="text-right text-blue-300 font-bold">
                          {university.demographics.nirf_male?.toLocaleString() ??
                            "—"}
                        </span>
                        <span className="text-right text-pink-300 font-bold">
                          {university.demographics.nirf_female?.toLocaleString() ??
                            "—"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

              {/* Fallback: only totals, no program breakdown */}
              {!university.demographics.nirf_programs?.length &&
                university.demographics.nirf_total && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase font-bold">
                        Total Students
                      </p>
                      <p className="text-foreground text-2xl font-bold">
                        {university.demographics.nirf_total.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-blue-400 text-xs">
                        Male:{" "}
                        {university.demographics.nirf_male?.toLocaleString() ??
                          "—"}
                      </p>
                      <p className="text-pink-400 text-xs">
                        Female:{" "}
                        {university.demographics.nirf_female?.toLocaleString() ??
                          "—"}
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </div>
        ) : null}

        {/* ── CARD 2: AISHE + NAAC SSR (hostelite breakdown) ──────────────────── */}
        <div className="bg-card border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-muted px-5 py-3 border-b border-card-border/60 flex justify-between items-center">
            <h3 className="text-sm font-semibold font-heading tracking-wide text-foreground">
              Student Demographics{" "}
              <span className="text-muted-foreground font-normal">
                (AISHE · NAAC · SSR · NIRF)
              </span>
            </h3>
            {viewDemo?.source && !viewDemo.source.includes("NIRF Fallback") ? (
              <span className="text-[10px] uppercase font-bold text-emerald-400/80 bg-emerald-400/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {viewDemo.source}
              </span>
            ) : viewDemo ? (
              <span className="text-[10px] uppercase font-bold text-sky-500/80 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                NIRF Fallback
              </span>
            ) : (
              <span className="text-[10px] uppercase font-bold text-zinc-600 bg-muted px-2 py-0.5 rounded">
                Not Yet Enriched
              </span>
            )}
          </div>

          {!viewDemo ? (
            <div className="p-5 flex flex-col items-center gap-2 text-center">
              <p className="text-muted-foreground text-sm">
                No demographic data available yet.
              </p>
              <p className="text-zinc-600 text-xs">
                Run{" "}
                <span className="text-emerald-400 font-medium">
                  Deep Enrich
                </span>{" "}
                above to pull the latest NIRF, AISHE &amp; NAAC data.
              </p>
            </div>
          ) : (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-y-6 gap-x-4">
                {/* Total Students */}
                <div className="col-span-1 space-y-2 border-r border-card-border/50 pr-4">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold">
                    Total Students
                  </p>
                  <p className="text-foreground text-lg font-bold">
                    {(
                      viewDemo.total_students ||
                      (viewDemo.total_students_male ?? 0) +
                        (viewDemo.total_students_female ?? 0) ||
                      0
                    ).toLocaleString() || "—"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-blue-400">Male:</span>
                      <span className="text-foreground">
                        {viewDemo.total_students_male?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pink-400">Female:</span>
                      <span className="text-foreground">
                        {viewDemo.total_students_female?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Day Scholars */}
                <div className="col-span-1 space-y-2 border-r border-card-border/50 pr-4">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold">
                    Day Scholars
                  </p>
                  <p className="text-foreground text-lg font-bold">
                    {viewDemo.day_scholars != null
                      ? viewDemo.day_scholars.toLocaleString()
                      : (viewDemo.day_scholars_male ?? 0) +
                            (viewDemo.day_scholars_female ?? 0) >
                          0
                        ? (
                            (viewDemo.day_scholars_male ?? 0) +
                            (viewDemo.day_scholars_female ?? 0)
                          ).toLocaleString()
                        : "—"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-blue-400">Male:</span>
                      <span className="text-foreground">
                        {viewDemo.day_scholars_male?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pink-400">Female:</span>
                      <span className="text-foreground">
                        {viewDemo.day_scholars_female?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Hostelites */}
                <div className="col-span-1 space-y-2">
                  <p className="text-muted-foreground text-[10px] uppercase font-bold">
                    Hostelites
                  </p>
                  <p className="text-foreground text-lg font-bold">
                    {viewDemo.hostelites != null
                      ? viewDemo.hostelites.toLocaleString()
                      : (viewDemo.hostelites_male ?? 0) +
                            (viewDemo.hostelites_female ?? 0) >
                          0
                        ? (
                            (viewDemo.hostelites_male ?? 0) +
                            (viewDemo.hostelites_female ?? 0)
                          ).toLocaleString()
                        : "—"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-blue-400">Male:</span>
                      <span className="text-foreground">
                        {viewDemo.hostelites_male?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-pink-400">Female:</span>
                      <span className="text-foreground">
                        {viewDemo.hostelites_female?.toLocaleString() ?? "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hostelite occupancy bar */}
              {!!viewDemo.total_students &&
                !!viewDemo.hostelites && (
                  <div className="mt-5 pt-4 border-t border-card-border/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-muted-foreground text-[10px] uppercase font-bold">
                        Hostelite Occupancy
                      </span>
                      <span className="text-emerald-400 text-xs font-bold">
                        {Math.round(
                          (viewDemo.hostelites /
                            viewDemo.total_students) *
                            100,
                        )}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-muted border border-card-border/60 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round((viewDemo.hostelites / viewDemo.total_students) * 100))}%`,
                        }}
                      />
                    </div>
                    <p className="text-zinc-600 text-[10px] mt-1">
                      {viewDemo.hostelites.toLocaleString()} of{" "}
                      {viewDemo.total_students.toLocaleString()}{" "}
                      students live on campus
                    </p>
                  </div>
                )}
            </div>
          )}
        </div>

        {scores && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ChartBarIcon className="h-5 w-5 text-blue-400" />
              <h3 className="text-lg font-semibold font-heading text-foreground">
                Priority Scoring
              </h3>
            </div>
            <div className="bg-card border border-card-border/60 shadow-sm rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-muted-foreground font-medium tracking-wide text-sm uppercase">
                  Final Health Score
                </span>
                <span className="text-3xl font-bold font-heading text-blue-400">
                  {Math.round(scores.final_score)}
                </span>
              </div>
              <div className="w-full bg-muted border border-card-border/60 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  style={{ width: `${scores.final_score}%` }}
                />
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center gap-2 mb-4">
            <UserGroupIcon className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              Stakeholders
            </h3>
            {stakeholders && stakeholders.length > 0 && (
              <span className="ml-auto text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded-md font-bold">
                {stakeholders.length} found
              </span>
            )}
          </div>
          <div className="space-y-3">
            {stakeholders === undefined ? (
              <div className="h-20 bg-card/50 animate-pulse rounded-xl" />
            ) : stakeholders.length === 0 ? (
              <p className="text-muted-foreground text-sm italic">
                No stakeholders found yet.
              </p>
            ) : (
              stakeholders.map((s: Doc<"stakeholders">) => (
                <div
                  key={s._id}
                  className="bg-card border border-card-border/60 p-4 rounded-xl shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-foreground font-medium">
                          {s.name || "Unspecified Contact"}
                        </p>
                        {s.source && (
                          <span
                            className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              s.source === "deep_enrichment"
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                : "bg-zinc-700/50 text-muted-foreground"
                            }`}
                          >
                            {s.source === "deep_enrichment"
                              ? "AI Enriched"
                              : "UGC"}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs mt-0.5">
                        {s.role || "N/A"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {s.email && (
                        <a
                          href={`mailto:${s.email}`}
                          className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-md hover:bg-blue-500/20 transition-colors max-w-[200px] truncate font-medium"
                          title={s.email}
                        >
                          {s.email}
                        </a>
                      )}
                      {s.phone && (
                        <a
                          href={`tel:${s.phone}`}
                          className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md hover:bg-emerald-500/20 transition-colors font-medium"
                        >
                          {s.phone}
                        </a>
                      )}
                      {s.linkedin_url && (
                        <a
                          href={s.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md hover:bg-sky-500/20 transition-colors border border-sky-500/20 font-medium"
                        >
                          <LinkIcon className="h-3 w-3" />
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Signals */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <SignalIcon className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold font-heading text-foreground">
              AI Signals
            </h3>
          </div>

          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              Sources Used:
            </span>
            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold uppercase rounded border border-blue-500/20">
              LinkedIn Data
            </span>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-500/20">
              Google News APIs
            </span>
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase rounded border border-amber-500/20">
              Google Images
            </span>
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-500/20">
              Serper Search
            </span>
          </div>

          <div className="space-y-4">
            {signals === undefined ? (
              <div className="h-40 bg-card/50 animate-pulse rounded-xl" />
            ) : signals.length === 0 ? (
              <></>
            ) : (
              signals.map((sig: Doc<"universitySignals">) => {
                let host = "Source";
                try {
                  if (sig.source_url) {
                    host = new URL(sig.source_url).hostname.replace("www.", "");
                  }
                } catch {}

                return (
                  <div
                    key={sig._id}
                    className="bg-card border border-card-border/60 p-4 rounded-xl flex flex-col gap-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                        {sig.signal_type}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(sig.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-foreground text-sm leading-relaxed line-clamp-3">
                      {sig.content}
                    </p>
                    {sig.source_url && (
                      <a
                        href={sig.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 mt-1 text-blue-400 hover:text-blue-300 w-fit transition-colors group"
                      >
                        <span className="bg-muted border border-card-border/60 text-foreground text-[10px] font-mono px-1.5 py-0.5 rounded group-hover:bg-muted/80 transition-colors">
                          {host}
                        </span>
                        <span className="text-xs font-medium">Link ↗</span>
                      </a>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
      {keyModal}
    </div>
  );
}

export const UniversityDetailMemo = React.memo(UniversityDetail);
