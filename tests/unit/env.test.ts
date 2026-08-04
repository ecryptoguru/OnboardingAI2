"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getRequiredEnv,
  getOptionalEnv,
  getOptionalNumber,
  getOptionalBoolean,
} from "../../convex/lib/env";

describe("env helpers", () => {
  const envVar = "__ENV_TEST_VAR__";

  it("getRequiredEnv throws when variable is missing", () => {
    delete process.env[envVar];
    assert.throws(
      () => getRequiredEnv(envVar),
      new RegExp(`${envVar} is not set. Set it with: npx convex env set ${envVar} <value>`),
    );
  });

  it("getRequiredEnv throws when variable is empty", () => {
    process.env[envVar] = "   ";
    assert.throws(
      () => getRequiredEnv(envVar),
      new RegExp(`${envVar} is not set. Set it with: npx convex env set ${envVar} <value>`),
    );
  });

  it("getRequiredEnv returns trimmed value", () => {
    process.env[envVar] = "  hello world  ";
    assert.strictEqual(getRequiredEnv(envVar), "hello world");
    delete process.env[envVar];
  });

  it("getOptionalEnv returns undefined when missing", () => {
    delete process.env[envVar];
    assert.strictEqual(getOptionalEnv(envVar), undefined);
  });

  it("getOptionalEnv returns undefined when empty or whitespace", () => {
    process.env[envVar] = "   ";
    assert.strictEqual(getOptionalEnv(envVar), undefined);
    delete process.env[envVar];
  });

  it("getOptionalEnv returns trimmed value", () => {
    process.env[envVar] = "  value  ";
    assert.strictEqual(getOptionalEnv(envVar), "value");
    delete process.env[envVar];
  });

  it("getOptionalNumber returns undefined when missing", () => {
    delete process.env[envVar];
    assert.strictEqual(getOptionalNumber(envVar), undefined);
  });

  it("getOptionalNumber parses a plain integer", () => {
    process.env[envVar] = "42";
    assert.strictEqual(getOptionalNumber(envVar), 42);
    delete process.env[envVar];
  });

  it("getOptionalNumber parses a plain float", () => {
    process.env[envVar] = "3.14";
    assert.strictEqual(getOptionalNumber(envVar), 3.14);
    delete process.env[envVar];
  });

  it("getOptionalNumber trims whitespace and commas", () => {
    process.env[envVar] = "  1,234.56  ";
    assert.strictEqual(getOptionalNumber(envVar), 1234.56);
    delete process.env[envVar];
  });

  it("getOptionalNumber clamps to min", () => {
    process.env[envVar] = "5";
    assert.strictEqual(getOptionalNumber(envVar, { min: 10 }), 10);
    delete process.env[envVar];
  });

  it("getOptionalNumber clamps to max", () => {
    process.env[envVar] = "100";
    assert.strictEqual(getOptionalNumber(envVar, { max: 50 }), 50);
    delete process.env[envVar];
  });

  it("getOptionalNumber returns undefined for non-numeric strings", () => {
    process.env[envVar] = "not-a-number";
    assert.strictEqual(getOptionalNumber(envVar), undefined);
    delete process.env[envVar];
  });

  it("getOptionalNumber returns undefined for NaN-producing values", () => {
    process.env[envVar] = "Infinity";
    assert.strictEqual(getOptionalNumber(envVar), undefined);
    delete process.env[envVar];
  });

  it("getOptionalBoolean is true only for exact 'true'", () => {
    process.env[envVar] = "true";
    assert.strictEqual(getOptionalBoolean(envVar), true);
    delete process.env[envVar];
  });

  it("getOptionalBoolean is false for any other value", () => {
    process.env[envVar] = "1";
    assert.strictEqual(getOptionalBoolean(envVar), false);
    process.env[envVar] = "TRUE";
    assert.strictEqual(getOptionalBoolean(envVar), false);
    process.env[envVar] = "yes";
    assert.strictEqual(getOptionalBoolean(envVar), false);
    delete process.env[envVar];
  });

  it("getOptionalBoolean is false when missing", () => {
    delete process.env[envVar];
    assert.strictEqual(getOptionalBoolean(envVar), false);
  });
});
