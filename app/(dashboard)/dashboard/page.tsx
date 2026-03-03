"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UploadCsvButton } from "../../../components/UploadCsvButton";
import { SyncUgcButton } from "../../../components/SyncUgcButton";
import { UniversityDetail } from "../../../components/UniversityDetail";
import { useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";

export default function UniversitiesPage() {
  const [selectedId, setSelectedId] = useState<Id<"universities"> | null>(null);
  const [activeTab, setActiveTab] = useState<string>("All");
  const universities = useQuery(api.universities.list, { type: activeTab });
  const stats = useQuery(api.universities.getStats);

  const filteredUniversities = universities;

  const tabs = ["All", "Central", "State", "Private", "Deemed"];

  return (
    <div className="p-8 relative">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Universities</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage and track all university leads
          </p>
        </div>
        <div className="flex items-center gap-4">
          <SyncUgcButton />
          <UploadCsvButton />
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 bg-zinc-900/50 p-1 border border-zinc-800 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab
                ? "bg-zinc-800 text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30"
            }`}
          >
            <span>{tab}</span>
            {stats && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                activeTab === tab 
                  ? "bg-white/10 text-white" 
                  : "bg-zinc-800 text-zinc-500"
              }`}>
                {stats[tab] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {universities === undefined ? (
        <div className="space-y-4">
          <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
          <div className="h-4 w-full bg-zinc-800 animate-pulse rounded opacity-75" />
          <div className="h-4 w-full bg-zinc-800 animate-pulse rounded opacity-50" />
          <div className="h-10 w-full bg-zinc-800 animate-pulse rounded mt-8" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 w-full bg-zinc-900 border border-zinc-800 animate-pulse rounded" />
          ))}
        </div>
      ) : (filteredUniversities?.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🏛️</div>
          <h3 className="text-lg font-medium text-white mb-2">No {activeTab === "All" ? "" : activeTab} universities found</h3>
          <p className="text-zinc-400 text-sm max-w-sm">
            {activeTab === "All" 
              ? "Upload a CSV or sync from UGC to get started." 
              : `There are currently no universities categorized as ${activeTab}.`}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm text-zinc-400">
            <thead className="bg-zinc-800/50 text-zinc-300 text-xs uppercase">
              <tr>
                <th className="px-6 py-3 w-[35%]">University</th>
                <th className="px-6 py-3 w-[20%]">Location</th>
                <th className="px-6 py-3 w-[15%]">Type</th>
                <th className="px-6 py-3 w-[15%]">UGC Status</th>
                <th className="px-6 py-3 w-[15%]">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUniversities?.map((uni) => (
                <tr 
                  key={uni._id} 
                  onClick={() => setSelectedId(uni._id)}
                  className={`hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                    selectedId === uni._id ? "bg-zinc-800/80" : ""
                  }`}
                >
                  <td className="px-6 py-4 font-medium text-white group-hover:text-purple-400 transition-colors truncate max-w-[300px]" title={uni.university_name}>
                    {uni.university_name}
                  </td>
                  <td className="px-6 py-4 truncate max-w-[180px]" title={uni.city && uni.state ? `${uni.city}, ${uni.state}` : uni.state || ''}>
                    {uni.city && uni.state ? `${uni.city}, ${uni.state}` : uni.state || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      uni.type === 'Central' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.1)]' :
                      uni.type === 'State' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.1)]' :
                      uni.type === 'Private' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]' :
                      uni.type === 'Deemed' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-[0_0_12px_rgba(249,115,22,0.1)]' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {uni.type || 'Other'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {uni.ugc_status ? (
                      <span 
                        title={[
                          uni.ugc_status.includes('2(f)') ? "Section 2(f) of the UGC Act, 1956: Provision for granting degrees to students." : null,
                          uni.ugc_status.includes('12(B)') ? "Section 12(B) of the UGC Act, 1956: Eligibility to receive central assistance (grants) from UGC/Government of India." : null,
                        ].filter(Boolean).join('\n\n') || "UGC Official Recognition Status"}
                        className="text-zinc-300 text-[10px] font-mono bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 transition-colors cursor-help"
                      >
                        {uni.ugc_status}
                      </span>
                    ) : (
                      <span className="text-zinc-600 italic text-xs">Not Synced</span>
                    )}
                  </td>
                  <td className="px-6 py-4 capitalize">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                      uni.outreach_stage === 'enriching' 
                        ? 'bg-amber-500/10 text-amber-400 animate-pulse border border-amber-500/20'
                        : uni.outreach_stage === 'enriched'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[inset_0_1px_10px_rgba(34,197,94,0.05)]'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    }`}>
                      {(uni.outreach_stage || 'new').replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Overlay / Side Panel */}
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
    </div>
  );
}

