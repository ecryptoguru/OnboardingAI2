import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertSafeHttpUrl,
  isPrivateHostname,
  isPrivateIpv4,
  isPrivateIpv6,
  validateWebsiteField,
} from "../../convex/lib/urlSafety";

test("isPrivateIpv4 rejects private and reserved ranges", () => {
  assert.equal(isPrivateIpv4("10.0.0.1"), true);
  assert.equal(isPrivateIpv4("127.0.0.1"), true);
  assert.equal(isPrivateIpv4("169.254.169.254"), true); // cloud metadata
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.255"), true);
  assert.equal(isPrivateIpv4("192.168.1.1"), true);
  assert.equal(isPrivateIpv4("100.64.0.1"), true); // CGNAT
  assert.equal(isPrivateIpv4("0.0.0.0"), true);

  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isPrivateIpv4("1.1.1.1"), false);
  // Malformed literals are treated as unsafe.
  assert.equal(isPrivateIpv4("999.1.1.1"), true);
});

test("isPrivateIpv6 rejects loopback, link-local and ULA", () => {
  assert.equal(isPrivateIpv6("::1"), true);
  assert.equal(isPrivateIpv6("fe80::1"), true);
  assert.equal(isPrivateIpv6("fc00::1"), true);
  assert.equal(isPrivateIpv6("fd12:3456::1"), true);
  assert.equal(isPrivateIpv6("::ffff:127.0.0.1"), true); // IPv4-mapped loopback

  assert.equal(isPrivateIpv6("2001:4860:4860::8888"), false);
});

test("isPrivateHostname covers localhost and literals", () => {
  assert.equal(isPrivateHostname("localhost"), true);
  assert.equal(isPrivateHostname("db.internal"), true);
  assert.equal(isPrivateHostname("192.168.1.5"), true);
  assert.equal(isPrivateHostname("example.com"), false);
});

test("assertSafeHttpUrl rejects unsafe URLs before fetching", () => {
  assert.throws(() => assertSafeHttpUrl("ftp://example.com"), /scheme/);
  assert.throws(() => assertSafeHttpUrl("http://127.0.0.1"), /private/);
  assert.throws(
    () => assertSafeHttpUrl("http://169.254.169.254/latest/meta-data/"),
    /private/,
  );
  assert.throws(
    () => assertSafeHttpUrl("http://user:pass@example.com"),
    /credentials/,
  );
  assert.doesNotThrow(() => assertSafeHttpUrl("https://example.com"));
  assert.doesNotThrow(() => assertSafeHttpUrl("http://example.edu.in"));
});

test("validateWebsiteField normalizes public domains and rejects private hosts", () => {
  assert.equal(
    validateWebsiteField("https://example.com"),
    "https://example.com/",
  );
  assert.throws(() => validateWebsiteField("http://localhost:3000"), /private/);
  assert.throws(() => validateWebsiteField("http://10.0.0.5"), /private/);
  assert.throws(() => validateWebsiteField("file:///etc/passwd"), /scheme/);
});
