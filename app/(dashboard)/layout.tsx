"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  BuildingLibraryIcon,
  EnvelopeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
  InboxArrowDownIcon,
  PresentationChartLineIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ThemeToggle } from "../../components/ThemeToggle";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();
  const pendingEmails = useQuery(api.emails.listPending);
  const replies = useQuery(api.replies.list);

  const pendingCount = pendingEmails?.length ?? 0;
  const unclassifiedReplies = replies?.filter(r => !r.classification).length ?? 0;

  interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    section?: string;
  }

  const NAV: NavItem[] = [
    { href: "/dashboard", label: "Universities", icon: BuildingLibraryIcon, section: "CORE" },
    { href: "/dashboard/enrichment", label: "Enrichment", icon: ChartBarIcon },
    { href: "/dashboard/analytics", label: "Analytics", icon: PresentationChartLineIcon, section: "PIPELINE" },
    { href: "/dashboard/outreach", label: "Outreach", icon: EnvelopeIcon, badge: unclassifiedReplies },
    { href: "/dashboard/proposals", label: "Proposals", icon: DocumentTextIcon },
    { href: "/dashboard/approvals", label: "Approvals", icon: InboxArrowDownIcon, badge: pendingCount },
    { href: "/dashboard/settings", label: "Settings", icon: Cog6ToothIcon, section: "SYSTEM" },
  ];

  let currentSection = "";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-card-border flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-card-border bg-background">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <span className="text-base">🎸</span>
              </div>
              <span className="text-base font-heading font-bold text-foreground tracking-tight">
                Fretbox <span className="text-blue-500">AI</span>
              </span>
            </div>
            <ThemeToggle />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon, badge, section }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            const showSection = section && section !== currentSection;
            if (showSection) currentSection = section ?? "";
            return (
              <div key={href}>
                {showSection && (
                  <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.12em] px-3 pt-5 pb-2">
                    {section}
                  </p>
                )}
                <Link
                  href={href}
                  className={`relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${
                    active
                      ? "bg-blue-500/12 text-blue-400"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                  }`}
                >
                  {/* Active left accent */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
                  )}
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {label}
                  </div>
                  {badge != null && badge > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                      href === "/dashboard/approvals" ? "bg-amber-500 text-white" : "bg-blue-500 text-white"
                    }`}>
                      {badge}
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="p-4 border-t border-card-border">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
    </div>
  );
}
