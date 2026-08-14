import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/favicon.svg",
      },
    ];
  },
  webpack: (config, { isServer }) => {
    config.infrastructureLogging = {
      level: "error",
    };
    // Avoid bundling heavy server-only packages into client chunks
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

// withSentryConfig adds ~900 MB to the dev server and enables the
// clientTraceMetadata experiment, which compounds the webpack memory leak.
// Only enable it for production builds where source maps are uploaded.
export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSentryConfig(nextConfig, { silent: true, org: "fretbox", project: "outreach-ai" });
