"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

function truncateAtNewline(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const sliced = text.substring(0, maxChars);
  const lastNewline = sliced.lastIndexOf("\n");
  if (lastNewline > maxChars * 0.9) {
    return sliced.substring(0, lastNewline) + "\n\n[…truncated]";
  }
  return sliced + "[…truncated]";
}

describe("truncateAtNewline", () => {
  it("returns short text unchanged", () => {
    const text = "Short text";
    assert.strictEqual(truncateAtNewline(text, 100), text);
  });

  it("truncates at last newline when close to limit", () => {
    const lines = ["Line one", "Line two", "Line three", "Line four"];
    const text = lines.join("\n");
    const limit = text.indexOf("Line three") + 5; // Cut somewhere in "Line three"
    const result = truncateAtNewline(text, limit);
    assert.ok(result.endsWith("[…truncated]"));
    assert.ok(!result.includes("Line three"));
    assert.ok(result.includes("Line two"));
  });

  it("appends ellipsis when no newline near limit", () => {
    const text = "This is a single line that exceeds the character limit";
    const result = truncateAtNewline(text, 20);
    assert.ok(result.endsWith("[…truncated]"));
    assert.strictEqual(result.length, 20 + "[…truncated]".length);
  });

  it("does not cut off at newline that is too far from limit", () => {
    // If the last newline is before 90% of maxChars, just slice hard
    const text = "First paragraph\n\nSecond paragraph that is very long";
    const result = truncateAtNewline(text, 35);
    assert.ok(result.endsWith("[…truncated]"));
    // Should have sliced at 35 chars, not at the early newline
    assert.ok(result.includes("Second"));
  });

  it("handles text with no newlines", () => {
    const text = "abcdefghijklmnopqrstuvwxyz";
    const result = truncateAtNewline(text, 10);
    assert.strictEqual(result, "abcdefghij[…truncated]");
  });

  it("handles empty string", () => {
    assert.strictEqual(truncateAtNewline("", 100), "");
  });

  it("preserves table rows by cutting at row boundary", () => {
    const table = [
      "Name    | Role     | Phone",
      "--------|----------|-------",
      "Dr. A   | VC       | 9876543210",
      "Dr. B   | Registrar| 8765432109",
    ].join("\n");
    const limit = table.indexOf("Dr. B") + 5;
    const result = truncateAtNewline(table, limit);
    assert.ok(result.includes("Dr. A"));
    assert.ok(!result.includes("Dr. B"));
    assert.ok(result.endsWith("[…truncated]"));
  });
});
