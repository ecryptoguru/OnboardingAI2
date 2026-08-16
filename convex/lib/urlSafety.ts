/**
 * Pure URL-safety helpers shared by V8 mutations and node actions.
 *
 * These checks are intentionally import-free (no node builtins) so they can
 * run inside mutations as well as actions.
 */

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    // Malformed IPv4 literals are treated as unsafe.
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 198 && (b === 18 || b === 19)) // 198.18.0.0/15 benchmarking
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("fec0")) return true; // deprecated site-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 ULA
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 address.
    return isPrivateIpv4(lower.slice(7));
  }
  return false;
}

export function isIpLiteral(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "");
  return h.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  ) {
    return true;
  }
  if (isIpLiteral(h)) {
    return isPrivateIpv4(h) || isPrivateIpv6(h);
  }
  return false;
}

/**
 * Throws if `raw` is not a safe public http(s) URL. Used before any
 * server-side fetch (SSRF defense).
 */
export function assertSafeHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`Unsafe URL: could not parse "${raw}"`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsafe URL: scheme "${url.protocol}" is not http(s)`);
  }
  if (url.username || url.password) {
    throw new Error("Unsafe URL: credentials in URL are not allowed");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error(
      `Unsafe URL: host "${url.hostname}" is a private/loopback address`,
    );
  }
  return url;
}

/**
 * Lightweight write-time validation for the `website` field. No DNS is
 * performed (mutations run in the V8 runtime); the action-time DNS check in
 * discovery.ts is the defense-in-depth layer against DNS rebinding.
 */
export function validateWebsiteField(raw: string): string {
  const url = assertSafeHttpUrl(raw);
  if (!url.hostname.includes(".") && !isIpLiteral(url.hostname)) {
    throw new Error("Invalid website: hostname must be a public domain");
  }
  return url.toString();
}
