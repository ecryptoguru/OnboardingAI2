"use client";

import { useConvexAuth } from "convex/react";
import { useEffect } from "react";

export function RedirectIfAuthenticated({ to = "/dashboard" }: { to?: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.href = to;
    }
  }, [isLoading, isAuthenticated, to]);

  return null;
}
