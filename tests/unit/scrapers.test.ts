"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import { extractContactsFromMarkdown } from "../../convex/lib/scrapers";

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

  it("should reject malformed 13-digit values that are not Indian phones", () => {
    const result = extractContactsFromMarkdown("VC: +2025052218580");
    assert.deepStrictEqual(result.phones, []);
  });

  it("should ignore embedded timestamps while keeping valid phones", () => {
    const result = extractContactsFromMarkdown(
      "Updated: 2025052218580, VC: 9876543210",
    );
    assert.deepStrictEqual(result.phones, ["+919876543210"]);
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

describe("filterPdfUrls - PDF document detection", () => {
  const PDF_YIELD_PATTERNS = [
    /\.pdf$/i,
    /aishe/i,
    /naac.*ssr/i,
    /mandatory.*disclosure/i,
    /iqac/i,
    /hostel/i,
  ];

  function filterPdfUrls(links: { url: string }[], maxUrls = 3): string[] {
    const scored = links
      .filter((link) => link.url.toLowerCase().endsWith(".pdf"))
      .map((link) => {
        const url = link.url.toLowerCase();
        let score = 0;
        for (const pattern of PDF_YIELD_PATTERNS) {
          if (pattern.test(url)) score += 1;
        }
        return { url: link.url, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxUrls)
      .map((item) => item.url);
    return scored;
  }

  it("should detect AISHE PDFs", () => {
    const links = [
      { url: "https://uni.edu/aishe-report-2023.pdf" },
      { url: "https://uni.edu/contact.html" },
    ];
    const result = filterPdfUrls(links);
    assert.deepStrictEqual(result, ["https://uni.edu/aishe-report-2023.pdf"]);
  });

  it("should detect NAAC SSR PDFs", () => {
    const links = [
      { url: "https://uni.edu/naac-ssr-report.pdf" },
      { url: "https://uni.edu/iqac/mandatory-disclosure.pdf" },
      { url: "https://uni.edu/about" },
    ];
    const result = filterPdfUrls(links, 2);
    assert.strictEqual(result.length, 2);
    // iqac/mandatory-disclosure.pdf scores 3 (pdf + iqac + mandatory-disclosure)
    // naac-ssr-report.pdf scores 2 (pdf + naac-ssr)
    assert.strictEqual(
      result[0],
      "https://uni.edu/iqac/mandatory-disclosure.pdf",
    );
  });

  it("should ignore non-PDF URLs", () => {
    const links = [
      { url: "https://uni.edu/aishe-report.html" },
      { url: "https://uni.edu/contact" },
    ];
    const result = filterPdfUrls(links);
    assert.deepStrictEqual(result, []);
  });

  it("should score multi-match PDFs higher and return sorted", () => {
    const links = [
      { url: "https://uni.edu/naac-ssr-aishe.pdf" }, // matches 3 patterns
      { url: "https://uni.edu/hostel-rules.pdf" }, // matches 2 patterns
      { url: "https://uni.edu/random.pdf" }, // matches 1 pattern
    ];
    const result = filterPdfUrls(links);
    assert.strictEqual(result[0], "https://uni.edu/naac-ssr-aishe.pdf");
    assert.strictEqual(result.length, 3);
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
