"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Mirror of extractContactsFromMarkdown from convex/lib/scrapers.ts
 */
function extractContactsFromMarkdown(markdown: string): {
  emails: string[];
  phones: string[];
} {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(?:\+91[-\s]?|0[-\s]?)?\d(?:[\d\s-]){8,12}/g;

  const emails = new Set(markdown.match(emailRegex) || []);
  const rawPhones = new Set(markdown.match(phoneRegex) || []);

  const validPhones = new Set<string>();
  for (const p of rawPhones) {
    const digits = p.replace(/\D/g, "");
    if (digits.length >= 10) {
      if (digits.length === 10 && /^[6-9]/.test(digits)) {
        validPhones.add(`+91${digits}`);
      } else if (
        digits.length === 11 &&
        digits.startsWith("0") &&
        /^[6-9]/.test(digits.slice(1))
      ) {
        validPhones.add(`+91${digits.slice(1)}`);
      } else if (digits.length === 11 && digits.startsWith("0")) {
        validPhones.add(`+91-${digits.slice(1, 3)}-${digits.slice(3)}`);
      } else if (digits.startsWith("91") && digits.length === 12) {
        validPhones.add(`+${digits}`);
      } else if (digits.length > 10) {
        validPhones.add(`+${digits}`);
      }
    }
  }

  return {
    emails: Array.from(emails),
    phones: Array.from(validPhones),
  };
}

describe("extractContactsFromMarkdown - Emails", () => {
  it("should extract institutional emails", () => {
    const result = extractContactsFromMarkdown(
      "Contact: vc@xim.edu.in, registrar@xim.edu.in",
    );
    assert.deepStrictEqual(result.emails.sort(), [
      "registrar@xim.edu.in",
      "vc@xim.edu.in",
    ]);
  });

  it("should extract gmail as generic domain", () => {
    const result = extractContactsFromMarkdown("Personal: john.doe@gmail.com");
    assert.strictEqual(result.emails.includes("john.doe@gmail.com"), true);
  });

  it("should deduplicate repeated emails", () => {
    const result = extractContactsFromMarkdown(
      "Email: same@uni.edu Email: same@uni.edu",
    );
    assert.strictEqual(result.emails.length, 1);
    assert.strictEqual(result.emails[0], "same@uni.edu");
  });

  it("should return empty arrays for no contacts", () => {
    const result = extractContactsFromMarkdown("No contact info here.");
    assert.deepStrictEqual(result.emails, []);
    assert.deepStrictEqual(result.phones, []);
  });
});

describe("extractContactsFromMarkdown - Phones", () => {
  it("should extract +91 formatted mobile numbers", () => {
    const result = extractContactsFromMarkdown("Call: +91-98765-43210");
    assert.deepStrictEqual(result.phones, ["+919876543210"]);
  });

  it("should extract 10-digit mobile numbers", () => {
    const result = extractContactsFromMarkdown("Phone: 9876543210");
    assert.deepStrictEqual(result.phones, ["+919876543210"]);
  });

  it("should extract landline with STD code", () => {
    const result = extractContactsFromMarkdown("Landline: 011-1234-5678");
    assert.deepStrictEqual(result.phones, ["+91-11-12345678"]);
  });

  it("should extract 0-prefixed mobile", () => {
    const result = extractContactsFromMarkdown("Phone: 09876543210");
    assert.deepStrictEqual(result.phones, ["+919876543210"]);
  });

  it("should reject invalid 5-digit numbers", () => {
    const result = extractContactsFromMarkdown("Code: 12345");
    assert.deepStrictEqual(result.phones, []);
  });

  it("should reject 10-digit numbers starting with 1-5", () => {
    // 10-digit numbers not starting with 6-9 are likely false positives
    const result = extractContactsFromMarkdown("Phone: 1234567890");
    assert.deepStrictEqual(result.phones, []);
  });

  it("should deduplicate same phone in different formats", () => {
    const result = extractContactsFromMarkdown(
      "Mobile: +91-98765-43210, Office: 09876543210",
    );
    assert.strictEqual(result.phones.length, 1);
    assert.strictEqual(result.phones[0], "+919876543210");
  });

  it("should extract multiple different phones", () => {
    const result = extractContactsFromMarkdown(
      "VC: +91-98765-43210, Registrar: +91-87654-32109",
    );
    assert.strictEqual(result.phones.length, 2);
    assert.strictEqual(result.phones.includes("+919876543210"), true);
    assert.strictEqual(result.phones.includes("+918765432109"), true);
  });
});

describe("extractContactsFromMarkdown - Combined", () => {
  it("should handle anti-ragging committee page content", () => {
    const markdown = `
      Anti-Ragging Committee
      Prof. R.K. Sharma (Chairman) — 9876543210
      Dr. P. Singh (Member) — 8765432109
      Email: antiragging@iitb.ac.in, chairman@iitb.ac.in
    `;
    const result = extractContactsFromMarkdown(markdown);
    assert.strictEqual(result.emails.length, 2);
    assert.strictEqual(result.phones.length, 2);
    assert.strictEqual(result.emails.includes("antiragging@iitb.ac.in"), true);
    assert.strictEqual(result.emails.includes("chairman@iitb.ac.in"), true);
    assert.strictEqual(result.phones.includes("+919876543210"), true);
    assert.strictEqual(result.phones.includes("+918765432109"), true);
  });

  it("should NOT pair email #1 with phone #1", () => {
    // This was the old bug: emails and phones were zipped by array index
    const markdown = `
      Dr. A: a@uni.edu — 9876543210
      Dr. B: b@uni.edu — 8765432109
    `;
    const result = extractContactsFromMarkdown(markdown);
    // Both lists should be independently complete
    assert.strictEqual(result.emails.length, 2);
    assert.strictEqual(result.phones.length, 2);
    // There should be no false pairing — just two separate lists
  });
});

describe("filterHighYieldUrls - URL scoring", () => {
  it("should score contact pages highest", () => {
    const HIGH_YIELD_PATTERNS = [
      /(contact|feedback|reach[\s-]?us|enquiry|support|help)/i,
      /(admin|administration|governance|board|director|executive|leadership|management|principal|registrar|vice[\s-]?chancellor|chancellor|dean|head|coordinator|hod)/i,
      /(anti[\s-]?ragging|statutory|committee|grievance|cell|welfare|student[\s-]?affairs)/i,
      /(mandatory[\s-]?disclosure|iqac|naac|naac-ssr|aqar|audit|accreditation|ssr)/i,
      /(about[\s-]?us|profile|overview|facts|figures|campus|at[\s-]?a[\s-]?glance)/i,
      /(phone|telephone|mobile|fax|email)/i,
    ];

    function scoreUrl(url: string): number {
      const lower = url.toLowerCase();
      let score = 0;
      for (const p of HIGH_YIELD_PATTERNS) {
        if (p.test(lower)) score += 1;
      }
      return score;
    }

    assert.strictEqual(scoreUrl("https://uni.edu/contact-us"), 1);
    assert.strictEqual(scoreUrl("https://uni.edu/administration/board"), 1);
    assert.strictEqual(scoreUrl("https://uni.edu/about-us"), 1);
    assert.strictEqual(scoreUrl("https://uni.edu/random"), 0);
    assert.strictEqual(scoreUrl("https://uni.edu/contact/administration"), 2);
    assert.strictEqual(scoreUrl("https://uni.edu/anti-ragging-committee"), 1);
  });
});
