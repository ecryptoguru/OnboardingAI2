# Fretbox Outreach AI — Quick Guide

This is a simple, non-technical guide for sales, ops, and onboarding teammates. For full details, see [user-guide.md](./user-guide.md).

---

## What Fretbox Outreach AI Does

- Discovers Indian universities (UGC list + IITs / NITs / IIITs).
- Researches each university automatically with AI.
- Drafts personalized outreach emails and holds them for your approval.
- Tracks replies, classifies intent, and auto-replies when appropriate.
- Generates rich HTML proposals and books meetings with Google Meet links.

---

## Daily Workflow (10–20 Minutes)

1. Open **Universities** and click **Sync All UGC Universities** or **Sync IITs / NITs / IIITs** if you need fresh leads.
2. Go to **Enrichment**, select a small batch, and click **Run Deep Enrichment**.
3. Go to **Outreach**, find universities in **Ready to Sequence**, and click **Begin Sequence**.
4. (Optional) Click **Document Mailer** to upload a `.docx`, choose recipients (stakeholder or custom email per university), attach the original and/or extra `.docx` files, and create drafts for approval.
5. Go to **Approvals** and review AI-drafted emails.
6. Use **Approve & Send** (or **Edit** first) to send outreach.
7. Check **Analytics** for opens, clicks, bounces, replies, and funnel movement.

---

## Before You Start

Go to **Settings → API Keys** and add:

| Setting | Why it matters |
| --------- | ---------------- |
| Google Gemini | Powers all AI reasoning and content. |
| Serper | Searches and discovers university websites and news. |
| Firecrawl | Crawls websites and extracts contacts. |
| ZeptoMail Email API | Sends every outbound email. |
| ZeptoMail From Email | Verified sender address (default: `outreach@fretbox.in`). |
| ZeptoMail Sender Name | Display name (default: `Ashish Gupta (Fretbox)`). |
| Google Calendar Service Account + Calendar ID | Optional; needed for Meet links and calendar invites. |

Each key can be **saved, tested, and removed** independently.

---

## Universities Page

- **Tabs:** All, Central, State, Private, Deemed, Other.
- **Search:** Type at least 2 characters; results update after a short pause.
- **Actions:**
  - **Validate Websites** — checks which sites are valid/discoverable/invalid.
  - **Sync All UGC Universities** — imports the government list.
  - **Sync IITs / NITs / IIITs** — seeds Institutes of National Importance.
  - **Upload CSV** — import your own list; duplicate names are skipped.
- Click a row to open the detail panel with demographics, stakeholders, and AI signals.

---

## Enrichment

- Three columns: **Pending / New**, **In Progress**, **Enriched**.
- Select universities, then click **Run Deep Enrichment**.
- The AI runs discovery, scraping, social/news discovery, government data, deep enrichment, and scoring.
- The result is a **lead tier** (High / Medium / Low) and a **priority score**.

---

## Outreach Pipeline

| Column | Meaning |
| -------- | --------- |
| Ready to Sequence | Ready for first outreach. |
| Outreach Active | Emails are being sent. |
| Replied | Contact responded. |
| Meeting Booked | Meeting scheduled via Proposals. |
| Not Interested | Declined or opted out. |

- Click **Begin Sequence** to start a 4-step email sequence.
- The first email is drafted and placed in **Approvals**.
- You can move a card back a step or skip it entirely.

---

## Document Mailer

Use this when you want to send a `.docx` document to one or more universities instead of (or alongside) the automated sequence:

1. On **Outreach**, click **Document Mailer**.
2. Upload the main `.docx`. Its text is extracted and shown as the editable email body.
3. Choose whether to also attach the original `.docx`.
4. Add extra `.docx` attachments if needed.
5. Select one or more universities and, for each, pick a stakeholder or enter a custom email.
6. Click **Create drafts**. Each draft goes to **Approvals** for review before it is sent.

---

## Approvals (Human-in-the-Loop)

- Every email is reviewed here before sending.
- **Approve & Send** — sends it immediately.
- **Edit** — change the subject or body, then save and approve.
- **Reject** — deletes the draft and pauses the sequence.
- **Approve All** — sends every pending draft at once.

---

## Proposals

- **Generate Proposal** manually, or a draft is created automatically when a `meeting_request` reply arrives.
- Statuses: **Draft**, **Ready**, **Sent**, **Meeting Confirmed**, **Cancelled**.
- Click **Preview & Send** to edit content, choose recipients/CC, and send the rich HTML proposal.
- Click **Confirm Meeting & Create Meet Link** to pick a time (15–60 min) and generate a Google Calendar event with a Meet link.
- You can also **Reschedule** or **Cancel** a confirmed meeting.

---

## Replies

The system automatically classifies replies:

- `meeting_request` — creates a draft proposal; moves to **Meeting Booked**.
- `positive_interest` — continues follow-up.
- `request_info` — sends details.
- `not_interested` / `opt_out` — stops outreach; moves to **Not Interested**.
- `out_of_office` — retries later.
- `other` — stays for manual review.

Auto-replies are sent for `meeting_request`, `positive_interest`, and `request_info`. Low-confidence high-stakes replies are held for human review.

---

## Analytics

- **Outreach Funnel** — counts at each major stage with conversion rates.
- **Key Metrics** — Reply Rate, Meeting Rate, High/Medium Tier Leads, Not Interested.
- **Email Performance** — Sent, Opened, Open Rate, Clicked, Bounced for each of the 4 sequence steps.
- **Reply Intent Breakdown** — how replies are classified.

---

## Email Tracking

Every sent email is tracked via the ZeptoMail `request_id`. Webhooks update statuses as the email is delivered, opened, clicked, or bounced. These stats feed Analytics and the Outreach timeline.

---

## Password Reset

1. Click **Forgot password?** on the Sign In page.
2. Enter your email and click **Send reset code**.
3. Paste the code from your email and choose a new password (min 8 characters).
4. Reset codes expire in 1 hour.

If you do not receive a code, ask the tech team to check the **ZeptoMail** settings.

---

## If Something Looks Wrong

1. Check **Settings** for missing or expired API keys.
2. Check **Approvals** for unsent drafts.
3. Check **Analytics** for bounces and failures.
4. Check **Outreach** for unclassified replies.
5. Check the **University detail view** — the university needs a valid website and at least one stakeholder email before outreach can start.

For step-by-step instructions, see the full [user-guide.md](./user-guide.md).

---

## More Documentation

- [Project README](../README.md)
- [Codebase map](../CODEBASE.md)
- [Implementation plan](../docs/PLAN.md)
- [Requirements](../docs/Requirement.md)
- [Roadmap](../docs/roadmap.md)
- [Design system](../design-system/onboardingai/MASTER.md)
