"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

const FUNNEL_STEPS = [
  { key: "total", label: "Total Universities", color: "bg-zinc-500" },
  { key: "enriched", label: "Enriched", color: "bg-blue-500" },
  { key: "outreachActive", label: "Outreach Active", color: "bg-sky-500" },
  { key: "replied", label: "Replied", color: "bg-emerald-500" },
  { key: "meetingBooked", label: "Meeting Booked", color: "bg-amber-500" },
  { key: "proposalSent", label: "Proposal Sent", color: "bg-orange-500" },
  { key: "closed", label: "Closed / Won", color: "bg-green-500" },
] as const;

const EMAIL_STEPS = [1, 2, 3, 4] as const;

export default function AnalyticsPage() {
  const funnel = useQuery(api.universities.getFunnelStats);
  const emailStats = useQuery(api.emails.getDetailedStats);
  const replyStats = useQuery(api.replies.list);

  const classificationCounts = (replyStats ?? []).reduce<
    Record<string, number>
  >((acc: Record<string, number>, r: { classification?: string }) => {
    const key = r.classification ?? "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const totalReplies = replyStats?.length ?? 0;

  const maxFunnelVal = funnel?.total ?? 1;

  return (
    <div className="p-8 space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">
          Analytics
        </h1>
        <p className="text-muted-foreground text-sm mt-1.5 font-medium">
          End-to-end outreach success metrics
        </p>
      </div>

      {/* Funnel */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Outreach Funnel
        </h2>
        {!funnel ? (
          <div className="space-y-3">
            {FUNNEL_STEPS.map((_, i) => (
              <div
                key={i}
                className="h-12 bg-muted/30 rounded-xl animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {FUNNEL_STEPS.map((step, i) => {
              const val: number =
                (funnel as unknown as Record<string, number>)[step.key] ?? 0;
              const pct =
                maxFunnelVal > 0 ? Math.round((val / maxFunnelVal) * 100) : 0;
              const prevVal =
                i > 0
                  ? ((funnel as unknown as Record<string, number>)[
                      FUNNEL_STEPS[i - 1].key
                    ] ?? 0)
                  : null;
              const conv =
                prevVal != null && prevVal > 0
                  ? Math.round((val / prevVal) * 100)
                  : null;
              return (
                <div key={step.key} className="flex items-center gap-4">
                  <div className="w-44 text-right shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">
                      {step.label}
                    </span>
                  </div>
                  <div className="flex-1 bg-card border border-card-border/50 rounded-xl overflow-hidden h-10 relative">
                    <div
                      className={`h-full ${step.color} opacity-80 transition-all duration-700`}
                      style={{
                        width: `${pct}%`,
                        minWidth: val > 0 ? "2px" : "0",
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-3 text-xs font-bold text-foreground">
                      {val.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    {conv !== null ? (
                      <span
                        className={`text-xs font-bold ${conv >= 30 ? "text-emerald-400" : conv >= 10 ? "text-amber-400" : "text-red-400"}`}
                      >
                        {conv}% ↑
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        100%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* KPI Cards */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Key Metrics
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Reply Rate",
              value:
                funnel && funnel.outreachActive > 0
                  ? `${Math.round(((funnel.replied + funnel.meetingBooked) / Math.max(funnel.outreachActive, 1)) * 100)}%`
                  : "—",
              sub: `${(funnel?.replied ?? 0) + (funnel?.meetingBooked ?? 0)} of ${funnel?.outreachActive ?? 0} active`,
              color: "text-emerald-400",
            },
            {
              label: "Meeting Rate",
              value:
                funnel && funnel.replied + funnel.meetingBooked > 0
                  ? `${Math.round((funnel.meetingBooked / Math.max(funnel.replied + funnel.meetingBooked, 1)) * 100)}%`
                  : "—",
              sub: `${funnel?.meetingBooked ?? 0} meetings booked`,
              color: "text-amber-400",
            },
            {
              label: "High Tier Leads",
              value: funnel?.highTier?.toLocaleString() ?? "—",
              sub: `${funnel?.mediumTier ?? 0} Medium tier`,
              color: "text-blue-400",
            },
            {
              label: "Not Interested",
              value: funnel?.notInterested?.toLocaleString() ?? "—",
              sub: "Opted out / No reply",
              color: "text-red-400",
            },
          ].map((card) => (
            <div
              key={card.label}
              className="bg-card border border-card-border/60 rounded-xl p-5 shadow-sm"
            >
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                {card.label}
              </p>
              <p
                className={`text-3xl font-heading font-bold ${card.color} mb-1`}
              >
                {card.value}
              </p>
              <p className="text-muted-foreground text-xs">{card.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Email Step Performance */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
          Email Performance by Step
        </h2>
        {!emailStats ? (
          <div className="h-40 bg-muted/30 rounded-xl animate-pulse" />
        ) : (
          <div className="bg-card border border-card-border/60 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider font-heading">
                  <th className="px-6 py-3 text-left">Step</th>
                  <th className="px-6 py-3 text-right">Sent</th>
                  <th className="px-6 py-3 text-right">Opened</th>
                  <th className="px-6 py-3 text-right">Open Rate</th>
                  <th className="px-6 py-3 text-right">Clicked</th>
                  <th className="px-6 py-3 text-right">Bounced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/40">
                {EMAIL_STEPS.map((step) => {
                  const s = emailStats[step];
                  const openRate =
                    s && s.sent > 0 ? Math.round((s.opened / s.sent) * 100) : 0;
                  return (
                    <tr
                      key={step}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-foreground">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-bold flex items-center justify-center">
                            {step}
                          </span>
                          {step === 1
                            ? "Initial Outreach"
                            : step === 2
                              ? "Follow-up 1"
                              : step === 3
                                ? "Value Add"
                                : "Break-up"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-foreground font-mono font-medium">
                        {s?.sent ?? 0}
                      </td>
                      <td className="px-6 py-4 text-right text-foreground font-mono">
                        {s?.opened ?? 0}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`font-bold ${openRate >= 30 ? "text-emerald-400" : openRate >= 15 ? "text-amber-400" : "text-muted-foreground"}`}
                        >
                          {s && s.sent > 0 ? `${openRate}%` : "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-foreground font-mono">
                        {s?.clicked ?? 0}
                      </td>
                      <td className="px-6 py-4 text-right text-red-400 font-mono">
                        {s?.bounced ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Reply Classification Breakdown */}
      {totalReplies > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
            Reply Intent Breakdown
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(classificationCounts)
              .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
              .map(([cls, count]: [string, number]) => {
                const pct = Math.round((count / totalReplies) * 100);
                const colorMap: Record<string, string> = {
                  meeting_request:
                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                  positive_interest:
                    "bg-blue-500/10 text-blue-400 border-blue-500/20",
                  request_info: "bg-sky-500/10 text-sky-400 border-sky-500/20",
                  not_interested:
                    "bg-red-500/10 text-red-400 border-red-500/20",
                  opt_out:
                    "bg-orange-500/10 text-orange-400 border-orange-500/20",
                  out_of_office:
                    "bg-zinc-500/10 text-muted-foreground border-zinc-500/20",
                  other: "bg-muted text-muted-foreground border-card-border",
                };
                return (
                  <div
                    key={cls}
                    className={`rounded-xl border px-4 py-3 ${colorMap[cls] ?? colorMap.other}`}
                  >
                    <p className="text-xs font-bold uppercase tracking-widest mb-1">
                      {cls.replace(/_/g, " ")}
                    </p>
                    <p className="text-2xl font-heading font-bold">
                      {count as number}{" "}
                      <span className="text-sm font-normal opacity-70">
                        ({pct}%)
                      </span>
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
