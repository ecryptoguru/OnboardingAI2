import assert from "node:assert/strict";
import { test } from "node:test";
import { getAuthErrorMessage, withTimeout } from "../../app/(auth)/authSubmit";

test("getAuthErrorMessage maps Convex Server Error generically", () => {
  const err = new Error("[CONVEX A(auth:signIn)] [Request ID: abc] Server Error");
  assert.equal(
    getAuthErrorMessage(err, "signIn"),
    "Could not sign in. Please check your email and password and try again.",
  );
  assert.equal(
    getAuthErrorMessage(err, "signUp"),
    "Could not create your account. It may already be registered — try signing in, or use a different email.",
  );
});

test("getAuthErrorMessage surfaces ConvexError data", () => {
  const err = Object.assign(new Error("Server Error"), {
    data: "Account ankit@gmail.com already exists",
  });
  assert.equal(
    getAuthErrorMessage(err, "signUp"),
    "An account with this email already exists. Please sign in instead.",
  );
});

test("getAuthErrorMessage maps password errors on sign-up", () => {
  const err = new Error("Invalid password");
  assert.equal(
    getAuthErrorMessage(err, "signUp"),
    "Password must be at least 8 characters.",
  );
});

test("getAuthErrorMessage passes through unknown messages", () => {
  const err = new Error("Something weird happened");
  assert.equal(getAuthErrorMessage(err, "signIn"), "Something weird happened");
});

test("getAuthErrorMessage falls back for empty errors", () => {
  assert.equal(getAuthErrorMessage(undefined, "signIn"), "Invalid email or password.");
  assert.equal(
    getAuthErrorMessage("", "signUp"),
    "Could not create your account. Try a different email.",
  );
});

test("withTimeout resolves with the value", async () => {
  assert.equal(await withTimeout(Promise.resolve(42)), 42);
});

test("withTimeout rejects with the original error", async () => {
  await assert.rejects(withTimeout(Promise.reject(new Error("boom")), 100), /boom/);
});

test("withTimeout rejects with timeout message when promise never settles", async () => {
  await assert.rejects(
    withTimeout(new Promise(() => {}), 20),
    /timed out/i,
  );
});
