import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertPublicTarget,
  fetchPublicUrl,
} from "../../convex/lib/urlSafetyNode";
import { downloadPdfBuffer } from "../../convex/lib/scrapers";

test("assertPublicTarget rejects private IP literals without DNS", async () => {
  await assert.rejects(assertPublicTarget("http://127.0.0.1"), /private/);
  await assert.rejects(
    assertPublicTarget("http://169.254.169.254/latest/meta-data/"),
    /private/,
  );
  await assert.rejects(assertPublicTarget("http://10.0.0.5"), /private/);
});

test("assertPublicTarget rejects non-http schemes and credentials", async () => {
  await assert.rejects(assertPublicTarget("ftp://example.com"), /scheme/);
  await assert.rejects(
    assertPublicTarget("http://user:pass@example.com"),
    /credentials/,
  );
});

test("assertPublicTarget rejects hostnames resolving to private addresses", async () => {
  const resolve = async (hostname: string) => {
    if (hostname === "evil.example.com") return ["10.0.0.5"];
    if (hostname === "good.example.com") return ["93.184.216.34"];
    return [];
  };
  await assert.rejects(
    assertPublicTarget("http://evil.example.com", resolve),
    /non-public address/,
  );
  await assert.doesNotReject(
    assertPublicTarget("http://good.example.com", resolve),
  );
});

test("assertPublicTarget rejects unresolvable hostnames", async () => {
  const resolve = async () => {
    throw new Error("ENOTFOUND");
  };
  await assert.rejects(
    assertPublicTarget("http://nope.invalid", resolve),
    /could not resolve/,
  );
});

test("downloadPdfBuffer rejects private URLs before fetching", async () => {
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response("", { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      downloadPdfBuffer("http://169.254.169.254/latest/meta-data/"),
      /private/,
    );
    assert.equal(fetched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPublicUrl revalidates redirects before following them", async () => {
  const addresses: string[] = [];
  const resolve = async (hostname: string) =>
    hostname === "public.example" ? ["93.184.216.34"] : ["10.0.0.5"];
  const request = async (_target: URL, address: string) => {
    addresses.push(address);
    return new Response(null, {
      status: 302,
      headers: { location: "http://private.example/latest/meta-data/" },
    });
  };

  await assert.rejects(
    fetchPublicUrl("https://public.example/file.pdf", {}, 5, resolve, request),
    /non-public address/,
  );
  assert.deepEqual(addresses, ["93.184.216.34"]);
});

test("fetchPublicUrl pins each request to its validated address", async () => {
  const seen: Array<{ hostname: string; address: string }> = [];
  const resolve = async (hostname: string) =>
    hostname === "first.example" ? ["93.184.216.34"] : ["142.250.72.14"];
  const request = async (target: URL, address: string) => {
    seen.push({ hostname: target.hostname, address });
    return seen.length === 1
      ? new Response(null, {
          status: 302,
          headers: { location: "https://second.example/result" },
        })
      : new Response("ok");
  };

  const response = await fetchPublicUrl(
    "https://first.example/start",
    {},
    5,
    resolve,
    request,
  );
  assert.equal(await response.text(), "ok");
  assert.deepEqual(seen, [
    { hostname: "first.example", address: "93.184.216.34" },
    { hostname: "second.example", address: "142.250.72.14" },
  ]);
});
