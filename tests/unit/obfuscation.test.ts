"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Replicates the obfuscate/deobfuscate logic from convex/settings.ts
 * to verify the round-trip property: deobfuscate(obfuscate(x)) === x.
 * The actual functions are not exported from settings.ts, so we test
 * the algorithm here to catch any future changes that break the invariant.
 */
function makeObfuscate(secret: string) {
  function obfuscate(plain: string): string {
    let out = "";
    for (let i = 0; i < plain.length; i++) {
      out += String.fromCharCode(
        plain.charCodeAt(i) ^ secret.charCodeAt(i % secret.length),
      );
    }
    return Buffer.from(out, "binary").toString("base64");
  }

  function deobfuscate(cipher: string): string {
    const raw = Buffer.from(cipher, "base64").toString("binary");
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      out += String.fromCharCode(
        raw.charCodeAt(i) ^ secret.charCodeAt(i % secret.length),
      );
    }
    return out;
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

  it("produces different ciphertexts for different plaintexts", () => {
    const c1 = obfuscate("key-one-12345");
    const c2 = obfuscate("key-two-12345");
    assert.notStrictEqual(c1, c2);
  });

  it("is deterministic (same input → same output)", () => {
    const key = "AIzaSyTestKey123456789";
    assert.strictEqual(obfuscate(key), obfuscate(key));
  });
});
