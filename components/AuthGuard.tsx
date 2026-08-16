"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STALL_TIMEOUT_MS = 12_000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in");
    }
  }, [isLoading, isAuthenticated, router]);

  // Watchdog: if the Convex backend can't be reached (e.g. network/CORS
  // failure) `isLoading` stays true forever. Surface a retry instead of an
  // infinite spinner.
  useEffect(() => {
    if (!isLoading) {
      setStalled(false);
      return;
    }
    const timer = setTimeout(() => setStalled(true), STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isLoading) {
    if (stalled) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3 text-center px-4">
            <p className="text-sm text-foreground">
              Can&apos;t reach the workspace backend. Check your internet
              connection and try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-4 py-2 text-sm transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
