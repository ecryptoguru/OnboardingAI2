"use node";

import { lookup } from "node:dns/promises";
import {
  assertSafeHttpUrl,
  isIpLiteral,
  isPrivateHostname,
} from "./urlSafety";

/**
 * Reject non-http(s) schemes, credentials, private/loopback IP literals,
 * localhost, and hostnames that resolve to non-public addresses (DNS
 * rebinding defense) BEFORE any server-side request is made.
 *
 * The resolver is injectable for hermetic unit tests; production callers
 * use the default `node:dns` lookup.
 */
export async function assertPublicTarget(
  rawUrl: string,
  resolve: (hostname: string) => Promise<string[]> = async (hostname) =>
    (await lookup(hostname, { all: true })).map((r) => r.address),
): Promise<URL> {
  const parsed = assertSafeHttpUrl(rawUrl);
  if (!isIpLiteral(parsed.hostname)) {
    let addresses: string[];
    try {
      addresses = await resolve(parsed.hostname);
    } catch {
      throw new Error(`Unsafe URL: could not resolve "${parsed.hostname}"`);
    }
    if (
      addresses.length === 0 ||
      addresses.some((a) => isPrivateHostname(a))
    ) {
      throw new Error(
        `Unsafe URL: "${parsed.hostname}" resolves to a non-public address`,
      );
    }
  }
  return parsed;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Fetch a public URL without letting automatic redirects bypass SSRF checks. */
export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
): Promise<Response> {
  let target = await assertPublicTarget(rawUrl);

  for (let redirects = 0; ; redirects += 1) {
    const response = await fetch(target, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) throw new Error("Unsafe redirect: missing Location header");
    if (redirects >= maxRedirects) throw new Error("Unsafe redirect: too many redirects");
    target = await assertPublicTarget(new URL(location, target).toString());
  }
}
