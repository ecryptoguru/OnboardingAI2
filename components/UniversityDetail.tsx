"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import {
  XMarkIcon,
  UserGroupIcon,
  SignalIcon,
  ChartBarIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

interface UniversityDetailProps {
  universityId: Id<"universities"> | null;
  onClose: () => void;
}

export function UniversityDetail({ universityId, onClose }: UniversityDetailProps) {
  const university = useQuery(
    api.universities.get,
    universityId ? { id: universityId } : "skip"
  );
  const stakeholders = useQuery(
    api.stakeholders.listByUniversity,
    universityId ? { university_id: universityId } : "skip"
  );
  const signals = useQuery(
    api.signals.listByUniversity,
    universityId ? { university_id: universityId } : "skip"
  );
  const scores = useQuery(
    api.priorityScores.getByUniversity,
    universityId ? { university_id: universityId } : "skip"
  );
  
  const runDeepEnrichment = useAction(api.actions.deepEnrichment.runDeepEnrichment);
  const [isDeepEnriching, setIsDeepEnriching] = useState(false);

  const handleDeepEnrich = async () => {
    if (!universityId) return;
    setIsDeepEnriching(true);
    try {
      await runDeepEnrichment({ universityId });
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeepEnriching(false);
    }
  };

  if (!universityId) return null;

  return (
    <div
      className={`fixed inset-y-0 right-0 w-full max-w-xl bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
        universityId ? "translate-x-0" : "translate-x-full"
      } flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h2 className="text-xl font-bold text-white">
            {university?.university_name || "Loading..."}
          </h2>
          <div className="flex flex-col gap-1 mt-1">
            <p className="text-zinc-400 text-sm">
              {university?.city ? `${university.city}, ` : ''}{university?.state} {university?.zip_code}
            </p>
            {university?.website && (
              <a 
                href={university.website.startsWith('http') ? university.website : `https://${university.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 w-fit"
              >
                <span>{university.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                <span className="text-xs">↗</span>
              </a>
            )}
            
            <button
              onClick={handleDeepEnrich}
              disabled={isDeepEnriching}
              className={`mt-2 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all w-fit ${
                isDeepEnriching 
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                  : "bg-fuchsia-500/10 text-fuchsia-400 hover:bg-fuchsia-500/20 border border-fuchsia-500/30"
              }`}
            >
              {isDeepEnriching ? (
                 <span className="flex items-center gap-1.5">
                   <svg className="animate-spin h-3 w-3 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   Multi-Source Searching...
                 </span>
              ) : (
                <>
                  <SparklesIcon className="w-3.5 h-3.5" />
                  Deep Enrich (AISHE + Social)
                </>
              )}
            </button>
            
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full transition-colors self-start"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
            <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Students</p>
            <p className="text-zinc-100 font-semibold">{university?.student_count?.toLocaleString() || "-"}</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
            <p className="text-zinc-500 text-[10px] uppercase font-bold mb-1">UGC Status</p>
            <p 
              className="text-zinc-100 font-semibold cursor-help"
              title={university?.ugc_status ? [
                university.ugc_status.includes('2(f)') ? "Section 2(f) of the UGC Act, 1956: Provision for granting degrees to students." : null,
                university.ugc_status.includes('12(B)') ? "Section 12(B) of the UGC Act, 1956: Eligibility to receive central assistance (grants) from UGC/Government of India." : null,
              ].filter(Boolean).join('\n\n') : "UGC Official Recognition Status"}
            >
              {university?.ugc_status || "-"}
            </p>
          </div>
        </div>

        {/* UGC Leadership & Address */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="bg-zinc-800/30 px-5 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-300">UGC Information</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-zinc-500 text-[10px] uppercase font-bold">Vice Chancellor</p>
                <p className="text-zinc-200 text-sm">{university?.vc_name || "N/A"}</p>
              </div>
              <div>
                <p className="text-zinc-500 text-[10px] uppercase font-bold">Registrar</p>
                <p className="text-zinc-200 text-sm">{university?.registrar_name || "N/A"}</p>
              </div>
            </div>
            <div>
              <p className="text-zinc-500 text-[10px] uppercase font-bold">Full Address</p>
              <p className="text-zinc-200 text-sm leading-relaxed">
                {university?.address || "No detailed address recorded."}
              </p>
            </div>
          </div>
        </div>

        {/* Deep Demographics (AISHE) */}
        {university?.demographics && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="bg-zinc-800/30 px-5 py-3 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-zinc-300">Detailed Demographics</h3>
              <span className="text-[10px] uppercase font-bold text-fuchsia-400/80 bg-fuchsia-400/10 px-2 py-0.5 rounded">
                {university.demographics.source || "Multi-Source"}
              </span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-3 gap-y-6 gap-x-4">
                {/* Total */}
                <div className="col-span-1 space-y-2 border-r border-zinc-800/50 pr-4">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Total Students</p>
                  <p className="text-white text-lg font-bold">
                    {university.demographics.total_students || 
                     ((university.demographics.total_students_male || 0) + (university.demographics.total_students_female || 0)) || "-"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                    <div className="flex justify-between"><span className="text-blue-400">Male:</span><span className="text-zinc-300">{university.demographics.total_students_male ?? "-"}</span></div>
                    <div className="flex justify-between"><span className="text-pink-400">Female:</span><span className="text-zinc-300">{university.demographics.total_students_female ?? "-"}</span></div>
                  </div>
                </div>
                {/* Day Scholars */}
                <div className="col-span-1 space-y-2 border-r border-zinc-800/50 pr-4">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Day Scholars</p>
                  <p className="text-white text-lg font-bold">
                    {university.demographics.day_scholars || 
                     ((university.demographics.day_scholars_male || 0) + (university.demographics.day_scholars_female || 0)) || "-"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                     <div className="flex justify-between"><span className="text-blue-400">Male:</span><span className="text-zinc-300">{university.demographics.day_scholars_male ?? "-"}</span></div>
                    <div className="flex justify-between"><span className="text-pink-400">Female:</span><span className="text-zinc-300">{university.demographics.day_scholars_female ?? "-"}</span></div>
                  </div>
                </div>
                {/* Hostelites */}
                <div className="col-span-1 space-y-2">
                  <p className="text-zinc-500 text-[10px] uppercase font-bold">Hostelites</p>
                  <p className="text-white text-lg font-bold">
                    {university.demographics.hostelites || 
                     ((university.demographics.hostelites_male || 0) + (university.demographics.hostelites_female || 0)) || "-"}
                  </p>
                  <div className="flex flex-col gap-1 text-xs">
                     <div className="flex justify-between"><span className="text-blue-400">Male:</span><span className="text-zinc-300">{university.demographics.hostelites_male ?? "-"}</span></div>
                    <div className="flex justify-between"><span className="text-pink-400">Female:</span><span className="text-zinc-300">{university.demographics.hostelites_female ?? "-"}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scoring */}
        {scores && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <ChartBarIcon className="h-5 w-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">Priority Scoring</h3>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400">Final Health Score</span>
                <span className="text-2xl font-bold text-indigo-400">
                  {Math.round(scores.final_score)}
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${scores.final_score}%` }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Stakeholders */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <UserGroupIcon className="h-5 w-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">Stakeholders</h3>
          </div>
          <div className="space-y-3">
            {stakeholders === undefined ? (
              <div className="h-20 bg-zinc-900/50 animate-pulse rounded-xl" />
            ) : stakeholders.length === 0 ? (
              <p className="text-zinc-500 text-sm italic">No stakeholders found yet.</p>
            ) : (
              stakeholders.map((s) => (
                <div
                  key={s._id}
                  className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-medium">{s.name || "Unknown"}</p>
                    <p className="text-zinc-400 text-xs">{s.role || "N/A"}</p>
                  </div>
                  {(s.email || s.phone) && (
                    <div className="flex flex-col items-end gap-1">
                      {s.email && (
                        <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded">
                          {s.email}
                        </span>
                      )}
                      {s.phone && (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded">
                          {s.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Sources */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <SignalIcon className="h-5 w-5 text-indigo-400" />
            <h3 className="text-lg font-semibold text-white">Sources</h3>
          </div>

          <div className="space-y-4">
            {signals === undefined ? (
              <div className="h-40 bg-zinc-900/50 animate-pulse rounded-xl" />
            ) : signals.length === 0 ? (
              null
            ) : (
              signals.map((sig) => {
                let host = "Source";
                try {
                  if (sig.source_url) {
                    host = new URL(sig.source_url).hostname.replace('www.', '');
                  }
                } catch (e) {}
                
                return (
                  <div
                    key={sig._id}
                    className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex flex-col gap-2"
                  >
                     <div className="flex items-center justify-between">
                       <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">
                         {sig.signal_type}
                       </span>
                       <span className="text-[10px] text-zinc-600">
                         {new Date(sig.created_at).toLocaleDateString()}
                       </span>
                     </div>
                     <p className="text-zinc-300 text-sm leading-relaxed line-clamp-3">
                       {sig.content}
                     </p>
                     {sig.source_url && (
                       <a
                         href={sig.source_url}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="flex items-center gap-1.5 mt-1 text-indigo-400 hover:text-indigo-300 w-fit transition-colors group"
                       >
                         <span className="bg-zinc-800 text-zinc-300 text-[10px] font-mono px-1.5 py-0.5 rounded group-hover:bg-zinc-700 transition-colors">
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
    </div>
  );
}
