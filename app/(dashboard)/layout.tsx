"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  BuildingLibraryIcon,
  EnvelopeIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ArrowRightOnRectangleIcon,
  InboxArrowDownIcon,
} from "@heroicons/react/24/outline";
import { ErrorBoundary } from "../../components/ErrorBoundary";

const NAV = [
  { href: "/dashboard", label: "Universities", icon: BuildingLibraryIcon },
  { href: "/dashboard/enrichment", label: "Enrichment", icon: ChartBarIcon },
  { href: "/dashboard/proposals", label: "Proposals", icon: DocumentTextIcon },
  { href: "/dashboard/outreach", label: "Outreach", icon: EnvelopeIcon },
  { href: "/dashboard/approvals", label: "Approvals", icon: InboxArrowDownIcon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-card-border flex flex-col">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-card-border bg-background">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎸</span>
            <span className="text-lg font-heading font-semibold text-foreground tracking-tight">
              Fretbox <span className="text-blue-500">AI</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active
                    ? "bg-blue-500/15 text-blue-400"
                    : "text-muted-foreground hover:text-white hover:bg-muted/80"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
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
