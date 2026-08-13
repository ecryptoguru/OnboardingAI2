"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RedirectIfAuthenticated({ to = "/dashboard" }: { to?: string }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(to);
    }
  }, [isLoading, isAuthenticated, router, to]);

  return null;
}
