# Fretbox Outreach AI — User Guide

> **One-liner:** Fretbox Outreach AI discovers Indian universities, enriches them with research signals, and automates personalized email sequences to book meetings for Fretbox.

---

## 1. Quick Start (5 Minutes)

1. **Sign Up or Sign In** — Open the app URL and create an account, or sign in to an existing one.
2. **Add API Keys** — Go to **Settings → API Keys** and add:
   - **Google Gemini API Key** — Powers AI enrichment, reply classification, and proposal generation.
   - **Serper API Key** — Discovers and validates university websites and news.
   - **Firecrawl API Key** — Deep site crawling and contact/content extraction.
   - **ZeptoMail Email API Key** — Sends all outbound emails and tracks delivery.
   - **ZeptoMail From Email** — A verified sender address for outreach.
   - **ZeptoMail Sender Name** — The name shown as the sender.
   - *(Optional)* **Google Calendar Service Account JSON + Calendar ID** — Enables meeting invites and Google Meet links from proposals.
3. **Seed Universities** — Go to **Universities** and click **Sync All UGC Universities** to import the latest government-recognized dataset.
4. **Enrich** — Go to **Enrichment**, select a batch of universities, and click **Run Deep Enrichment**.
5. **Start Outreach** — Go to **Outreach**, pick a university in **Ready to Sequence**, and click **Begin Sequence**. The first email is drafted and placed in **Approvals** for human review.
6. **Send Document Emails** — On **Outreach**, click **Document Mailer**, upload a `.docx`, choose recipients (stakeholders or custom emails), optionally attach the original and extra files, and create drafts. Review and approve them in **Approvals**.

> **Tip:** Each API key, sender setting, and calendar credential can be saved, tested, and removed independently from the Settings page.

---

## 2. Sign Up, Sign In, and Forgot Password

### Creating an account

1. Open the **Sign Up** page.
2. Enter your email and a password with at least 8 characters.
3. Click **Create account**.
4. You are signed in automatically and redirected to the dashboard.

### Signing in

1. Open the **Sign In** page.
2. Enter your email and password.
3. Click **Sign in**.

### Resetting your password

1. On the **Sign In** page, click **Forgot password?**
2. Enter your account email and click **Send reset code**.
3. Check your inbox for the reset code (it expires in 1 hour).
4. On the **Reset password** page, enter the code, your new password, and confirm it.
5. You are signed in automatically and redirected to the dashboard.

> **Tip:** The reset code is sent by email via ZeptoMail. If you do not receive it, make sure **ZeptoMail Email API Key** and **ZeptoMail From Email** are configured in **Settings → API Keys**.

---

## 3. Dashboard Navigation

The left sidebar is organized into three sections:

- **CORE**
  - **Universities** — Browse, search, and manage your university list.
  - **Enrichment** — Run AI enrichment on universities.
- **PIPELINE**
  - **Analytics** — View funnel metrics and email performance.
  - **Outreach** — Manage sequences, monitor replies, and send document-based emails via **Document Mailer**.
  - **Proposals** — Generate and send rich HTML proposals.
  - **Approvals** — Review and approve pending emails before they are sent.
- **SYSTEM**
  - **Settings** — Configure API keys, sender details, and calendar integration.

Badges on the sidebar show live counts:

- **Outreach** — Number of unclassified replies.
- **Approvals** — Number of pending emails awaiting your review.

A **Sign out** button is at the bottom of the sidebar. The **Theme Toggle** is in the sidebar header next to the logo, so you can switch between light and dark mode.

---

## 4. Universities

### Browse the list

The **Universities** page shows your full database in a table. Use the tabs at the top to filter by type: **All**, **Central**, **State**, **Private**, **Deemed**, and **Other**.

Each tab also shows a count badge for that type.

### Search

Type at least two characters in the search bar. Results update automatically after you stop typing (with a 300 ms debounce).

### Upload universities via CSV

1. Click **Upload CSV**.
2. Select a CSV with at least a `university_name` column.

**Supported columns and aliases:**

| Column | Required | Aliases accepted | Example |
| -------- | ---------- | ------------------ | --------- |
| `university_name` | Yes | `Name`, `University` | "Delhi University" |
| `state` | No | `State` | "Delhi" |
| `city` | No | `City` | "New Delhi" |
| `website` | No | `Website` | "<https://du.ac.in>" |
| `student_count` | No | `Students` | 70000 |
| `type` | No | `Type` | "Public", "Private", "Deemed", "Central", "State" |
| `naac_grade` | No | `NAAC` | "A++", "A+", "A", "B" |

> **Edge case:** Universities with a duplicate `university_name` are skipped during upload. The upload status shows how many were imported and how many were skipped.

### Sync from UGC

Click **Sync All UGC Universities** to fetch the latest Indian university dataset from UGC. The action merges new and changed records into your database and shows the number of universities added and updated.

### Sync IITs / NITs / IIITs

Click **Sync IITs / NITs / IIITs** to seed Institutes of National Importance (IITs, NITs, IIITs, and similar elite institutions). The action shows how many were added, updated, and skipped because they were already present.

### Validate Websites

Click **Validate Websites** to schedule automated website verification across your database. Validation runs in batches of 50 and checks whether each university has a valid, discoverable, or invalid website.

### University detail view

Click any table row to open a detail panel. The panel shows:

- University name, location, zip code, and a link to its website.
- Student count and UGC recognition status.
- A **Deep Enrich (AISHE + Social)** button to run the full enrichment chain on that university.
- **UGC Information** — Vice Chancellor, Registrar, and full address.
- **Student Strength (NIRF)** — Program-wise student totals, when available.
- **Student Demographics (AISHE / NAAC / SSR / NIRF)** — Total students, day scholars, hostelites, and a hostelite occupancy bar.
- **Priority Scoring** — Final health / fit score out of 100.
- **Stakeholders** — Discovered contacts with email, phone, and LinkedIn, tagged as either "UGC" or "AI Enriched".
- **AI Signals** — Recent signals from LinkedIn, Google News, Google Images, and Serper search.

> **Note:** The current outreach stage and lead tier are visible on the Universities table and in the Outreach pipeline, not inside the detail panel.

---

## 5. Enrichment

Enrichment is the multi-phase process of using AI to research a university and extract valuable signals.

### The enrichment chain

For each selected university, the system runs the following phases in order:

| Phase | What it does |
| ------- | -------------- |
| **Discovery** | Finds and validates the official website when one is missing or suspicious. |
| **Scraping** | Extracts website data, including anti-ragging and contact pages. |
| **Social & media discovery** | Searches LinkedIn, Google News, Google Images, and Serper results. |
| **Contact inference** | Infers role-based contacts from the scraped site. |
| **Government data enrichment** | Pulls AISHE, NAAC, SSR, and NIRF demographic data. |
| **Deep enrichment** | Uses all gathered signals to build a richer university profile. |
| **Social refresh** | Re-runs profile and signal discovery after new contacts are found. |
| **Scoring** | Generates a **Priority Score** and a **lead tier** (High / Medium / Low). |

### How to run enrichment

1. Go to **Enrichment**.
2. In the **Pending / New** column, select universities via the checkboxes.
3. Use **Select All** to quickly pick every visible university.
4. Click **Run Deep Enrichment** (the button shows how many are selected).
5. Universities move to **In Progress**, then to **Enriched** when complete.

> **Tip:** Start with a small batch (5–10) to see how the AI personalizes signals before scaling. The system runs selected enrichments in parallel.

### Results

After enrichment, a university shows:

- A **lead tier** (High / Medium / Low) in the Enrichment and Outreach cards.
- A **priority score** in the detail panel.
- **Demographics** — student totals, day scholars, and hostelites.
- **Stakeholders** — discovered contacts such as Vice Chancellor and Registrar.
- **AI Signals** — recent news, LinkedIn, and website content.

---

## 6. Outreach

The **Outreach** page is a Kanban-style pipeline that tracks where each university sits in your sales process.

### Pipeline columns

The Kanban has five columns:

| Column | Meaning |
| -------- | --------- |
| **Ready to Sequence** | Enriched and ready for first outreach. |
| **Outreach Active** | Emails are being sent as part of an active sequence. |
| **Replied** | A stakeholder has replied. |
| **Meeting Booked** | A meeting has been scheduled through a proposal. |
| **Not Interested** | The contact opted out or declined. |

Each card shows the university name, location, lead tier, current outreach stage, and a meeting badge when applicable. Cards in an active sequence display the current step, total steps, status (Active or Awaiting Approval), and a progress bar.

### Starting a sequence

1. Find a university in **Ready to Sequence**.
2. Click its card and then **Begin Sequence**.
3. The AI creates a 4-step sequence and drafts the first email.
4. The draft is placed in **Approvals** for human review before sending.
5. Once approved, the email is sent via ZeptoMail and the sequence resumes.

### Sequence steps

The default sequence has 4 steps:

1. **Initial Outreach**
2. **Follow-up 1**
3. **Value-Add Follow-up**
4. **Break-up / Final**

Auto-replies use a special step number **99** and are visible in the approvals queue with that label.

### Reverting a stage

Each Kanban card has a **Move back a step** button that rewinds the university to the previous stage.

### Skipping a university

Use the **Skip University** button in the header to permanently remove a university from the active pipeline. A **Skipped List** tab lets you review and search skipped universities.

### Client demo view

The **Client Demo View** button opens a read-only demo page of the pipeline.

---

## 7. Approvals

The **Approvals** page is the mandatory Human-in-the-Loop (HITL) gate. Every AI-drafted email must be reviewed before it is sent.

### Reviewing an email

1. Go to **Approvals**.
2. Each card shows the step number, step label, university, recipient, subject, and body.
3. Choose an action:

| Action | Result |
| -------- | -------- |
| **Approve & Send** | Dispatches the email immediately via ZeptoMail. |
| **Edit** | Modify the subject and body, then save. You can approve after editing. |
| **Reject** | Deletes the draft permanently and pauses the sequence for that stakeholder. |

### Bulk approve

If you have multiple pending drafts, click **Approve All** to send them all at once. The button shows the number of pending emails.

> **Tip:** A quick human edit — like mentioning a recent university award or specific hostel count — can significantly improve open and reply rates.

---

## 8. Proposals

Proposals are AI-generated rich HTML deal documents tailored to each university. They are not PDFs; they are sent as HTML emails.

### Creating a proposal

You can create a proposal in two ways:

- **Manually** — Click **Generate Proposal**, select a university, optionally select a stakeholder, and confirm.
- **Automatically** — When a stakeholder replies with a meeting request, the system creates a draft proposal with **Meeting Pending** status.

### Proposal content

The AI produces a structured document containing:

- Executive summary (hook, why now, vision statement)
- Problem statement
- Solution overview
- Key benefits
- ROI summary
- Next steps
- Agenda

### Proposal statuses

| Status | Meaning |
| -------- | --------- |
| **Draft** | The proposal is being generated. |
| **Ready** | The proposal is ready to preview and send. |
| **Sent** | The proposal has been emailed to the stakeholder. |
| **Meeting Confirmed** | A meeting has been confirmed and a Google Calendar event with a Meet link created. |

### Previewing and sending

1. Open a ready proposal.
2. Click **Preview & Send**.
3. The modal has two sides: the document editor on the left and send settings on the right.
4. Edit any section if needed and click **Save Draft**.
5. Select one or more recipients from the stakeholder list.
6. Optionally add CC addresses (comma-separated).
7. Click **Send Proposal**. The proposal is sent as a rich HTML email via ZeptoMail.

### Confirming, rescheduling, or cancelling a meeting

When a proposal is **Meeting Pending**:

1. Click **Confirm Meeting & Create Meet Link**.
2. Choose a **start time** and a **duration** (15, 30, 45, or 60 minutes).
3. Click **Confirm & Generate Link**.
4. The system creates a Google Calendar event with a Google Meet link and updates the proposal to **Meeting Confirmed**.
5. Click **Open Meet Link** to join the call.

For confirmed meetings, the button becomes **Reschedule Meeting**. If the meeting cannot happen, click **Cancel** to set the Google Calendar event status to cancelled; the proposal remains in the system so you can reconfirm later.

### Google Calendar integration

To enable automatic calendar events:

1. Go to **Settings → API Keys**.
2. Add your **Google Calendar Service Account JSON** (from Google Cloud).
3. Set a **Calendar ID** — use `primary` or a specific calendar. The default is `primary`.

> **Edge case:** If a proposal has no stakeholders with email, it is generically addressed and no attendee is added automatically, but a calendar event can still be created.

---

## 9. Replies and Auto-Replies

### Inbound reply webhook

When a stakeholder replies, the inbound reply webhook (`/webhooks/email-reply`) resolves the conversation context by:

- Matching the `Message-ID` / `In-Reply-To` headers to a sent email.
- Falling back to the sender email address to find the stakeholder.

If the context cannot be resolved, the webhook returns an error and the reply must be reviewed manually.

### Reply classification

Once context is resolved, the system stores the raw reply and uses Gemini to classify it into one of these categories:

| Classification | Follow-up action |
| ---------------- | ------------------ |
| `meeting_request` | Creates a draft proposal; confirms meeting in the Proposals page. |
| `positive_interest` | Continues the sequence or sends a positive follow-up. |
| `request_info` | Sends details or FAQ. |
| `not_interested` / `opt_out` | Stops outreach and moves the university to **Not Interested**. |
| `out_of_office` | Retries follow-up later. |
| `other` | Stays visible for manual review. |

The outreach stage is updated automatically: `meeting_request` becomes **Meeting Booked**, `not_interested` / `opt_out` becomes **Not Interested**, and other replies become **Replied**.

### Auto-replies

For `meeting_request`, `positive_interest`, and `request_info` replies, the system automatically sends a polite, threaded response (with proper `In-Reply-To` and `References` headers). For `meeting_request`, the response uses any existing Google Meet link when available.

High-stakes classifications (`meeting_request` or `positive_interest`) with low model confidence (below 0.85) are blocked from auto-reply and flagged for human review.

Unclassified or unmatched replies show a badge on the **Outreach** sidebar item and appear in the **Replies** panel on the Outreach page.

---

## 10. Analytics

The **Analytics** page gives a high-level view of pipeline performance.

### Outreach funnel

A horizontal bar chart shows how many universities are at each stage:

```text
Total Universities → Enriched → Outreach Active → Replied → Meeting Booked → Proposal Sent → Closed / Won
```

The funnel uses the exact sum of all tracked outreach stages. Each bar also shows the conversion rate from the previous stage.

### Key metrics

Four cards show:

- **Reply Rate** — percentage of active outreach that received a reply.
- **Meeting Rate** — percentage of replies that booked a meeting.
- **High Tier Leads** — count of universities with a High lead tier (plus Medium tier shown as a sub-label).
- **Not Interested** — count of universities that opted out or did not reply.

### Email performance

A table breaks down delivery metrics for each of the four sequence steps:

| Metric | What it tells you |
| -------- | ------------------- |
| **Sent** | Emails dispatched. |
| **Opened** | Recipients opened the email. |
| **Open Rate** | Percentage of sent emails that were opened. |
| **Clicked** | Recipients clicked a link. |
| **Bounced** | Invalid email address or full mailbox. |

The step labels are **Initial Outreach**, **Follow-up 1**, **Value Add**, and **Break-up**.

### Reply intent breakdown

A grid of classification cards shows how stakeholders have responded and the percentage of total replies each represents.

---

## 11. Settings

The **Settings** page is where you configure all integrations and credentials.

### API Keys

Each integration has its own card with a status indicator, input field, **Save**, **Test**, and **Remove** actions:

| Section | What it powers |
| --------- | ---------------- |
| **Google Gemini API Configuration** | AI reasoning, reply classification, proposal generation, and enrichment. |
| **Serper API Configuration** | Google Search, News, and Image discovery during enrichment. |
| **Firecrawl API Configuration** | Deep web crawling, sitemap discovery, and contact extraction. |
| **ZeptoMail Email API** | Sending all transactional and outreach emails. |
| **ZeptoMail From Email** | Verified sender address for all outbound emails (default: `outreach@fretbox.in`). |
| **ZeptoMail Sender Name** | Display name for the sender (default: `Ashish Gupta (Fretbox)`). |
| **Google Calendar Service Account** | Creates calendar events and Google Meet links from the Proposals page. |
| **Google Calendar ID** | Target calendar for meetings (default: `primary`). |

For every API key you can:

- Paste a new key and click **Save**.
- Click **Test** to verify the new key before saving.
- Click **Test Stored** to verify the currently saved key.
- Click **Remove** to delete the stored credential.

> **Validation:** API keys are sanitized before storage. Only printable ASCII characters (33–126) are accepted; leading/trailing whitespace, control characters, and non-ASCII characters are rejected. If a key is rejected, re-enter it without extra spaces or special characters.

### Google Calendar test

Click the **Test** button in the **Google Calendar Service Account** section to verify that the service account can create a test event on the configured calendar.

### Danger Zone

The **Danger Zone** at the bottom of the Settings page contains **Wipe All Enrichment & Outreach Data**. Use this with caution; it permanently removes enrichment, outreach, reply, and proposal data from the workspace.

### Theme

Use the **Theme Toggle** in the sidebar header to switch between light and dark mode.

---

## 12. Email Delivery Tracking

Every email sent through ZeptoMail is tracked end to end.

- When an email is approved and sent, ZeptoMail returns a `request_id`. The app stores this as `zeptomail_message_id` on the email record.
- ZeptoMail delivery webhooks (`/webhooks/zeptomail`) update the email status as the recipient interacts with it:
  - **Sent** — the API accepted the email.
  - **Delivered** — accepted by the recipient's mail server.
  - **Opened** — the recipient opened the email.
  - **Clicked** — the recipient clicked a link.
  - **Bounced** — hard or soft bounce (invalid address, full mailbox, etc.).
  - **Failed** — the send itself failed.

The app matches webhooks using the `client_reference` (the email record ID) and the `email_reference` / `request_id` returned by ZeptoMail. These statuses power the Analytics email table and the Outreach timeline.

---

## 13. Quick Tips

- **Start small** — Enrich 5–10 universities first to see how the AI personalizes emails before scaling up.
- **Review approvals carefully** — All emails must be approved before sending. A quick human edit can significantly improve open and reply rates.
- **Check Analytics weekly** — Use funnel, reply, and email delivery data to understand what messaging resonates.
- **Keep API keys fresh** — If enrichment or sending suddenly stops, check Settings for expired or invalid keys.
- **Use UGC and INI sync** — The fastest way to populate your database is with **Sync All UGC Universities** and **Sync IITs / NITs / IIITs**.
- **Tag stakeholders** — Ensure key contacts (Vice Chancellor, Registrar) are discovered before starting outreach; sequences cannot begin without a target email.
- **Use Skip wisely** — If a university is not a good fit, skip it rather than leaving it in the pipeline.
- **Confirm meetings in Proposals** — A `meeting_request` reply creates a draft proposal; a human must pick the date and time before a Google Meet link is created.

---

## Need Help?

If a feature is not working as expected:

1. **Check Settings** — Ensure all required API keys are valid and have active quotas.
2. **Check Analytics** — Look for bounced emails or failed enrichments.
3. **Check Approvals** — Make sure pending drafts are not stuck awaiting review.
4. **Check Outreach** — Review unclassified replies that may need manual attention.
5. **Check the University detail view** — Verify the university has a discovered website and at least one stakeholder with an email before running outreach.
6. **Check reply/thread matching** — If a reply is not auto-processed, confirm it was sent in reply to a tracked email and that the sender address matches a known stakeholder.

> **Still stuck?** Capture any error messages from the browser console and share them with your team.

---

## More Documentation

- [Project README](../README.md)
- [Codebase map](../CODEBASE.md)
- [Quick user guide](../user-guide-lite.md)
- [Implementation plan](../docs/PLAN.md)
- [Requirements](../docs/Requirement.md)
- [Roadmap](../docs/roadmap.md)
- [Design system](../design-system/onboardingai/MASTER.md)
