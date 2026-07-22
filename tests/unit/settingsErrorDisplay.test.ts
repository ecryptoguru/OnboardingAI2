"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { getErrorMessage, cleanConvexError } from "../../app/(dashboard)/dashboard/settings/components.tsx";

describe("Settings error display helpers", () => {
  describe("cleanConvexError", () => {
    it("preserves the actionable env-var error message", () => {
      const raw = "SETTINGS_OBFUSCATION_SECRET is not set. Run: npx convex env set SETTINGS_OBFUSCATION_SECRET <value>";
      assert.strictEqual(cleanConvexError(raw), raw);
    });

    it("strips Convex prefix noise and returns the real message", () => {
      const raw = "[CONVEX M(settings/setGeminiKey)] [Request ID: abc123def456] SETTINGS_OBFUSCATION_SECRET is not set.";
      assert.strictEqual(cleanConvexError(raw), "SETTINGS_OBFUSCATION_SECRET is not set.");
    });

    it("falls back to raw error when stripping removes everything", () => {
      assert.strictEqual(cleanConvexError("Server Error"), "Server Error");
      assert.strictEqual(
        cleanConvexError("Uncaught Error: Server Error\n  at handler (convex/settings.ts:157:19)\n  Called by client"),
        "Uncaught Error: Server Error\n  at handler (convex/settings.ts:157:19)\n  Called by client",
      );
    });

    it("returns generic fallback for empty input", () => {
      assert.strictEqual(cleanConvexError(""), "An unexpected error occurred.");
      assert.strictEqual(cleanConvexError(undefined), "An unexpected error occurred.");
    });
  });

  describe("getErrorMessage", () => {
    it("extracts message from Error instances", () => {
      assert.strictEqual(
        getErrorMessage(new Error("SETTINGS_OBFUSCATION_SECRET is not set")),
        "SETTINGS_OBFUSCATION_SECRET is not set",
      );
    });

    it("returns string errors as-is", () => {
      assert.strictEqual(getErrorMessage("Plain string error"), "Plain string error");
    });

    it("extracts message from structured Convex-like errors", () => {
      assert.strictEqual(
        getErrorMessage({ message: "Convex validation failed" }),
        "Convex validation failed",
      );
      assert.strictEqual(getErrorMessage({ error: "Bad request" }), "Bad request");
      assert.strictEqual(
        getErrorMessage({ errorMessage: "Something went wrong" }),
        "Something went wrong",
      );
      assert.strictEqual(getErrorMessage({ data: "Policy denied" }), "Policy denied");
    });

    it("serializes unknown objects", () => {
      assert.strictEqual(getErrorMessage({ foo: "bar" }), '{"foo":"bar"}');
    });

    it("falls back for null/undefined", () => {
      assert.strictEqual(getErrorMessage(null), "An unexpected error occurred.");
      assert.strictEqual(getErrorMessage(undefined), "An unexpected error occurred.");
    });
  });
});
