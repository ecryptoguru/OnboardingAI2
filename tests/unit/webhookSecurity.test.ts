"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of extractEmailAddress from convex/http.ts
 */
function extractEmailAddress(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  const email = (angleMatch?.[1] ?? trimmed).trim().toLowerCase();
  return email.includes("@") ? email : null;
}

/**
 * Mirror of getThreadMessageIdCandidate from convex/http.ts
 */
function getThreadMessageIdCandidate(
  payload: Record<string, string | undefined>,
): string | null {
  const blob = [
    payload.email_id,
    payload.in_reply_to,
    payload.references,
    payload.headers,
    payload.subject,
  ]
    .filter(Boolean)
    .join("\n");

  const explicit = payload.email_id?.trim();
  if (explicit) return explicit;

  const match = blob.match(/fretbox-([a-zA-Z0-9_-]+)@/i);
  return match?.[1] ?? null;
}

/**
 * Mirror of verifyHmac from convex/http.ts
 */
async function verifyHmac(
  secret: string,
  payload: string,
  signature: string,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sigHex = signature.replace(/^v1=/, "");
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
}

describe("Webhook Security - Email Extraction", () => {
  it("should extract plain email", () => {
    assert.strictEqual(extractEmailAddress("ashish@fretbox.in"), "ashish@fretbox.in");
  });

  it("should extract email from angle brackets", () => {
    assert.strictEqual(
      extractEmailAddress("Ashish Gupta <ashish@fretbox.in>"),
      "ashish@fretbox.in",
    );
  });

  it("should lowercase extracted email", () => {
    assert.strictEqual(
      extractEmailAddress("Ashish@Fretbox.IN"),
      "ashish@fretbox.in",
    );
  });

  it("should return null for missing input", () => {
    assert.strictEqual(extractEmailAddress(undefined), null);
  });

  it("should return null for non-email string", () => {
    assert.strictEqual(extractEmailAddress("not an email"), null);
  });
});

describe("Webhook Security - Thread ID Resolution", () => {
  it("should resolve explicit email_id", () => {
    assert.strictEqual(
      getThreadMessageIdCandidate({ email_id: "k3j4h5k3j4h5" }),
      "k3j4h5k3j4h5",
    );
  });

  it("should extract ID from Message-ID header", () => {
    assert.strictEqual(
      getThreadMessageIdCandidate({
        in_reply_to: "<fretbox-k3j4h5@reply.fretbox.in>",
      }),
      "k3j4h5",
    );
  });

  it("should extract ID from references header", () => {
    assert.strictEqual(
      getThreadMessageIdCandidate({
        references: "<fretbox-abc123@reply.fretbox.in>",
      }),
      "abc123",
    );
  });

  it("should return null when no hint present", () => {
    assert.strictEqual(
      getThreadMessageIdCandidate({ subject: "Hello" }),
      null,
    );
  });
});

describe("Webhook Security - HMAC Verification", () => {
  it("should verify valid HMAC-SHA256 signature", async () => {
    const secret = "super-secret";
    const payload = '{"event":"delivered"}';

    // Create valid signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const sigBytes = new Uint8Array(sig);
    let sigHex = "";
    for (let i = 0; i < sigBytes.length; i++) {
      sigHex += sigBytes[i].toString(16).padStart(2, "0");
    }

    const result = await verifyHmac(secret, payload, `v1=${sigHex}`);
    assert.strictEqual(result, true);
  });

  it("should reject invalid signature", async () => {
    const result = await verifyHmac(
      "secret",
      '{"event":"delivered"}',
      "v1=deadbeef",
    );
    assert.strictEqual(result, false);
  });

  it("should reject wrong secret", async () => {
    const secret = "correct-secret";
    const payload = '{"event":"delivered"}';

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
    const sigBytes = new Uint8Array(sig);
    let sigHex = "";
    for (let i = 0; i < sigBytes.length; i++) {
      sigHex += sigBytes[i].toString(16).padStart(2, "0");
    }

    const result = await verifyHmac("wrong-secret", payload, `v1=${sigHex}`);
    assert.strictEqual(result, false);
  });
});

describe("Webhook Security - Bearer Token Extraction", () => {
  it("should strip Bearer prefix and whitespace", () => {
    const authHeader = "Bearer my-secret-token";
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    assert.strictEqual(provided, "my-secret-token");
  });

  it("should handle lowercase bearer", () => {
    const authHeader = "bearer my-secret-token";
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    assert.strictEqual(provided, "my-secret-token");
  });

  it("should handle token without Bearer prefix", () => {
    const authHeader = "my-secret-token";
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    assert.strictEqual(provided, "my-secret-token");
  });
});
