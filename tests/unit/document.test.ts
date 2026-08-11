import { describe, it } from "node:test";
import assert from "node:assert";
import mammoth from "mammoth";
import fs from "node:fs";
import path from "node:path";

const TEST_DOCX = path.join(
  process.cwd(),
  "node_modules",
  "mammoth",
  "test",
  "test-data",
  "single-paragraph.docx",
);

function docxMimeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "application/octet-stream";
}

describe("Document Mailer helpers", () => {
  it("extracts plain text from a .docx file", async () => {
    const buffer = fs.readFileSync(TEST_DOCX);
    const result = await mammoth.extractRawText({ buffer });
    assert.strictEqual(typeof result.value, "string");
    assert.ok(result.value.length > 0, "expected non-empty text");
  });

  it("converts a .docx file to HTML", async () => {
    const buffer = fs.readFileSync(TEST_DOCX);
    const result = await mammoth.convertToHtml({ buffer });
    assert.ok(result.value.includes("<p>"), "expected HTML paragraph");
  });

  it("infers the correct .docx MIME type from filename", () => {
    assert.strictEqual(
      docxMimeFromFilename("proposal.docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.strictEqual(docxMimeFromFilename("file"), "application/octet-stream");
  });
});
