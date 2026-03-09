"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc } from "../../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import { MagnifyingGlassIcon, XMarkIcon, NoSymbolIcon } from "@heroicons/react/24/outline";

const COLUMNS = [
  { id: "enriched", label: "Ready to Sequence", color: "sky" },
  { id: "outreach_active", label: "Outreach Active", color: "blue" },
  { id: "replied", label: "Replied", color: "emerald" },
  { id: "meeting_booked", label: "Meeting Booked", color: "amber" },
  { id: "not_interested", label: "Not Interested", color: "red" },
] as const;

const CLASSIFICATION_STYLES: Record<string, string> = {
  meeting_request: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  positive_interest: "bg-blue-500/10 text-blue-400 border border-blue-500/25",
  request_info: "bg-sky-500/10 text-sky-400 border border-sky-500/25",
  not_interested: "bg-red-500/10 text-red-400 border border-red-500/25",
  opt_out: "bg-orange-500/10 text-orange-400 border border-orange-500/25",
  out_of_office: "bg-zinc-500/10 text-muted-foreground border border-zinc-500/25",
  other: "bg-muted text-muted-foreground border border-card-border",
};

export default function OutreachPage() {
  const universities = useQuery(api.universities.list, {});
  const replies = useQuery(api.replies.list, {});
  const [showReplies, setShowReplies] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  if (!universities) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const grouped = universities.reduce((acc, uni) => {
    const stage = uni.outreach_stage || "new";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(uni);
    return acc;
  }, {} as Record<string, typeof universities>);

  // Compute quick stats
  const activeCount = grouped["outreach_active"]?.length ?? 0;
  const repliedCount = grouped["replied"]?.length ?? 0;
  const meetingCount = grouped["meeting_booked"]?.length ?? 0;
  const replyCount = replies?.length ?? 0;

  return (
    <div className="p-8 pb-20">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Outreach Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            Real-time tracking of university engagement and follow-up status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSkipModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-card-border hover:border-zinc-600 text-foreground rounded-lg text-sm font-medium transition-all duration-200"
          >
            <NoSymbolIcon className="h-4 w-4" />
            Skip University
          </button>
          <button
            onClick={() => setShowReplies(!showReplies)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border ${
              showReplies
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                : "bg-card text-foreground border-card-border hover:border-zinc-600"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Replies {replyCount > 0 && <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{replyCount}</span>}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Active Outreach", value: activeCount, color: "text-blue-400" },
          { label: "Replied", value: repliedCount, color: "text-emerald-400" },
          { label: "Meetings Booked", value: meetingCount, color: "text-amber-400" },
          { label: "Total Universities", value: universities.length, color: "text-white" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-card-border/60 rounded-xl p-5 shadow-sm">
            <p className="text-muted-foreground text-xs font-medium mb-1 uppercase tracking-wider">{stat.label}</p>
            <p className={`text-3xl font-heading font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-6">
        {/* Kanban board */}
        <div className={`flex gap-6 overflow-x-auto pb-8 min-h-[60vh] custom-scrollbar flex-1 ${showReplies ? "max-w-[calc(100%-340px)]" : ""}`}>
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full bg-${col.color}-500`} />
                  <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">{col.label}</h2>
                </div>
                <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ring-1 ring-zinc-700">
                  {grouped[col.id]?.length || 0}
                </span>
              </div>

              <div className="flex flex-col gap-3 min-h-[100px] p-2 rounded-2xl bg-background border border-card-border/60">
                {(grouped[col.id] || []).map((uni) => (
                  <KanbanCard key={uni._id} university={uni} />
                ))}
                {(!grouped[col.id] || grouped[col.id].length === 0) && (
                  <div className="py-10 text-center">
                    <p className="text-zinc-600 text-[10px] font-medium uppercase tracking-tighter italic">No universities in this stage</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Replies panel */}
        {showReplies && (
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-0">
              <h2 className="text-sm font-bold text-foreground uppercase tracking-widest mb-4 px-1">Inbound Replies</h2>
              <div className="bg-card border border-card-border/60 rounded-2xl overflow-hidden max-h-[70vh] overflow-y-auto custom-scrollbar shadow-sm">
                {!replies ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-muted/30 animate-pulse rounded-lg" />)}
                  </div>
                ) : replies.length === 0 ? (
                  <div className="py-16 text-center px-4">
                    <div className="text-3xl mb-2 opacity-40">📭</div>
                    <p className="text-muted-foreground text-sm">No replies yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60">
                    {replies.map((reply) => (
                      <div key={reply._id} className="p-5 hover:bg-muted/30 transition-colors cursor-pointer">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-foreground text-xs font-semibold truncate max-w-[150px]">{(reply as any).university_name}</span>
                          {reply.classification && (
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${CLASSIFICATION_STYLES[reply.classification] ?? CLASSIFICATION_STYLES.other}`}>
                              {reply.classification.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed">{reply.raw_reply}</p>
                        <p className="text-zinc-600 text-[10px] mt-2">
                          {new Date(reply.received_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #3f3f46; border-radius: 10px; }
      `}</style>
      
      {showSkipModal && (
        <SkipUniversityModal onClose={() => setShowSkipModal(false)} />
      )}
    </div>
  );
}

function KanbanCard({ university }: { university: Doc<"universities"> }) {
  const [isHovered, setIsHovered] = useState(false);
  const enroll = useMutation(api.sequences.enroll);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      await enroll({ university_id: university._id });
    } catch (error) {
      console.error("Enrollment failed:", error);
      alert("Failed to start outreach. Ensure a primary stakeholder is assigned.");
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <div
      className={`group relative p-4 bg-muted border border-card-border/80 rounded-xl transition-all duration-200 cursor-pointer overflow-hidden ${isHovered ? "-translate-y-1 border-zinc-600 shadow-md" : "shadow-sm"}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex justify-between items-start mb-3">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
          university.lead_tier === "High" ? "bg-emerald-500/10 text-emerald-400" :
          university.lead_tier === "Medium" ? "bg-amber-500/10 text-amber-400" :
          "bg-blue-500/10 text-blue-400"
        }`}>
          {university.lead_tier || "Low"} Tier
        </span>
        <div className="text-[10px] text-muted-foreground font-mono">#{university._id.toString().slice(-4)}</div>
      </div>

      <h3 className="text-sm font-heading font-semibold text-foreground leading-snug mb-1 group-hover:text-blue-400 transition-colors">
        {university.university_name}
      </h3>
      <p className="text-xs text-muted-foreground mb-3 truncate">
        {university.city}, {university.state}
      </p>

      {university.outreach_stage === "enriched" && (
        <button
          onClick={(e) => { e.stopPropagation(); handleEnroll(); }}
          disabled={isEnrolling}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all mt-1 mb-2"
        >
          {isEnrolling ? "Starting..." : "🚀 Start Outreach"}
        </button>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-card-border/60 mt-2">
        <div className="flex -space-x-1">
          <div className="w-5 h-5 rounded-full bg-card border border-card-border flex items-center justify-center text-[8px] font-bold text-muted-foreground">
            {university.university_name[0]}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground font-medium">
          {new Date(university.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })}
        </div>
      </div>
    </div>
  );
}

function SkipUniversityModal({ onClose }: { onClose: () => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const results = useQuery(api.universities.search, { query: searchTerm });
  const skipUniversity = useMutation(api.universities.skipUniversity);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSkip = async (uniId: any) => {
    if (!confirm("Are you sure you want to skip this university? It will be removed from all active outreach pipelines permanently.")) return;
    setLoadingId(uniId);
    try {
      await skipUniversity({ id: uniId });
    } catch (e) {
      console.error(e);
      alert("Failed to skip university");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-card-border/60 shadow-2xl rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-card-border/60 flex items-center gap-3 bg-card/40">
          <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search universities to skip..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent border-none text-foreground focus:outline-none focus:ring-0 placeholder-zinc-500 text-lg"
          />
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
             <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {!searchTerm ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Type to search the database. Skipped universities will no longer be eligible for outreach.
            </div>
          ) : results === undefined ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin h-6 w-6 text-blue-500 border-2 border-current border-t-transparent rounded-full" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No universities found matching &quot;{searchTerm}&quot;
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((uni) => (
                <div key={uni._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted rounded-xl border border-card-border hover:border-card-border transition-colors gap-4">
                  <div>
                    <h4 className="text-foreground font-medium mb-1">{uni.university_name}</h4>
                    <p className="text-xs text-muted-foreground">{uni.city || "Unknown City"}, {uni.state || "Unknown State"}</p>
                    <div className="mt-2 flex gap-2">
                       <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${uni.outreach_stage === "skipped" ? "bg-red-500/10 text-red-500" : "bg-muted text-muted-foreground"}`}>
                         {uni.outreach_stage?.replace(/_/g, " ") || "new"}
                       </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSkip(uni._id)}
                    disabled={loadingId === uni._id || uni.outreach_stage === "skipped"}
                    className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 hover:bg-red-400 text-white disabled:bg-muted disabled:text-muted-foreground transition-colors"
                  >
                     <NoSymbolIcon className="h-4 w-4" />
                     {loadingId === uni._id ? "Skipping..." : uni.outreach_stage === "skipped" ? "Already Skipped" : "Skip"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
