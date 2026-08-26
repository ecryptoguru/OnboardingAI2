import { test, expect, type Page } from "@playwright/test";
import {
  requireAuth,
  signIn,
  gotoAuthenticated,
  collectErrors,
  E2E_RECIPIENT,
  E2E_SEND_ALLOWED,
} from "./helpers/auth";

/**
 * Controlled core-flow journey:
 *   CSV ingestion → search → Document Mailer draft → HITL approve & send.
 *
 * Safety gates:
 *  - The send journey runs only with E2E_SEND_ALLOWED=1.
 *  - The only email recipient is E2E_RECIPIENT (approved test inbox).
 *  - The only university record created is named "[E2E] Handover University".
 *  - Cleanup is scoped to that exact record name; nothing else is touched.
 */

const E2E_UNIVERSITY = "[E2E] Handover University";
const E2E_SEARCH_TERM = "Handover";
const E2E_SUBJECT_PREFIX = "[E2E] Handover test";

// ─── Minimal .docx builder (stored ZIP with CRC32) ───────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipEntry(name: string, content: string): Buffer {
  const data = Buffer.from(content, "utf-8");
  const nameBuf = Buffer.from(name, "utf-8");
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuf, data]);
}

function buildMinimalDocx(text: string): Buffer {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body><w:p><w:r><w:t>" +
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
    "</w:t></w:r></w:p></w:body></w:document>";

  const entries = [
    zipEntry("[Content_Types].xml", contentTypes),
    zipEntry("_rels/.rels", rels),
    zipEntry("word/document.xml", document),
  ];

  const central: Buffer[] = [];
  let offset = 0;
  const names = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  for (let i = 0; i < entries.length; i++) {
    const nameBuf = Buffer.from(names[i], "utf-8");
    const data = entries[i].subarray(30 + nameBuf.length);
    const crc = crc32(data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([entry, nameBuf]));
    offset += entries[i].length;
  }

  const centralStart = entries.reduce((acc, e) => acc + e.length, 0);
  const centralSize = central.reduce((acc, e) => acc + e.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralStart, 16);

  return Buffer.concat([...entries, ...central, eocd]);
}

// ─── Journey steps ────────────────────────────────────────────────────────────

async function ensureE2EUniversity(page: Page) {
  // Idempotent: if the record already exists (deduped by namesMatch), the
  // import reports 0 and we move on.
  const csv = `university_name,state,city,type\n${E2E_UNIVERSITY},Delhi,New Delhi,Private\n`;
  await page
    .locator('input[aria-label="Upload CSV file"]')
    .setInputFiles({
      name: "e2e-handover.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
  await expect(page.getByText(/Imported \d+ universit/)).toBeVisible({
    timeout: 30000,
  });
}

test.describe("Core journey: ingest → draft → HITL send (controlled)", () => {
  test.beforeEach(() => requireAuth());

  test("CSV ingestion creates the test university and it is searchable", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);
    await ensureE2EUniversity(page);

    const search = page.locator('input[placeholder="Search universities..."]');
    await search.fill(E2E_SEARCH_TERM);
    await expect(
      page.getByRole("button", { name: /Open details for .*Handover/i }),
    ).toBeVisible({ timeout: 25000 });

    errors.assertClean();
  });

  test("Document Mailer creates a draft and HITL sends it to the approved inbox", async ({
    page,
  }) => {
    test.skip(
      !E2E_SEND_ALLOWED,
      "E2E_SEND_ALLOWED != 1 — controlled send disabled",
    );
    const errors = collectErrors(page);
    await signIn(page);

    // Ensure the test university exists (idempotent).
    await ensureE2EUniversity(page);

    // Open the Document Mailer.
    await gotoAuthenticated(page, "/dashboard/outreach");
    await page.getByRole("button", { name: /Document Mailer/i }).click();
    const dialog = page.getByRole("dialog", { name: "Document Mailer" });
    await expect(dialog).toBeVisible();

    // Select the E2E university.
    await dialog.getByPlaceholder("Search universities…").fill(E2E_SEARCH_TERM);
    await dialog.getByText(E2E_UNIVERSITY, { exact: true }).click();

    // Custom recipient = approved test inbox.
    await dialog.getByPlaceholder("recipient@university.edu").fill(E2E_RECIPIENT);

    // Upload a minimal .docx body.
    const subject = `${E2E_SUBJECT_PREFIX} ${Date.now()}`;
    await dialog.getByLabel("Subject").fill(subject);
    const bodyInput = dialog.locator('input[type="file"]').first();
    await bodyInput.setInputFiles({
      name: "e2e-body.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: buildMinimalDocx("E2E handover test body"),
    });

    // Extracted text becomes editable and the draft button enables.
    const bodyEditor = dialog.getByLabel("Extracted email body (editable)");
    await expect(bodyEditor).toBeVisible({ timeout: 20000 });
    await bodyEditor.fill("E2E handover test body — approved for testing.");
    const createButton = dialog.getByRole("button", { name: /Create 1 draft/i });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    await expect(page.getByText(/Created 1 draft/)).toBeVisible({ timeout: 30000 });

    // Approve & send from the HITL queue.
    await gotoAuthenticated(page, "/dashboard/approvals");
    const draftText = page.getByText(subject, { exact: false });
    await expect(draftText.first()).toBeVisible({ timeout: 30000 });

    const card = draftText
      .first()
      .locator("xpath=ancestor::div[contains(@class,'bg-card')]");
    await card.getByRole("button", { name: /Approve & Send/i }).click();

    // Success toast or card removal proves dispatch completed.
    await expect
      .poll(async () => (await draftText.first().count()) === 0, {
        timeout: 60000,
      })
      .toBe(true);

    errors.assertClean();
  });
});
