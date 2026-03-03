"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { 
  DocumentTextIcon, 
  CalendarIcon, 
  ClockIcon, 
  CheckBadgeIcon,
  ArrowTopRightOnSquareIcon,
  ArrowDownTrayIcon
} from "@heroicons/react/24/outline";

export default function ProposalsPage() {
  const proposals = useQuery(api.proposals.listAll);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Proposals</h1>
        <p className="text-zinc-400 text-sm mt-1">
          AI-generated deal proposals — auto-created when a meeting is booked
        </p>
      </div>

      {!proposals ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-zinc-900/50 rounded-2xl border border-white/5" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4 opacity-50">📄</div>
          <h3 className="text-lg font-medium text-white mb-2">No proposals yet</h3>
          <p className="text-zinc-400 text-sm max-w-sm">
            Proposals are generated automatically when a Calendly meeting is booked via the outreach loop.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {proposals.map((proposal) => (
            <ProposalCard key={proposal._id} proposal={proposal} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: any }) {
  const fileUrl = useQuery(api.proposals.getFileUrl, 
    proposal.pdf_storage_id ? { storageId: proposal.pdf_storage_id } : "skip"
  );

  return (
    <div
      className="bg-zinc-900/50 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all flex flex-col group"
    >
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="bg-blue-500/10 p-2 rounded-xl">
            <DocumentTextIcon className="w-6 h-6 text-blue-400" />
          </div>
          <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${
            proposal.status === "ready" 
            ? "bg-green-500/20 text-green-400 border border-green-500/20" 
            : "bg-amber-500/20 text-amber-400 border border-amber-500/20"
          }`}>
            {proposal.status}
          </span>
        </div>

        <h3 className="text-white font-semibold text-lg mb-1 truncate leading-tight">
          {proposal.university_name}
        </h3>
        
        <div className="flex items-center text-zinc-400 text-xs mb-4">
          <CalendarIcon className="w-3 h-3 mr-1" />
          {proposal.meeting_date 
            ? new Date(proposal.meeting_date).toLocaleDateString() 
            : "TBD"}
        </div>

        {proposal.agenda && (
          <div className="mb-4 text-left">
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mb-2 px-1">Meeting Agenda</p>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5">
              <p className="text-zinc-300 text-xs line-clamp-3 leading-relaxed">
                {proposal.agenda.split('\n').map((line: string, i: number) => (
                  <span key={i} className="block mb-1 opacity-80 last:mb-0">
                    {line.startsWith('-') || line.startsWith('1.') ? line : `• ${line}`}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-auto">
          {proposal.pdf_storage_id && fileUrl ? (
            <a 
              href={fileUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex-1 bg-white text-black py-2 rounded-xl text-sm font-semibold hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              View PDF
            </a>
          ) : (
            <button className="flex-1 bg-zinc-800 text-white/50 py-2 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2">
              <ClockIcon className="w-4 h-4" />
              Processing...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
