"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { UploadCsvButton } from "../../../components/UploadCsvButton";
import { SyncUgcButton } from "../../../components/SyncUgcButton";
import { UniversityDetail } from "../../../components/UniversityDetail";
import { useState } from "react";
import { Id } from "../../../convex/_generated/dataModel";

export default function UniversitiesPage() {
  const [selectedId, setSelectedId] = useState<Id<"universities"> | null>(null);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [validating, setValidating] = useState(false);
  const universities = useQuery(api.universities.list, { type: activeTab });
  const stats = useQuery(api.universities.getStats);
  const dispatchValidation = useMutation(api.dispatcher.dispatchWebsiteValidation);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await dispatchValidation({ limit: 50 });
      alert(`Scheduled validation for ${result.scheduled} universities.`);
    } catch (e) {
      alert(`Error: ${e}`);
    } finally {
      setValidating(false);
    }
  };

  const filteredUniversities = universities;

  const tabs = ["All", "Central", "State", "Private", "Deemed"];

  return (
    <div className="p-8 relative">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Universities</h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            Manage and track all university leads
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleValidate}
            disabled={validating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-card border border-card-border text-foreground hover:border-zinc-600 hover:text-foreground transition-all duration-200 disabled:opacity-50 shadow-sm"
          >
            {validating ? (
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
              </svg>
            )}
            Validate Websites
          </button>
          <SyncUgcButton />
          <UploadCsvButton />
        </div>
      </div>

      <div className="flex items-center gap-1 mb-6 bg-card p-1.5 border border-card-border/80 rounded-xl w-fit shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              activeTab === tab
                ? "bg-muted text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <span>{tab}</span>
            {stats && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md transition-colors font-bold ${
                activeTab === tab 
                  ? "bg-zinc-700/50 text-white" 
                  : "bg-muted/50 text-muted-foreground"
              }`}>
                {stats[tab] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {universities === undefined ? (
        <div className="space-y-4">
          <div className="h-4 w-full bg-muted animate-pulse rounded" />
          <div className="h-4 w-full bg-muted animate-pulse rounded opacity-75" />
          <div className="h-4 w-full bg-muted animate-pulse rounded opacity-50" />
          <div className="h-10 w-full bg-muted animate-pulse rounded mt-8" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 w-full bg-card border border-card-border animate-pulse rounded" />
          ))}
        </div>
      ) : (filteredUniversities?.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4">🏛️</div>
          <h3 className="text-lg font-medium text-foreground mb-2">No {activeTab === "All" ? "" : activeTab} universities found</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            {activeTab === "All" 
              ? "Upload a CSV or sync from UGC to get started." 
              : `There are currently no universities categorized as ${activeTab}.`}
          </p>
        </div>
      ) : (
        <div className="bg-background border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-card text-muted-foreground text-xs uppercase tracking-wider font-heading font-medium border-b border-card-border/60">
              <tr>
                <th className="px-6 py-4 w-[35%]">University</th>
                <th className="px-6 py-3 w-[20%]">Location</th>
                <th className="px-6 py-3 w-[15%]">Type</th>
                <th className="px-6 py-3 w-[15%]">UGC Status</th>
                <th className="px-6 py-3 w-[15%]">Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredUniversities?.map((uni) => (
                <tr 
                  key={uni._id} 
                  onClick={() => setSelectedId(uni._id)}
                  className={`hover:bg-card/40 cursor-pointer transition-colors ${
                    selectedId === uni._id ? "bg-muted/30" : ""
                  }`}
                >
                  <td className="px-6 py-4 font-medium text-foreground group-hover:text-blue-400 transition-colors truncate max-w-[300px]" title={uni.university_name}>
                    {uni.university_name}
                  </td>
                  <td className="px-6 py-4 truncate max-w-[180px]" title={uni.city && uni.state ? `${uni.city}, ${uni.state}` : uni.state || ''}>
                    {uni.city && uni.state ? `${uni.city}, ${uni.state}` : uni.state || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      uni.type === 'Central' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      uni.type === 'State' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      uni.type === 'Private' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      uni.type === 'Deemed' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                      'bg-muted text-muted-foreground border border-card-border/50'
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
                        className="text-foreground text-[10px] font-mono bg-muted/80 px-2 py-0.5 rounded border border-card-border hover:border-zinc-500 transition-colors cursor-help"
                      >
                        {uni.ugc_status}
                      </span>
                    ) : (
                      <span className="text-zinc-600 italic text-xs">Not Synced</span>
                    )}
                  </td>
                  <td className="px-6 py-4 capitalize">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      uni.outreach_stage === 'enriching' 
                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/30'
                        : uni.outreach_stage === 'enriched'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                        : uni.outreach_stage === 'skipped'
                        ? 'bg-red-500/10 text-red-500 border border-red-500/30'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
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

