"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Replicates the obfuscate/deobfuscate logic from convex/settings.ts
 * to verify the round-trip property: deobfuscate(obfuscate(x)) === x.
 * The actual functions are not exported from settings.ts, so we test
 * the algorithm here to catch any future changes that break the invariant.
 *
 * The implementation uses byte-level XOR with a UTF-8 secret and encodes
 * the result as base64. This preserves multi-byte characters correctly.
 */
const MIN_OBF_SECRET_LENGTH = 32;

function makeObfuscate(secret: string) {
  if (secret.length < MIN_OBF_SECRET_LENGTH) {
    throw new Error(
      `Secret must be at least ${MIN_OBF_SECRET_LENGTH} characters long`,
    );
  }

  function obfuscate(plain: string): string {
    const encoder = new TextEncoder();
    const plainBytes = encoder.encode(plain);
    const secretBytes = encoder.encode(secret);
    const outBytes = new Uint8Array(plainBytes.length);
    for (let i = 0; i < plainBytes.length; i++) {
      outBytes[i] = plainBytes[i] ^ secretBytes[i % secretBytes.length];
    }
    let latin1 = "";
    for (let i = 0; i < outBytes.length; i++) {
      latin1 += String.fromCharCode(outBytes[i]);
    }
    return Buffer.from(latin1, "binary").toString("base64");
  }

  function deobfuscate(cipher: string): string {
    const raw = Buffer.from(cipher, "base64").toString("binary");
    const secretBytes = new TextEncoder().encode(secret);
    const outBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      outBytes[i] = raw.charCodeAt(i) ^ secretBytes[i % secretBytes.length];
    }
    return new TextDecoder().decode(outBytes);
  }

  return { obfuscate, deobfuscate };
}

describe("settings obfuscation round-trip", () => {
  const secret = "test-secret-key-for-round-trip-testing-1234";
  const { obfuscate, deobfuscate } = makeObfuscate(secret);

  it("round-trips a typical API key", () => {
    const key = "AIzaSyA1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q";
    const cipher = obfuscate(key);
    assert.notStrictEqual(cipher, key, "cipher should differ from plaintext");
    assert.strictEqual(deobfuscate(cipher), key);
  });

  it("round-trips a Serper API key (32+ chars)", () => {
    const key = "abcdef1234567890abcdef1234567890";
    const cipher = obfuscate(key);
    assert.strictEqual(deobfuscate(cipher), key);
  });

  it("round-trips a JSON service account string", () => {
    const json = JSON.stringify({
      client_email: "test@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDTestKey\n-----END PRIVATE KEY-----\n",
    });
    const cipher = obfuscate(json);
    assert.strictEqual(deobfuscate(cipher), json);
  });

  it("round-trips an email address", () => {
    const email = "outreach@fretbox.in";
    const cipher = obfuscate(email);
    assert.strictEqual(deobfuscate(cipher), email);
  });

  it("round-trips an empty string", () => {
    const cipher = obfuscate("");
    assert.strictEqual(deobfuscate(cipher), "");
  });

  it("round-trips a string longer than the secret", () => {
    const key = "x".repeat(200);
    const cipher = obfuscate(key);
    assert.strictEqual(deobfuscate(cipher), key);
  });

  it("round-trips a sender name with special chars", () => {
    const value = "Ashish Gupta (Fretbox) - Test";
    const cipher = obfuscate(value);
    assert.strictEqual(deobfuscate(cipher), value);
  });

  it("round-trips unicode characters", () => {
    const value = "café — naïve 🎸";
    const cipher = obfuscate(value);
    assert.strictEqual(deobfuscate(cipher), value);
  });

  it("produces different ciphertexts for different plaintexts", () => {
    const c1 = obfuscate("key-one-12345");
    const c2 = obfuscate("key-two-12345");
    assert.notStrictEqual(c1, c2);
  });

  it("is deterministic (same input → same output)", () => {
    const key = "AIzaSyTestKey123456789";
    assert.strictEqual(obfuscate(key), obfuscate(key));
  });

  it("rejects a short secret", () => {
    assert.throws(
      () => makeObfuscate("short"),
      /Secret must be at least 32 characters long/,
    );
  });
});
