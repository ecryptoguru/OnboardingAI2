"use client";

import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import {
  DocumentTextIcon,
  CalendarIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";

export default function ProposalsPage() {
  const proposals = useQuery(api.proposals.listAll);
  const meetingBookedUnis = useQuery(api.universities.list, { stage: "meeting_booked" });
  const generateProposal = useAction((api.actions as any).proposals.generateProposal);
  const createProposal = useMutation(api.proposals.create);
  const [generating, setGenerating] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedUniId, setSelectedUniId] = useState<string>("");

  const handleManualGenerate = async () => {
    if (!selectedUniId) return;
    setGenerating(true);
    try {
      const proposalId = await createProposal({
        university_id: selectedUniId as Id<"universities">,
        meeting_date: Date.now(),
      });
      await generateProposal({
        universityId: selectedUniId as Id<"universities">,
        proposalId,
      });
      setShowManualModal(false);
    } catch (e) {
      alert(`Failed to generate proposal: ${e}`);
    } finally {
      setGenerating(false);
    }
  };

  const noMeetingBookedUnis = meetingBookedUnis?.length === 0;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">Proposals</h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            AI-generated deal proposals — auto-created when a meeting is booked
          </p>
        </div>
        <button
          onClick={() => setShowManualModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-sm"
        >
          <DocumentTextIcon className="w-4 h-4" />
          Generate Proposal
        </button>
      </div>

      {/* Manual Generate Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border border-card-border/80 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold font-heading text-foreground mb-4">Generate Proposal</h2>
            <p className="text-muted-foreground text-sm mb-4">Select a university with a booked meeting to generate a tailored AI proposal.</p>
            <select
              value={selectedUniId}
              onChange={(e) => setSelectedUniId(e.target.value)}
              className="w-full bg-background border border-card-border/80 text-foreground rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-blue-500/50"
            >
              <option value="">Select university...</option>
              {meetingBookedUnis?.map((uni) => (
                <option key={uni._id} value={uni._id}>{uni.university_name}</option>
              ))}
              {noMeetingBookedUnis && <option disabled>No universities with meeting booked</option>}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => setShowManualModal(false)}
                className="flex-1 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleManualGenerate}
                disabled={!selectedUniId || generating}
                className="flex-1 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white rounded-lg transition-colors shadow-sm"
              >
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!proposals ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted/30 rounded-2xl border border-card-border/50" />
          ))}
        </div>
      ) : proposals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-5xl mb-4 opacity-50">📄</div>
          <h3 className="text-lg font-medium text-foreground mb-2">No proposals yet</h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            Proposals are generated automatically when a Calendly meeting is booked, or use the Generate Proposal button above.
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
  const fileUrl = useQuery(
    api.proposals.getFileUrl,
    proposal.pdf_storage_id ? { storageId: proposal.pdf_storage_id } : "skip"
  );
  const updateProposal = useMutation(api.proposals.update);
  const sendEmail = useAction(api.actions.email.sendEmail);
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);

  let content: any = null;
  try {
    if (proposal.proposal_json) content = JSON.parse(proposal.proposal_json);
  } catch {}

  const handleSend = async () => {
    if (!fileUrl) return;
    setSending(true);
    try {
      await sendEmail({
        to: "test@example.com", // In practice, fetch stakeholder email
        subject: `Fretbox Proposal — ${proposal.university_name}`,
        text: `Please find your tailored Fretbox proposal attached: ${fileUrl}`,
      });
      await updateProposal({ id: proposal._id, status: "sent" });
    } catch (e) {
      alert(`Send failed: ${e}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-muted border border-card-border/60 rounded-2xl overflow-hidden hover:border-card-border/60 transition-all flex flex-col group shadow-sm">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="bg-blue-500/10 p-2 rounded-xl">
            <DocumentTextIcon className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${
              proposal.status === "ready"
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : proposal.status === "sent"
                ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
            }`}>
              {proposal.status}
            </span>
          </div>
        </div>

        <h3 className="text-foreground font-semibold text-lg mb-1 truncate leading-tight">
          {proposal.university_name}
        </h3>

        <div className="flex items-center text-muted-foreground text-xs mb-4">
          <CalendarIcon className="w-3 h-3 mr-1" />
          {proposal.meeting_date
            ? new Date(proposal.meeting_date).toLocaleDateString()
            : "TBD"}
        </div>

        {/* Executive Summary */}
        {content?.executive_summary && (
          <div className="mb-4">
            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-1.5">Executive Summary</p>
            <p className="text-foreground text-xs leading-relaxed line-clamp-3">{content.executive_summary}</p>
          </div>
        )}

        {/* Recommended Modules */}
        {content?.recommended_modules && content.recommended_modules.length > 0 && (
          <div className="mb-4">
            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-2">Recommended Modules</p>
            <div className="flex flex-wrap gap-1">
              {content.recommended_modules.slice(0, 3).map((m: any, i: number) => (
                <span key={i} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {typeof m === "string" ? m : m.module ?? m.name ?? m}
                </span>
              ))}
              {content.recommended_modules.length > 3 && (
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  +{content.recommended_modules.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Agenda */}
        {!content?.executive_summary && proposal.agenda && (
          <div className="mb-4">
            <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-widest mb-2 px-1">Meeting Agenda</p>
            <div className="bg-card rounded-xl p-3 border border-card-border/80">
              <p className="text-foreground text-xs line-clamp-3 leading-relaxed">
                {proposal.agenda.split("\n").map((line: string, i: number) => (
                  <span key={i} className="block mb-1 opacity-80 last:mb-0">
                    {line.startsWith("-") || line.startsWith("1.") ? line : `• ${line}`}
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-auto pt-2">
          {proposal.pdf_storage_id && fileUrl ? (
            <>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-muted text-foreground/80 py-2 rounded-xl text-sm font-semibold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 border border-card-border/50"
              >
                <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                View PDF
              </a>
              {proposal.status !== "sent" && (
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  {sending ? "Sending..." : "Send"}
                </button>
              )}
            </>
          ) : (
            <button className="flex-1 bg-muted border border-card-border/50 text-foreground/50 py-2 rounded-xl text-sm font-semibold cursor-not-allowed flex items-center justify-center gap-2">
              <ClockIcon className="w-4 h-4" />
              {proposal.status === "draft" ? "Generating PDF..." : "Processing..."}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
