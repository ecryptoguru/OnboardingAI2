"use client";

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ||
  "https://energetic-raven-535.convex.cloud";

const convex = new ConvexReactClient(convexUrl, {
  verbose: process.env.NODE_ENV === "development",
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      {children}
    </ConvexAuthNextjsProvider>
  );
}
