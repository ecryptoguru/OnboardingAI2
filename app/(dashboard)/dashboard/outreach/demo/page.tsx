"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { useState, useEffect } from "react";
import {
  EnvelopeOpenIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  ChartBarIcon,
  PlayIcon,
  PauseIcon,
  ArrowsPointingOutIcon,
} from "@heroicons/react/24/outline";

// ─── Stage Config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  enriched:       { label: "Ready to Sequence", color: "text-sky-400",     bg: "bg-sky-500/10 border-sky-500/20",     dot: "bg-sky-500" },
  outreach_active:{ label: "Outreach Active",   color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",   dot: "bg-blue-500" },
  replied:        { label: "Replied",            color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-500" },
  meeting_booked: { label: "Meeting Booked",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20", dot: "bg-amber-400" },
  proposal_sent:  { label: "Proposal Sent",     color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20", dot: "bg-violet-500" },
  closed:         { label: "Closed",            color: "text-green-400",   bg: "bg-green-500/10 border-green-500/20", dot: "bg-green-500" },
  not_interested: { label: "Not Interested",    color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",     dot: "bg-red-500" },
};

// Ordered pipeline columns for demo view
const PIPELINE_COLUMNS = [
  "enriched",
  "outreach_active",
  "replied",
  "meeting_booked",
  "proposal_sent",
  "closed",
];

export default function DemoPage() {
  const universities = useQuery(api.universities.list, {});
  const funnel = useQuery(api.universities.getFunnelStats);
  const replies = useQuery(api.replies.list, {});
  const [isPresenting, setIsPresenting] = useState(false);
  const [highlightStage, setHighlightStage] = useState<string | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlayIdx, setAutoPlayIdx] = useState(0);

  // Auto-play cycles through pipeline stages to tell the story
  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      setAutoPlayIdx((i) => {
        const next = (i + 1) % PIPELINE_COLUMNS.length;
        setHighlightStage(PIPELINE_COLUMNS[next]);
        return next;
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [autoPlay]);

  const grouped = (universities ?? []).reduce((acc, uni) => {
    const stage = uni.outreach_stage || "new";
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(uni);
    return acc;
  }, {} as Record<string, NonNullable<typeof universities>>);

  const totalActive = (grouped["outreach_active"] ?? []).length;
  const totalReplied = (grouped["replied"] ?? []).length + (grouped["meeting_booked"] ?? []).length;
  const replyRate = totalActive > 0 ? Math.round((totalReplied / totalActive) * 100) : 0;

  const KPI_CARDS = [
    { label: "Universities in Pipeline", value: funnel?.total ?? 0, color: "text-blue-400", icon: "🏛️" },
    { label: "Active Outreach",          value: funnel?.outreachActive ?? 0, color: "text-sky-400", icon: "✉️" },
    { label: "Meetings Booked",          value: funnel?.meetingBooked ?? 0, color: "text-amber-400", icon: "📅" },
    { label: "Proposals Sent",          value: funnel?.proposalSent ?? 0, color: "text-violet-400", icon: "📄" },
    { label: "Reply Rate",              value: `${replyRate}%`, color: "text-emerald-400", icon: "💬" },
    { label: "Closed / Won",            value: funnel?.closed ?? 0, color: "text-green-400", icon: "🏆" },
  ];

  return (
    <div className={`min-h-screen bg-background transition-all duration-500 ${isPresenting ? "p-6" : "p-8 pb-20"}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/20">
              🎯 Live Demo
            </span>
            {autoPlay && (
              <span className="text-xs font-medium text-emerald-400 animate-pulse">
                ● Auto-presenting
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Fretbox Outreach Pipeline
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time AI-driven university outreach · Powered by Fretbox
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Auto-play toggle */}
          <button
            onClick={() => { setAutoPlay(!autoPlay); if (!autoPlay) setHighlightStage(PIPELINE_COLUMNS[0]); else setHighlightStage(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
              autoPlay
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600"
                : "bg-card border-card-border text-muted-foreground hover:text-foreground hover:border-zinc-600"
            }`}
          >
            {autoPlay ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
            {autoPlay ? "Pause" : "Auto-Present"}
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => { document.documentElement.requestFullscreen?.(); setIsPresenting(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-card-border rounded-xl text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-zinc-600 transition-all"
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
            Fullscreen
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-6 gap-4 mb-8">
        {KPI_CARDS.map((kpi) => (
          <div key={kpi.label} className="bg-card border border-card-border/60 rounded-2xl p-5 shadow-sm hover:border-zinc-600 transition-colors">
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <p className={`text-3xl font-bold font-heading ${kpi.color}`}>{kpi.value}</p>
            <p className="text-muted-foreground text-xs font-medium mt-1 uppercase tracking-wide">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* ── Pipeline Funnel ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ChartBarIcon className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Pipeline Progress</h2>
          <p className="text-xs text-muted-foreground ml-auto">Click a stage to spotlight it</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {PIPELINE_COLUMNS.map((stage) => {
            const cfg = STAGE_CONFIG[stage];
            const count = grouped[stage]?.length ?? 0;
            const pct = funnel?.total ? Math.round((count / funnel.total) * 100) : 0;
            const isHighlighted = highlightStage === stage;

            return (
              <button
                key={stage}
                onClick={() => setHighlightStage(isHighlighted ? null : stage)}
                className={`flex-1 min-w-[140px] rounded-2xl p-5 border-2 transition-all duration-300 text-left ${
                  isHighlighted
                    ? `border-current ${cfg.color} bg-card shadow-lg scale-[1.02]`
                    : "border-card-border bg-card hover:border-zinc-600"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isHighlighted ? cfg.color : "text-muted-foreground"}`}>
                    {cfg.label}
                  </span>
                </div>
                <p className={`text-4xl font-bold font-heading mb-1 ${isHighlighted ? cfg.color : "text-foreground"}`}>{count}</p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-3">
                  <div
                    className={`h-full ${cfg.dot} transition-all duration-700`}
                    style={{ width: `${pct}%`, opacity: isHighlighted ? 1 : 0.5 }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">{pct}% of total</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Spotlighted Stage Detail ─────────────────────────────────────────── */}
      {highlightStage && (grouped[highlightStage] ?? []).length > 0 && (
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className={`rounded-2xl border p-6 ${STAGE_CONFIG[highlightStage]?.bg}`}>
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-sm font-bold uppercase tracking-widest ${STAGE_CONFIG[highlightStage]?.color}`}>
                {STAGE_CONFIG[highlightStage]?.label} — Universities
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STAGE_CONFIG[highlightStage]?.bg} ${STAGE_CONFIG[highlightStage]?.color} border`}>
                {grouped[highlightStage]?.length}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {(grouped[highlightStage] ?? []).slice(0, 8).map((uni) => (
                <div key={uni._id} className="bg-background/60 rounded-xl p-3.5 border border-card-border/60">
                  <p className="text-foreground font-semibold text-sm truncate mb-0.5">{uni.university_name}</p>
                  <p className="text-muted-foreground text-[11px] truncate">{[uni.city, uni.state].filter(Boolean).join(", ")}</p>
                  {uni.lead_tier && (
                    <span className={`text-[9px] font-bold uppercase mt-1.5 inline-block ${
                      uni.lead_tier === "High" ? "text-emerald-400" :
                      uni.lead_tier === "Medium" ? "text-amber-400" : "text-blue-400"
                    }`}>
                      {uni.lead_tier} Tier
                    </span>
                  )}
                </div>
              ))}
              {(grouped[highlightStage] ?? []).length > 8 && (
                <div className="bg-background/40 rounded-xl p-3.5 border border-card-border/40 flex items-center justify-center">
                  <p className="text-muted-foreground text-sm font-medium">
                    +{(grouped[highlightStage]?.length ?? 0) - 8} more
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Replies (Live Feed) ── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Live Reply Feed */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ChatBubbleLeftRightIcon className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Live Reply Feed</h2>
            {(replies?.length ?? 0) > 0 && (
              <span className="bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1">
                {replies?.length} LIVE
              </span>
            )}
          </div>
          <div className="bg-card border border-card-border/60 rounded-2xl overflow-hidden max-h-64 overflow-y-auto shadow-sm">
            {!replies || replies.length === 0 ? (
              <div className="py-12 text-center px-4">
                <div className="text-3xl mb-2 opacity-40">📭</div>
                <p className="text-muted-foreground text-sm">No replies yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {replies.slice(0, 6).map((reply) => (
                  <div key={reply._id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-foreground text-xs font-semibold truncate">
                        {(reply as any).university_name}
                      </span>
                      {reply.classification && (
                        <span className={`text-[9px] font-bold uppercase flex-shrink-0 px-1.5 py-0.5 rounded-full border ${
                          reply.classification === "meeting_request" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                          reply.classification === "positive_interest" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                          reply.classification === "not_interested" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                          "bg-muted text-muted-foreground border-card-border"
                        }`}>
                          {reply.classification.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs line-clamp-2">{reply.raw_reply}</p>
                    <p className="text-zinc-600 text-[10px] mt-1.5">
                      {new Date(reply.received_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Funnel Conversion Summary */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <DocumentTextIcon className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground uppercase tracking-widest">Conversion Funnel</h2>
          </div>
          <div className="bg-card border border-card-border/60 rounded-2xl p-5 shadow-sm space-y-4">
            {[
              { from: "Total Discovered",  value: funnel?.total ?? 0,          pct: 100, color: "bg-blue-500" },
              { from: "Enriched & Ready",  value: funnel?.enriched ?? 0,        pct: funnel?.total ? Math.round((funnel.enriched / funnel.total) * 100) : 0, color: "bg-sky-500" },
              { from: "Active Outreach",   value: funnel?.outreachActive ?? 0, pct: funnel?.total ? Math.round((funnel.outreachActive / funnel.total) * 100) : 0, color: "bg-indigo-500" },
              { from: "Replied",           value: funnel?.replied ?? 0,         pct: funnel?.total ? Math.round((funnel.replied / funnel.total) * 100) : 0, color: "bg-emerald-500" },
              { from: "Meetings Booked",  value: funnel?.meetingBooked ?? 0,  pct: funnel?.total ? Math.round((funnel.meetingBooked / funnel.total) * 100) : 0, color: "bg-amber-500" },
              { from: "Proposals Sent",   value: funnel?.proposalSent ?? 0,   pct: funnel?.total ? Math.round((funnel.proposalSent / funnel.total) * 100) : 0, color: "bg-violet-500" },
            ].map((row) => (
              <div key={row.from}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground font-medium">{row.from}</span>
                  <span className="text-foreground font-bold">{row.value}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${row.color} rounded-full transition-all duration-700`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Branding Footer ── */}
      <div className="mt-10 pt-6 border-t border-card-border/40 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Powered by <span className="font-bold text-foreground">Fretbox</span> Outreach AI</p>
          <p className="text-[11px] text-zinc-600 mt-0.5">Real-time data · Zero lag · Auto-classification · AI proposals</p>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
