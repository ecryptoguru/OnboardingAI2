"use node";

import { describe, it } from "node:test";
import assert from "node:assert";

// ⚠️ CRITICAL: These templates are replicated from convex/lib/emailTemplates.ts
// because tsx cannot resolve modules inside the convex/ directory at test time.
// If you modify the real templates, you MUST update these inline copies.
// TODO: Extract shared pure helpers to a non-convex package so both source
// and tests can import them without duplication.

const htmlWrap = (content: string) => `<html><body>${content}</body></html>`;
const p = (text: string, style = "") =>
  `<p style="margin:0 0 16px 0;${style}">${text}</p>`;
const strong = (text: string) => `<strong>${text}</strong>`;
const bullet = (items: string[]) =>
  `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const ctaButton = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;">${label}</a>`;
const divider = () => `<hr/>`;

const MEETING_REQUEST_ACK = (
  name: string,
  uniName: string,
  meetLink?: string,
) => {
  const ctaText = meetLink
    ? `Your meeting is confirmed. Join here: ${meetLink}`
    : "To make our time most productive, feel free to book a specific slot that works for you.";
  const ctaLabel = meetLink ? "Join Google Meet →" : "Confirm Your Slot →";
  const ctaHref = meetLink ?? "https://fretbox.in/book";
  return {
    subject: `Let's connect: Fretbox x ${uniName}`,
    body: `Hi ${name},\n\n${ctaText}\n\nSee soon.`,
    html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${p(ctaText)}
      ${meetLink ? p(`<a href="${meetLink}">${meetLink}</a>`) : ""}
      ${ctaButton(ctaHref, ctaLabel)}
      ${divider()}
    `),
  };
};

const POSITIVE_INTEREST = (
  name: string,
  uniName: string,
  meetLink?: string,
) => {
  const ctaLabel = meetLink ? "Join Google Meet →" : "Book a 15-min Demo";
  const ctaHref = meetLink ?? "https://fretbox.in/book";
  return {
    subject: `Deep dive: Fretbox x ${uniName}`,
    body: `Hi ${name},\n\n${meetLink ? "Join: " + meetLink : "Reply to schedule."}`,
    html: htmlWrap(`
      ${p(`Hi ${strong(name)},`)}
      ${bullet(["Hostel Management", "Facility Operations"])}
      ${
        meetLink
          ? p(`Join here: <a href="${meetLink}">${meetLink}</a>`)
          : p("Simply reply to this email with a few times that work for you.")
      }
      ${ctaButton(ctaHref, ctaLabel)}
      ${divider()}
    `),
  };
};

describe("Email Templates", () => {
  it("MEETING_REQUEST_ACK should include Meet link when provided", () => {
    const result = MEETING_REQUEST_ACK(
      "Ashish",
      "IIT Delhi",
      "https://meet.google.com/abc-defg-hij",
    );
    assert.ok(result.subject.includes("IIT Delhi"));
    assert.ok(result.body.includes("meet.google.com"));
    assert.ok(result.html!.includes("meet.google.com"));
    assert.ok(result.html!.includes("Join Google Meet"));
  });

  it("MEETING_REQUEST_ACK should fallback gracefully without Meet link", () => {
    const result = MEETING_REQUEST_ACK("Ashish", "IIT Delhi");
    assert.ok(result.subject.includes("IIT Delhi"));
    assert.ok(!result.body.includes("meet.google.com"));
    assert.ok(result.html!.includes("Confirm Your Slot"));
  });

  it("POSITIVE_INTEREST should include Meet link when provided", () => {
    const result = POSITIVE_INTEREST(
      "Ashish",
      "IIT Delhi",
      "https://meet.google.com/abc-defg-hij",
    );
    assert.ok(result.body.includes("meet.google.com"));
    assert.ok(result.html!.includes("Join Google Meet"));
  });

  it("POSITIVE_INTEREST should fallback gracefully without Meet link", () => {
    const result = POSITIVE_INTEREST("Ashish", "IIT Delhi");
    assert.ok(!result.body.includes("meet.google.com"));
    assert.ok(result.html!.includes("Simply reply to this email"));
  });
});
