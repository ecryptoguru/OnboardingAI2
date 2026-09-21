"use node";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
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
type Resolver = (hostname: string) => Promise<string[]>;

async function resolvePublicTarget(
  rawUrl: string,
  resolve: Resolver = async (hostname) =>
    (await lookup(hostname, { all: true })).map((r) => r.address),
): Promise<{ url: URL; address: string }> {
  const parsed = assertSafeHttpUrl(rawUrl);
  if (isIpLiteral(parsed.hostname)) {
    return { url: parsed, address: parsed.hostname.replace(/^\[|\]$/g, "") };
  }

  let addresses: string[];
  try {
    addresses = await resolve(parsed.hostname);
  } catch {
    throw new Error(`Unsafe URL: could not resolve "${parsed.hostname}"`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateHostname(a))) {
    throw new Error(
      `Unsafe URL: "${parsed.hostname}" resolves to a non-public address`,
    );
  }
  return { url: parsed, address: addresses[0] };
}

export async function assertPublicTarget(
  rawUrl: string,
  resolve?: Resolver,
): Promise<URL> {
  return (await resolvePublicTarget(rawUrl, resolve)).url;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type PinnedFetch = (
  target: URL,
  address: string,
  init: RequestInit,
) => Promise<Response>;

const fetchPinned: PinnedFetch = async (target, address, init) => {
  const family = isIP(address);
  if (family !== 4 && family !== 6) throw new Error("Unsafe URL: invalid address");

  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) =>
        callback(null, address, family),
    },
  });
  try {
    const response = await undiciFetch(target, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
      redirect: "manual",
    });
    const body = await response.arrayBuffer();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
    });
  } finally {
    await dispatcher.close();
  }
};

/** Fetch a public URL without letting automatic redirects bypass SSRF checks. */
export async function fetchPublicUrl(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 5,
  resolve?: Resolver,
  request: PinnedFetch = fetchPinned,
): Promise<Response> {
  let target = await resolvePublicTarget(rawUrl, resolve);

  for (let redirects = 0; ; redirects += 1) {
    const response = await request(target.url, target.address, init);
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) throw new Error("Unsafe redirect: missing Location header");
    if (redirects >= maxRedirects) {
      throw new Error("Unsafe redirect: too many redirects");
    }
    target = await resolvePublicTarget(
      new URL(location, target.url).toString(),
      resolve,
    );
  }
}
