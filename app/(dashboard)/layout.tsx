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
} from "@heroicons/react/24/outline";
import { ErrorBoundary } from "../../components/ErrorBoundary";

const NAV = [
  { href: "/dashboard", label: "Universities", icon: BuildingLibraryIcon },
  { href: "/dashboard/enrichment", label: "Enrichment", icon: ChartBarIcon },
  { href: "/dashboard/proposals", label: "Proposals", icon: DocumentTextIcon },
  { href: "/dashboard/outreach", label: "Outreach", icon: EnvelopeIcon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { signOut } = useAuthActions();

  return (
    <div className="flex min-h-screen bg-[#09090b]">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-zinc-800 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-zinc-800">
          <span className="text-lg font-bold text-white tracking-tight">
            🎸 Fretbox AI
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-500/15 text-indigo-400"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-zinc-800">
          <button
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
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
