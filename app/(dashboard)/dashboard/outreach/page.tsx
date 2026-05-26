"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useState, useEffect } from "react";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  NoSymbolIcon,
  ChevronRightIcon,
  EnvelopeOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PlayIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import { useRequireGeminiKey } from "../../../../components/ApiKeyModal";
import { useToast } from "../../../../components/Toast";

const COLUMNS = [
  { id: "enriched", label: "Ready to Sequence", color: "sky" },
  { id: "outreach_active", label: "Outreach Active", color: "blue" },
  { id: "replied", label: "Replied", color: "emerald" },
  { id: "meeting_booked", label: "Meeting Booked", color: "amber" },
  { id: "not_interested", label: "Not Interested", color: "red" },
] as const;

const COLUMN_DOT_COLOR: Record<string, string> = {
  sky: "bg-sky-500",
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

const CLASSIFICATION_STYLES: Record<string, string> = {
  meeting_request:
    "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25",
  positive_interest: "bg-blue-500/10 text-blue-400 border border-blue-500/25",
  request_info: "bg-sky-500/10 text-sky-400 border border-sky-500/25",
  not_interested: "bg-red-500/10 text-red-400 border border-red-500/25",
  opt_out: "bg-orange-500/10 text-orange-400 border border-orange-500/25",
  out_of_office:
    "bg-zinc-500/10 text-muted-foreground border border-zinc-500/25",
  other: "bg-muted text-muted-foreground border border-card-border",
};

const EMAIL_STATUS_ICON: Record<string, React.ReactNode> = {
  sent: <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />,
  delivered: <span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />,
  opened: <EnvelopeOpenIcon className="w-3 h-3 text-emerald-400" />,
  clicked: <CheckCircleIcon className="w-3 h-3 text-emerald-500" />,
  bounced: <ExclamationCircleIcon className="w-3 h-3 text-red-400" />,
  failed: <ExclamationCircleIcon className="w-3 h-3 text-red-500" />,
  pending_approval: <ClockIcon className="w-3 h-3 text-amber-400" />,
};

export default function OutreachPage() {
  const universities = useQuery(api.universities.list, {});
  const replies = useQuery(api.replies.list, {});
  // const funnel = useQuery(api.universities.getFunnelStats);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [timelineUniId, setTimelineUniId] = useState<Id<"universities"> | null>(
    null,
  );
  const [simulateUni, setSimulateUni] = useState<Doc<"universities"> | null>(
    null,
  );

  if (!universities) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const grouped = universities.reduce(
    (acc: Record<string, Doc<"universities">[]>, uni: Doc<"universities">) => {
      const stage = uni.outreach_stage || "new";
      if (!acc[stage]) acc[stage] = [];
      acc[stage].push(uni);
      return acc;
    },
    {} as Record<string, Doc<"universities">[]>,
  );

  const replyCount = replies?.length ?? 0;
  const activeCount = grouped["outreach_active"]?.length ?? 0;
  const repliedCount =
    (grouped["replied"]?.length ?? 0) +
    (grouped["meeting_booked"]?.length ?? 0);
  const replyRate =
    activeCount > 0 ? Math.round((repliedCount / activeCount) * 100) : 0;

  return (
    <div className="p-8 pb-20">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
            Outreach Pipeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5 font-medium">
            Real-time tracking of university engagement and follow-up status.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard/outreach/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm"
          >
            <PlayIcon className="h-4 w-4" />
            Client Demo View
          </a>
          <button
            type="button"
            onClick={() => setShowSkipModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-card-border hover:border-zinc-600 text-foreground rounded-lg text-sm font-medium transition-all duration-200"
          >
            <NoSymbolIcon className="h-4 w-4" />
            Skip University
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          {
            label: "Active Outreach",
            value: activeCount,
            color: "text-blue-400",
          },
          {
            label: "Replied",
            value: grouped["replied"]?.length ?? 0,
            color: "text-emerald-400",
          },
          {
            label: "Meetings Booked",
            value: grouped["meeting_booked"]?.length ?? 0,
            color: "text-amber-400",
          },
          {
            label: "Reply Rate",
            value: `${replyRate}%`,
            color: "text-sky-400",
          },
          {
            label: "Total Replies (Log)",
            value: replyCount,
            color: "text-white",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-card border border-card-border/60 rounded-xl p-5 shadow-sm"
          >
            <p className="text-muted-foreground text-xs font-medium mb-1 uppercase tracking-wider">
              {stat.label}
            </p>
            <p className={`text-3xl font-heading font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Main: Kanban + Replies side by side */}
      <div className="flex gap-6">
        {/* Kanban board */}
        <div className="flex-1 flex gap-5 overflow-x-auto pb-6 min-h-[60vh]">
          {COLUMNS.map((col) => (
            <div key={col.id} className="flex-shrink-0 w-64">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${COLUMN_DOT_COLOR[col.color]}`}
                  />
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-widest">
                    {col.label}
                  </h2>
                </div>
                <span className="text-[10px] font-bold bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ring-1 ring-zinc-700">
                  {grouped[col.id]?.length || 0}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 min-h-[100px] p-2 rounded-2xl bg-background border border-card-border/60">
                {(grouped[col.id] || []).map((uni: Doc<"universities">) => (
                  <KanbanCard
                    key={uni._id}
                    university={uni}
                    onViewTimeline={() => setTimelineUniId(uni._id)}
                    onSimulateReply={() => setSimulateUni(uni)}
                  />
                ))}
                {(!grouped[col.id] || grouped[col.id].length === 0) && (
                  <div className="py-10 text-center">
                    <p className="text-zinc-600 text-[10px] font-medium uppercase tracking-tighter italic">
                      Empty
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Always-visible replies panel */}
        <div className="w-72 flex-shrink-0">
          <div className="sticky top-0">
            <div className="flex items-center gap-2 mb-3 px-1">
              <ChatBubbleLeftRightIcon className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xs font-bold text-foreground uppercase tracking-widest">
                Inbound Replies
              </h2>
              {replyCount > 0 && (
                <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {replyCount}
                </span>
              )}
            </div>
            <div className="bg-card border border-card-border/60 rounded-2xl overflow-hidden max-h-[72vh] overflow-y-auto shadow-sm">
              {!replies ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-20 bg-muted/30 animate-pulse rounded-lg"
                    />
                  ))}
                </div>
              ) : replies.length === 0 ? (
                <div className="py-16 text-center px-4">
                  <div className="text-3xl mb-2 opacity-40">📭</div>
                  <p className="text-muted-foreground text-sm">
                    No replies yet
                  </p>
                  <p className="text-muted-foreground text-xs mt-1 opacity-60">
                    Use &quot;Simulate Reply&quot; on any active card to test
                    the flow
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {replies.map((reply: Doc<"replyLogs">) => (
                    <div
                      key={reply._id}
                      className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-foreground text-xs font-semibold truncate max-w-[130px]">
                          {
                            (
                              reply as Doc<"replyLogs"> & {
                                university_name?: string;
                              }
                            ).university_name
                          }
                        </span>
                        {reply.classification && (
                          <span
                            className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${CLASSIFICATION_STYLES[reply.classification] ?? CLASSIFICATION_STYLES.other}`}
                          >
                            {reply.classification.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed">
                        {reply.raw_reply}
                      </p>
                      <p className="text-zinc-600 text-[10px] mt-1.5">
                        {new Date(reply.received_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showSkipModal && (
        <SkipUniversityModal onClose={() => setShowSkipModal(false)} />
      )}
      {timelineUniId && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setTimelineUniId(null)}
          />
          <UniversityTimelineDrawer
            universityId={timelineUniId}
            onClose={() => setTimelineUniId(null)}
          />
        </>
      )}
      {simulateUni && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setSimulateUni(null)}
          />
          <SimulateReplyModal
            university={simulateUni}
            onClose={() => setSimulateUni(null)}
          />
        </>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #3f3f46;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KanbanCard({
  university,
  onViewTimeline,
  onSimulateReply,
}: {
  university: Doc<"universities">;
  onViewTimeline: () => void;
  onSimulateReply: () => void;
}) {
  const { show, toastElement } = useToast();
  const enroll = useMutation(api.sequences.enroll);
  const revertStage = useMutation(api.universities.revertStage);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const sequences = useQuery(api.sequences.listByUniversity, {
    university_id: university._id,
  });

  const activeSeq = sequences?.find(
    (s: Doc<"outreachSequences">) =>
      s.status === "active" || s.status === "pending_approval",
  );
  const totalSteps = activeSeq?.total_steps ?? 4;
  const currentStep = activeSeq?.current_step ?? 0;
  const progressPct =
    totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  const handleEnroll = async () => {
    setIsEnrolling(true);
    try {
      await enroll({ university_id: university._id });
    } catch {
      show(
        "Failed to start outreach. Ensure a primary stakeholder is assigned.",
        "error",
      );
    } finally {
      setIsEnrolling(false);
    }
  };

  return (
    <div className="group relative p-3.5 bg-muted border border-card-border/80 rounded-xl hover:border-zinc-600 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer shadow-sm overflow-hidden">
      {/* Tier + ID */}
      <div className="flex justify-between items-start mb-2.5">
        <span
          className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
            university.lead_tier === "High"
              ? "bg-emerald-500/10 text-emerald-400"
              : university.lead_tier === "Medium"
                ? "bg-amber-500/10 text-amber-400"
                : "bg-blue-500/10 text-blue-400"
          }`}
        >
          {university.lead_tier || "—"} Tier
        </span>
        {university.outreach_stage === "meeting_booked" && (
          <span className="text-[9px] font-bold text-amber-400">
            📅 Meeting
          </span>
        )}
      </div>

      <h3 className="text-xs font-heading font-semibold text-foreground leading-snug mb-1 group-hover:text-blue-400 transition-colors">
        {university.university_name}
      </h3>
      <p className="text-[10px] text-muted-foreground mb-2.5 truncate">
        {[university.city, university.state].filter(Boolean).join(", ") || "—"}
      </p>

      {/* Sequence progress */}
      {activeSeq && (
        <div className="mb-2.5">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>
              Step {currentStep} of {totalSteps}
            </span>
            <span
              className={`font-medium ${activeSeq.status === "pending_approval" ? "text-amber-400" : "text-blue-400"}`}
            >
              {activeSeq.status === "pending_approval"
                ? "⏳ Awaiting Approval"
                : "Active"}
            </span>
          </div>
          <div className="h-1 bg-card rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1.5 mt-1">
        {university.outreach_stage !== "enriched" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Move ${university.university_name} back a step?`)) {
                setIsReverting(true);
                revertStage({ id: university._id }).finally(() =>
                  setIsReverting(false),
                );
              }
            }}
            disabled={isReverting}
            className="py-1.5 px-2 bg-muted border border-card-border/80 hover:border-zinc-500 text-muted-foreground hover:text-foreground rounded-lg transition-all flex items-center justify-center"
            title="Move back a step"
            aria-label="Move back a step"
          >
            <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
          </button>
        )}
        {university.outreach_stage === "enriched" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleEnroll();
            }}
            disabled={isEnrolling}
            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-muted disabled:text-muted-foreground text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
          >
            {isEnrolling ? "Starting..." : "🚀 Begin Sequence"}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewTimeline();
          }}
          className="flex-1 py-1.5 bg-card border border-card-border/80 hover:border-zinc-500 text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1"
        >
          Timeline
          <ChevronRightIcon className="w-3 h-3" />
        </button>
        {(university.outreach_stage === "outreach_active" ||
          university.outreach_stage === "replied") && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSimulateReply();
            }}
            className="py-1.5 px-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-bold rounded-lg transition-all"
            title="Simulate inbound reply"
            aria-label="Simulate inbound reply"
          >
            ↩️
          </button>
        )}
      </div>
      {toastElement}
    </div>
  );
}

// ─── Timeline Drawer ──────────────────────────────────────────────────────────
function UniversityTimelineDrawer({
  universityId,
  onClose,
}: {
  universityId: Id<"universities">;
  onClose: () => void;
}) {
  const uni = useQuery(api.universities.get, { id: universityId });
  const emails = useQuery(api.emails.listByUniversity, {
    university_id: universityId,
  });
  const replies = useQuery(api.replies.listByUniversity, {
    university_id: universityId,
  });
  const sequences = useQuery(api.sequences.listByUniversity, {
    university_id: universityId,
  });

  interface TimelineEvent {
    ts: number;
    type: "email" | "reply";
    data: Record<string, unknown>;
  }
  const timeline: TimelineEvent[] = [
    ...(emails ?? []).map((e: Doc<"emailsSent">) => ({
      ts: e.sent_at ?? e._creationTime,
      type: "email" as const,
      data: e as Record<string, unknown>,
    })),
    ...(replies ?? []).map((r: Doc<"replyLogs">) => ({
      ts: r.received_at,
      type: "reply" as const,
      data: r as Record<string, unknown>,
    })),
  ].sort((a, b) => b.ts - a.ts);

  const activeSeq = sequences?.find(
    (s: Doc<"outreachSequences">) =>
      s.status === "active" ||
      s.status === "pending_approval" ||
      s.status === "completed",
  );

  return (
    <div className="fixed right-0 top-0 h-full w-[480px] bg-card border-l border-card-border z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-5 border-b border-card-border flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-foreground text-lg truncate max-w-[340px]">
            {uni?.university_name ?? "Loading..."}
          </h2>
          {activeSeq && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Sequence: Step {activeSeq.current_step} of {activeSeq.total_steps}{" "}
              ·{" "}
              <span
                className={`font-semibold ${activeSeq.status === "completed" ? "text-emerald-400" : activeSeq.status === "pending_approval" ? "text-amber-400" : "text-blue-400"}`}
              >
                {activeSeq.status.replace(/_/g, " ")}
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close timeline"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Stage badge */}
      {uni && (
        <div className="px-5 py-3 bg-background border-b border-card-border/40 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Stage:</span>
          <span
            className={`text-xs font-bold uppercase px-2 py-0.5 rounded-full ${
              uni.outreach_stage === "meeting_booked"
                ? "bg-amber-500/10 text-amber-400"
                : uni.outreach_stage === "replied"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : uni.outreach_stage === "outreach_active"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-muted text-muted-foreground"
            }`}
          >
            {(uni.outreach_stage ?? "new").replace(/_/g, " ")}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {timeline.length} events
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 custom-scrollbar">
        {timeline.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No activity yet for this university.
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-3.5 top-0 bottom-0 w-px bg-card-border/40" />
            <div className="space-y-4">
              {timeline.map((event, i) => {
                if (event.type === "email") {
                  const e = event.data;
                  const status = String(e.status ?? "");
                  const stepNum = Number(e.step_number ?? 0);
                  const subject = String(e.subject ?? "");
                  const stName = e.stakeholder_name
                    ? String(e.stakeholder_name)
                    : null;
                  const stEmail = e.stakeholder_email
                    ? String(e.stakeholder_email)
                    : null;
                  return (
                    <div key={i} className="flex gap-3 relative">
                      <div className="w-7 h-7 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 z-10">
                        {EMAIL_STATUS_ICON[status] ?? (
                          <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
                        )}
                      </div>
                      <div className="flex-1 bg-muted border border-card-border/60 rounded-xl p-3 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-foreground">
                            {stepNum === 99 ? "Auto-Reply" : `Step ${stepNum}`}{" "}
                            Email
                          </span>
                          <span
                            className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${
                              status === "opened" || status === "clicked"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : status === "sent" || status === "delivered"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  : status === "pending_approval"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : status === "bounced"
                                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                                      : "bg-muted text-muted-foreground border-card-border"
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                        <p className="text-xs text-foreground font-medium truncate">
                          {subject}
                        </p>
                        {stName && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            To: {stName} {stEmail ? `<${stEmail}>` : ""}
                          </p>
                        )}
                        <p className="text-[10px] text-zinc-600 mt-1.5">
                          {new Date(event.ts).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (event.type === "reply") {
                  const r = event.data;
                  const classification = r.classification
                    ? String(r.classification)
                    : null;
                  const rawReply = String(r.raw_reply ?? "");
                  return (
                    <div key={i} className="flex gap-3 relative">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 z-10">
                        <ChatBubbleLeftRightIcon className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-emerald-400">
                            Inbound Reply
                          </span>
                          {classification && (
                            <span
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${CLASSIFICATION_STYLES[classification] ?? CLASSIFICATION_STYLES.other}`}
                            >
                              {classification.replace(/_/g, " ")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground line-clamp-3 leading-relaxed">
                          {rawReply}
                        </p>
                        <p className="text-[10px] text-zinc-600 mt-1.5">
                          {new Date(
                            Number(r.received_at ?? event.ts),
                          ).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Simulate Reply Modal ─────────────────────────────────────────────────────
function SimulateReplyModal({
  university,
  onClose,
}: {
  university: Doc<"universities">;
  onClose: () => void;
}) {
  const stakeholders = useQuery(api.stakeholders.listByUniversity, {
    university_id: university._id,
  });
  const createReply = useMutation(api.replies.create);
  const classifyReply = useAction(api.actions.replyClassifier.classifyReply);
  const [selectedStakeholderId, setSelectedStakeholderId] = useState<
    Id<"stakeholders"> | ""
  >("");
  const [replyText, setReplyText] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { withKeyCheck, keyModal } = useRequireGeminiKey();

  const primarySt =
    stakeholders?.find((s: Doc<"stakeholders">) => s.is_primary) ??
    stakeholders?.[0];

  useEffect(() => {
    if (primarySt && !selectedStakeholderId)
      setSelectedStakeholderId(primarySt._id);
  }, [primarySt, selectedStakeholderId]);

  const resetForm = () => {
    setDone(null);
    setError(null);
    setReplyText("");
  };

  const PRESETS = [
    {
      label: "📅 Meeting Request",
      text: "Hi Ashish, thanks for reaching out! I'd love to schedule a demo. Can we connect next Tuesday at 3 PM?",
    },
    {
      label: "✅ Positive Interest",
      text: "This looks interesting. Could you send me more details about the platform pricing and features?",
    },
    {
      label: "ℹ️ Info Request",
      text: "What modules do you offer specifically for hostel management? We're looking to digitize our hostel operations.",
    },
    {
      label: "❌ Not Interested",
      text: "Thank you for reaching out, but we're not looking for new software solutions at the moment.",
    },
    {
      label: "🏖️ Out of Office",
      text: "Thank you for your email. I am currently out of the office until March 20th and will respond upon my return.",
    },
  ];

  const handleSimulate = async () => {
    if (!replyText.trim() || !selectedStakeholderId) return;
    setRunning(true);
    setError(null);
    try {
      const replyId = await createReply({
        university_id: university._id,
        stakeholder_id: selectedStakeholderId,
        raw_reply: replyText,
      });
      const result = await classifyReply({ replyId });
      setDone(result.classification ?? "other");
    } catch (e) {
      setError(`Simulation failed: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border/80 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold font-heading text-foreground">
              Simulate Inbound Reply
            </h2>
            <p className="text-muted-foreground text-sm">
              {university.university_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground"
            aria-label="Close simulator"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">
              {done === "meeting_request"
                ? "🎉"
                : done === "positive_interest"
                  ? "✅"
                  : done === "not_interested"
                    ? "❌"
                    : "📧"}
            </div>
            <p className="text-foreground font-semibold mb-1">
              Reply Processed!
            </p>
            <p className="text-muted-foreground text-sm mb-1">
              Classification:
            </p>
            <span
              className={`text-sm font-bold uppercase px-3 py-1 rounded-full ${CLASSIFICATION_STYLES[done] ?? CLASSIFICATION_STYLES.other}`}
            >
              {done.replace(/_/g, " ")}
            </span>
            {done === "meeting_request" && (
              <p className="text-emerald-400 text-xs mt-3 font-medium">
                🚀 Draft proposal created for human review.
              </p>
            )}
            <p className="text-muted-foreground text-xs mt-3">
              Stage updated and auto-reply sent (if applicable). Check the
              Kanban board and Replies panel.
            </p>
            <div className="flex gap-3 justify-center mt-5">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-muted hover:bg-zinc-700 text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                Simulate Another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Stakeholder */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Replying Stakeholder
              </label>
              <select
                value={selectedStakeholderId}
                onChange={(e) =>
                  setSelectedStakeholderId(e.target.value as Id<"stakeholders">)
                }
                className="w-full bg-background border border-card-border/80 text-foreground rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500/50"
              >
                {stakeholders?.map((st: Doc<"stakeholders">) => (
                  <option key={st._id} value={st._id}>
                    {st.name || "Unspecified Contact"}{" "}
                    {st.role ? `— ${st.role}` : ""}{" "}
                    {st.email ? `(${st.email})` : "(no email)"}
                  </option>
                ))}
              </select>
            </div>

            {/* Presets */}
            <div className="mb-3">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.label}
                    onClick={() => setReplyText(p.text)}
                    className="text-[11px] font-medium px-2 py-1 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg border border-card-border transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reply text */}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Reply Content
              </label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={5}
                placeholder="Paste or type the inbound email reply here..."
                className="w-full bg-background border border-card-border/80 text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500/50 resize-none"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-sm font-medium text-muted-foreground bg-muted rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={withKeyCheck(handleSimulate)}
                disabled={
                  !replyText.trim() || !selectedStakeholderId || running
                }
                className="flex-[2] py-2 text-sm font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:bg-muted text-white rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {running ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Classifying...
                  </>
                ) : (
                  "Simulate Reply →"
                )}
              </button>
            </div>
          </>
        )}
      </div>
      {keyModal}
    </div>
  );
}

// ─── Skip University Modal ────────────────────────────────────────────────────
function SkipUniversityModal({ onClose }: { onClose: () => void }) {
  const { show, toastElement } = useToast();
  const [tab, setTab] = useState<"skip" | "list">("skip");
  const [searchTerm, setSearchTerm] = useState("");
  const results = useQuery(api.universities.search, { query: searchTerm });
  const skippedList = useQuery(api.universities.listSkipped, {});
  const skipUniversity = useMutation(api.universities.skipUniversity);
  const unskipUniversity = useMutation(api.universities.unskipUniversity);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSkip = async (uniId: Id<"universities">) => {
    if (
      !confirm(
        "Are you sure you want to skip this university? It will be removed from all active outreach pipelines permanently.",
      )
    )
      return;
    setLoadingId(uniId);
    try {
      await skipUniversity({ id: uniId });
    } catch {
      show("Failed to skip university", "error");
    } finally {
      setLoadingId(null);
    }
  };

  const handleUnskip = async (uniId: Id<"universities">) => {
    setLoadingId(uniId);
    try {
      await unskipUniversity({ id: uniId });
    } catch {
      show("Failed to unskip university", "error");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-card-border/60 shadow-2xl rounded-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="p-4 border-b border-card-border/60 flex items-center gap-3 bg-card/40">
          <NoSymbolIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <span className="text-foreground font-semibold text-base flex-1">
            Skipped Universities
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close skip modal"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-card-border/60 bg-card/20 px-4">
          {[
            { id: "skip" as const, label: "Skip a University" },
            {
              id: "list" as const,
              label: `Skipped List${skippedList ? ` (${skippedList.length})` : ""}`,
            },
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 px-4 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Skip University */}
        {tab === "skip" && (
          <>
            <div className="p-4 border-b border-card-border/40 flex items-center gap-2 bg-background/30">
              <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search universities to skip..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent border-none text-foreground focus:outline-none focus:ring-0 placeholder-zinc-500 text-sm"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="p-1 hover:bg-muted rounded-lg text-muted-foreground"
                  aria-label="Clear search"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              {!searchTerm ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  Type to search. Skipped universities will no longer be
                  eligible for outreach.
                </div>
              ) : results === undefined ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin h-6 w-6 text-blue-500 border-2 border-current border-t-transparent rounded-full" />
                </div>
              ) : results.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No universities found
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map((uni: Doc<"universities">) => (
                    <div
                      key={uni._id}
                      className="flex items-center justify-between p-4 bg-muted rounded-xl border border-card-border gap-4"
                    >
                      <div className="min-w-0">
                        <h4 className="text-foreground font-medium mb-0.5 truncate">
                          {uni.university_name}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {[uni.city, uni.state].filter(Boolean).join(", ")}
                        </p>
                      </div>
                      {uni.outreach_stage === "skipped" ? (
                        <span className="flex-shrink-0 text-xs font-bold text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20">
                          Already Skipped
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSkip(uni._id)}
                          disabled={loadingId === uni._id}
                          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-red-500 hover:bg-red-400 text-white disabled:bg-muted disabled:text-muted-foreground transition-colors"
                        >
                          <NoSymbolIcon className="h-4 w-4" />
                          {loadingId === uni._id ? "Skipping..." : "Skip"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Skipped List */}
        {tab === "list" && (
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {skippedList === undefined ? (
              <div className="py-12 flex justify-center">
                <div className="animate-spin h-6 w-6 text-blue-500 border-2 border-current border-t-transparent rounded-full" />
              </div>
            ) : skippedList.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-4xl mb-3 opacity-40">✅</div>
                <p className="text-foreground font-semibold mb-1">
                  No skipped universities
                </p>
                <p className="text-muted-foreground text-sm">
                  Universities you skip will appear here for review.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3 px-1">
                  {skippedList.length}{" "}
                  {skippedList.length === 1 ? "university" : "universities"}{" "}
                  currently skipped. Unskipping moves them back to{" "}
                  <span className="text-sky-400 font-medium">
                    Ready to Sequence
                  </span>
                  .
                </p>
                {skippedList.map((uni: Doc<"universities">) => (
                  <div
                    key={uni._id}
                    className="flex items-center justify-between p-4 bg-muted rounded-xl border border-card-border gap-4"
                  >
                    <div className="min-w-0">
                      <h4 className="text-foreground font-medium mb-0.5 truncate">
                        {uni.university_name}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {[uni.city, uni.state].filter(Boolean).join(", ")}
                        {uni.lead_tier && (
                          <span
                            className={`ml-2 font-semibold ${
                              uni.lead_tier === "High"
                                ? "text-emerald-400"
                                : uni.lead_tier === "Medium"
                                  ? "text-amber-400"
                                  : "text-blue-400"
                            }`}
                          >
                            · {uni.lead_tier} Tier
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleUnskip(uni._id)}
                      disabled={loadingId === uni._id}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground text-white transition-colors"
                    >
                      {loadingId === uni._id ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>▶ Unskip</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {toastElement}
    </div>
  );
}
