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
