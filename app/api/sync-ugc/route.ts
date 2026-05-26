import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ⚠️  NOTE: In-memory rate limiter (first line of defense).
// Resets per serverless instance, so a determined attacker could bypass it
// by hitting different instances. The real distributed enforcement lives in
// the bulkSyncUgc Convex mutation, which uses a persistent rateLimits table.
// We keep this lightweight guard here to filter obvious abuse before the
// proxy fetch even runs, and use a long window + low limit to reduce spray.
const RATE_LIMIT_WINDOW_MS = 300000; // 5 minutes
const RATE_LIMIT_MAX = 10; // 10 requests per 5 min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      { status: 429, headers: { "Retry-After": "300" } },
    );
  }

  try {
    const response = await fetch(
      "https://www.ugc.gov.in/universitydetails/Getuniversity_details?unitypeID=0",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.ugc.gov.in/universitydetails/university",
          Origin: "https://www.ugc.gov.in",
          "X-Requested-With": "XMLHttpRequest",
        },
        // In Next.js, we can control caching
        next: { revalidate: 3600 }, // Cache for 1 hour
      },
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `UGC API returned status: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("UGC Proxy Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during UGC fetch" },
      { status: 500 },
    );
  }
}
