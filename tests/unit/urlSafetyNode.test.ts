import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPublicTarget } from "../../convex/lib/urlSafetyNode";
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
