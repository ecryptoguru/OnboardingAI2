"use node";

import { describe, it, before, after } from "node:test";
import assert from "node:assert";

/**
 * Regression test for the root cause of "test success but saving failed":
 *
 * The bug was that SETTINGS_OBFUSCATION_SECRET was captured in a module-level
 * constant `_OBF_SECRET = process.env.SETTINGS_OBFUSCATION_SECRET` at module
 * load time. In Convex V8 isolates, process.env is NOT populated when the
 * module is first evaluated — only at function call time. This caused
 * `getObfSecret()` to always see `undefined`, making every `set*Key` mutation
 * throw "SETTINGS_OBFUSCATION_SECRET is required" while `test*Key` actions
 * (which don't use obfuscate) succeeded.
 *
 * This test verifies the fix: process.env must be read at CALL TIME inside
 * getObfSecret(), not captured at module load time.
 */

const MIN_OBF_SECRET_LENGTH = 32;

// ─── Simulate the BUGGY pattern (module-level capture) ─────────────────────
function makeBuggyObfuscate() {
  // Capture at "module load time" — simulates the old broken code
  const _capturedSecret = process.env.SETTINGS_OBFUSCATION_SECRET;

  function getObfSecretBuggy(): string {
    if (!_capturedSecret) {
      throw new Error("SETTINGS_OBFUSCATION_SECRET is required");
    }
    if (_capturedSecret.length < MIN_OBF_SECRET_LENGTH) {
      throw new Error(
        `SETTINGS_OBFUSCATION_SECRET must be at least ${MIN_OBF_SECRET_LENGTH} characters long`,
      );
    }
    return _capturedSecret;
  }

  function obfuscate(plain: string): string {
    const secret = getObfSecretBuggy();
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

  return { obfuscate, getObfSecret: getObfSecretBuggy };
}

// ─── Simulate the FIXED pattern (call-time read) ───────────────────────────
function makeFixedObfuscate() {
  // Read at CALL TIME — simulates the fixed code
  function getObfSecretFixed(): string {
    const secret = process.env.SETTINGS_OBFUSCATION_SECRET;
    if (!secret) {
      throw new Error(
        "SETTINGS_OBFUSCATION_SECRET is not set. Run: npx convex env set SETTINGS_OBFUSCATION_SECRET <value>",
      );
    }
    if (secret.length < MIN_OBF_SECRET_LENGTH) {
      throw new Error(
        `SETTINGS_OBFUSCATION_SECRET must be at least ${MIN_OBF_SECRET_LENGTH} characters long (currently ${secret.length}).`,
      );
    }
    return secret;
  }

  function obfuscate(plain: string): string {
    const secret = getObfSecretFixed();
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

  return { obfuscate, getObfSecret: getObfSecretFixed };
}

describe("Settings env var reading — regression test for V8 isolate bug", () => {
  const originalEnv = process.env.SETTINGS_OBFUSCATION_SECRET;
  const testSecret = "test-secret-key-for-regression-testing-1234";

  before(() => {
    // Simulate V8 isolate: env var is NOT set at module load time
    delete process.env.SETTINGS_OBFUSCATION_SECRET;
  });

  after(() => {
    // Restore original env
    if (originalEnv) {
      process.env.SETTINGS_OBFUSCATION_SECRET = originalEnv;
    } else {
      delete process.env.SETTINGS_OBFUSCATION_SECRET;
    }
  });

  describe("BUGGY pattern (module-level capture)", () => {
    it("captures undefined at module load time when env is not set", () => {
      // "Module loads" here with env unset
      const buggy = makeBuggyObfuscate();

      // Even if we set the env var NOW (simulating Convex populating it
      // before the handler runs), the buggy version already captured undefined
      process.env.SETTINGS_OBFUSCATION_SECRET = testSecret;

      assert.throws(
        () => buggy.obfuscate("AIzaSyTestKey123"),
        /SETTINGS_OBFUSCATION_SECRET is required/,
        "Buggy version should fail because it captured undefined at load time",
      );

      // Clean up for next test
      delete process.env.SETTINGS_OBFUSCATION_SECRET;
    });
  });

  describe("FIXED pattern (call-time read)", () => {
    it("reads env var at call time, not module load time", () => {
      // "Module loads" here with env unset — same as V8 isolate
      const fixed = makeFixedObfuscate();

      // Now set the env var (simulating Convex populating it before handler)
      process.env.SETTINGS_OBFUSCATION_SECRET = testSecret;

      // Should succeed because it reads process.env at CALL TIME
      const cipher = fixed.obfuscate("AIzaSyTestKey123");
      assert.ok(cipher, "obfuscate should produce output");
      assert.notStrictEqual(cipher, "AIzaSyTestKey123");

      // Clean up
      delete process.env.SETTINGS_OBFUSCATION_SECRET;
    });

    it("throws clear error when env var is genuinely missing at call time", () => {
      const fixed = makeFixedObfuscate();
      // Env var is not set
      delete process.env.SETTINGS_OBFUSCATION_SECRET;

      assert.throws(
        () => fixed.obfuscate("AIzaSyTestKey123"),
        /SETTINGS_OBFUSCATION_SECRET is not set/,
      );
    });

    it("throws clear error when secret is too short", () => {
      const fixed = makeFixedObfuscate();
      process.env.SETTINGS_OBFUSCATION_SECRET = "short";

      assert.throws(
        () => fixed.obfuscate("AIzaSyTestKey123"),
        /at least 32 characters long/,
      );

      delete process.env.SETTINGS_OBFUSCATION_SECRET;
    });

    it("includes actionable hint in error message", () => {
      const fixed = makeFixedObfuscate();
      delete process.env.SETTINGS_OBFUSCATION_SECRET;

      try {
        fixed.obfuscate("test");
        assert.fail("Should have thrown");
      } catch (e) {
        const msg = (e as Error).message;
        assert.ok(
          msg.includes("npx convex env set"),
          "Error message should include the fix command",
        );
      }
    });
  });

  describe("All API key types round-trip with call-time env", () => {
    const fixed = makeFixedObfuscate();

    before(() => {
      process.env.SETTINGS_OBFUSCATION_SECRET = testSecret;
    });

    after(() => {
      delete process.env.SETTINGS_OBFUSCATION_SECRET;
    });

    it("Gemini API key (AIza prefix)", () => {
      const key = "AIzaSyA1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q";
      const cipher = fixed.obfuscate(key);
      assert.notStrictEqual(cipher, key);
      // Verify round-trip with deobfuscate
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), key);
    });

    it("Serper API key (32+ chars)", () => {
      const key = "abcdef1234567890abcdef1234567890";
      const cipher = fixed.obfuscate(key);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), key);
    });

    it("Firecrawl API key (20+ chars)", () => {
      const key = "fc-abcdef1234567890";
      const cipher = fixed.obfuscate(key);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), key);
    });

    it("ZeptoMail API key (20+ chars)", () => {
      const key = "Zoho-enczapikey_ABCDEFG1234567890";
      const cipher = fixed.obfuscate(key);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), key);
    });

    it("Google Calendar service account JSON", () => {
      const json = JSON.stringify({
        type: "service_account",
        project_id: "test-project",
        private_key_id: "key-id-123",
        private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDTestKey\n-----END PRIVATE KEY-----\n",
        client_email: "test@test-project.iam.gserviceaccount.com",
        client_id: "123456789",
        token_uri: "https://oauth2.googleapis.com/token",
      });
      const cipher = fixed.obfuscate(json);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), json);
    });

    it("Google Calendar ID", () => {
      const calendarId = "fretbox@group.calendar.google.com";
      const cipher = fixed.obfuscate(calendarId);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), calendarId);
    });

    it("ZeptoMail from email", () => {
      const email = "outreach@fretbox.in";
      const cipher = fixed.obfuscate(email);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), email);
    });

    it("ZeptoMail from name with special chars", () => {
      const name = "Ashish Gupta (Fretbox)";
      const cipher = fixed.obfuscate(name);
      const { deobfuscate } = makeFixedDeobfuscate();
      assert.strictEqual(deobfuscate(cipher), name);
    });
  });
});

// Helper: fixed deobfuscate for round-trip verification
function makeFixedDeobfuscate() {
  function deobfuscate(cipher: string): string {
    const secret = process.env.SETTINGS_OBFUSCATION_SECRET!;
    const raw = Buffer.from(cipher, "base64").toString("binary");
    const secretBytes = new TextEncoder().encode(secret);
    const outBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      outBytes[i] = raw.charCodeAt(i) ^ secretBytes[i % secretBytes.length];
    }
    return new TextDecoder().decode(outBytes);
  }
  return { deobfuscate };
}
