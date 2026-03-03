"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";

const COLUMNS = [
  { id: "enriched", label: "Ready to Sequence", color: "indigo" },
  { id: "outreach_active", label: "Outreach Active", color: "blue" },
  { id: "replied", label: "Replied", color: "green" },
  { id: "meeting_booked", label: "Meeting Booked", color: "yellow" },
  { id: "not_interested", label: "Not Interested", color: "red" },
] as const;

export default function OutreachPage() {
  const universities = useQuery(api.universities.list, {});
  const updateStage = useMutation(api.universities.update);

  if (!universities) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const grouped = universities.reduce((acc, uni) => {
    const stage = uni.outreach_stage || "new";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(uni);
    return acc;
  }, {} as Record<string, typeof universities>);

  return (
    <div className="p-8 pb-20">
      <div className="mb-10 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Outreach Pipeline</h1>
          <p className="text-zinc-400 text-sm mt-1.5 font-medium">
            Real-time tracking of university engagement and follow-up status.
          </p>
        </div>
        <div className="flex gap-3">
           <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-xs font-semibold text-zinc-300">
             Total: {universities.length}
           </div>
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-8 min-h-[70vh] custom-scrollbar">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-80">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full bg-${col.color}-500 shadow-[0_0_8px_rgba(var(--tw-color-${col.color}-500),0.5)]`} />
                <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-widest">{col.label}</h2>
              </div>
              <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full ring-1 ring-zinc-700">
                {grouped[col.id]?.length || 0}
              </span>
            </div>

            <div className="flex flex-col gap-3 min-h-[100px] p-2 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 backdrop-blur-md">
              {(grouped[col.id] || []).map((uni) => (
                <KanbanCard key={uni._id} university={uni} onUpdateStage={updateStage} />
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
    </div>
  );
}

function KanbanCard({ university, onUpdateStage }: { university: Doc<"universities">, onUpdateStage: any }) {
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
      className={`group relative p-4 bg-zinc-900/80 border border-zinc-800 rounded-xl transition-all duration-300 cursor-pointer overflow-hidden ${isHovered ? 'shadow-[0_8px_30px_rgb(0,0,0,0.4)] -translate-y-1 border-zinc-700' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Glossy gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />
      
      <div className="flex justify-between items-start mb-2">
        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
          university.lead_tier === "High" ? "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20" :
          university.lead_tier === "Medium" ? "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20" :
          "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20"
        }`}>
          {university.lead_tier || "Low"} Tier
        </span>
        <div className="text-[10px] text-zinc-500 font-mono">
          #{university._id.toString().slice(-4)}
        </div>
      </div>

      <h3 className="text-sm font-bold text-white leading-snug mb-1 group-hover:text-indigo-300 transition-colors">
        {university.university_name}
      </h3>
      <p className="text-xs text-zinc-500 mb-3 truncate">
        {university.city}, {university.state}
      </p>

      {university.outreach_stage === "enriched" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleEnroll();
          }}
          disabled={isEnrolling}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 mt-1 mb-2"
        >
          {isEnrolling ? "Starting..." : "🚀 Start Outreach"}
        </button>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/50 mt-2">
        <div className="flex -space-x-1">
          {/* Stakeholder avatars circle (placeholder) */}
          <div className="w-5 h-5 rounded-full bg-zinc-800 border-2 border-zinc-900 flex items-center justify-center text-[8px] font-bold text-zinc-400">
            {university.university_name[0]}
          </div>
        </div>
        <div className="text-[10px] text-zinc-400 font-medium">
          {new Date(university.updated_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </div>
      </div>


      {/* Action Popover for Stage Switching */}
      <div className={`absolute bottom-2 right-2 flex gap-1 transition-opacity duration-200 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            // In a real app, this would show a menu. Here we'll just cycle for demo.
          }}
          className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
