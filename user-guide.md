# OnboardingAI — User Guide

> **One-liner:** OnboardingAI is an AI-powered outreach platform that discovers Indian universities, enriches them with research signals, and automates personalized email sequences to book meetings for Fretbox.

---

## 1. Quick Start (5 Minutes)

1. **Sign Up / Sign In** — Open the app URL and create or sign in to your account.
2. **Add API Keys** — Go to **Settings → API Keys** and add:
   - **Gemini API Key** — Powers AI enrichment and email personalization.
   - **Serper API Key** — Discovers and validates university websites.
   - **SendGrid API Key** — Sends emails and tracks delivery.
   - **SendGrid From Email** — The sender address for all outreach.
   - *(Optional)* **Google Calendar Service Account** — Enables calendar events and Meet links from proposals.
3. **Seed Universities** — Go to **Universities** and click **Sync UGC** to import the latest government-recognized Indian university dataset.
4. **Enrich** — Select 5–10 universities on the **Enrichment** page and click **Run Deep Enrichment**.
5. **Start Outreach** — On the **Outreach** page, pick a university in *Ready to Sequence* and click **Start Sequence**.

> **Tip:** Each API key can be saved, tested, and removed independently from the Settings page.

---

## 2. Dashboard Navigation

The left sidebar is organized into three sections:

- **CORE**
  - **Universities** — Browse, search, and manage your university list
  - **Enrichment** — Run AI enrichment on universities
- **PIPELINE**
  - **Analytics** — View funnel metrics and email performance
  - **Outreach** — Manage sequences and monitor replies
  - **Proposals** — Generate and send AI-powered PDF proposals
  - **Approvals** — Review and approve pending emails before they are sent
- **SYSTEM**
  - **Settings** — Configure API keys and system preferences

Badges on **Outreach** and **Approvals** show the count of unclassified replies and pending emails awaiting your review.

---

## 3. Universities

### Browse the List
The **Universities** page shows all universities in your database. Use the tabs at the top to filter by type: *All*, *Central*, *State*, *Private*, *Deemed*, or *Other*.

### Search
Type at least two characters in the search bar to find universities by name. Results update automatically after you stop typing.

### Upload Universities via CSV
1. Click **Upload CSV**.
2. Select a CSV with at least a `university_name` column.

**Supported columns:**

| Column | Required | Example |
|--------|----------|---------|
| `university_name` | Yes | "Delhi University" |
| `state` | No | "Delhi" |
| `city` | No | "New Delhi" |
| `website` | No | "https://du.ac.in" |
| `student_count` | No | 70000 |
| `type` | No | "Public", "Private", "Deemed", "Central", "State" |
| `naac_grade` | No | "A++", "A+", "A", "B" |

> **Aliases accepted:** The parser also recognizes `Name`, `University`, `State`, `City`, `Website`, `Students`, `Type`, and `NAAC` as alternative headers.
>
> **Edge case:** Duplicate `university_name` entries are skipped during upload.

### Sync from UGC
Click **Sync UGC** to fetch the latest full Indian university dataset from UGC.gov.in. This is the fastest way to seed your database with government-recognized institutions.

### Validate Websites
Click **Validate Websites** to run automated website verification across your database. This checks which universities have valid, discoverable, or invalid websites.

### University Detail View
Click any university card to open a detail panel. Here you can:
- View and edit basic information
- See discovered stakeholders (Vice Chancellor, Registrar, etc.)
- View enrichment signals (news, LinkedIn, website content)
- Check the current **Outreach Stage** and **Lead Tier**
- Manually trigger **Deep Enrich (AISHE + Social)** to run the full enrichment chain on that university

---

## 4. Enrichment

Enrichment is the process of using AI to research a university and extract valuable signals.

### What Enrichment Does
For each selected university, the AI:

| Step | What Happens |
|------|--------------|
| **Discovery** | Finds and validates the official website |
| **Scraping** | Extracts hostel, student, and administration data |
| **Signals** | Searches recent news and LinkedIn activity |
| **Demographics** | Extracts hostelite counts, NAAC grade, student scale |
| **Scoring** | Generates a **Priority Score** based on Fretbox fit |

### How to Run Enrichment
1. Go to **Enrichment**.
2. In the **New** section, select universities via checkboxes.
3. Click **Run Deep Enrichment**.
4. Watch status indicators; completed items move to **Enriched**.

> **Tip:** Batch-process up to 10 universities at once. The AI personalizes better when it has more context about each institution.
>
> **Example output:** After enrichment, a university card may show signals like *"70,000+ students, 12 hostels, NAAC A++"* and a priority score of 85/100.

---

## 5. Outreach

The **Outreach** page is a Kanban-style pipeline that tracks where each university sits in your sales process.

### Pipeline Stages
| Stage | Meaning |
|-------|---------|
| **Ready to Sequence** | Enriched and ready for outreach |
| **Outreach Active** | Emails are being sent automatically |
| **Replied** | A stakeholder has replied |
| **Meeting Booked** | A meeting has been scheduled |
| **Proposal Sent** | A proposal has been delivered |
| **Closed** | Won or archived |
| **Not Interested** | The contact opted out or declined |
| **Skipped** | Manually excluded from outreach |

### Starting a Sequence
1. Find a university in **Ready to Sequence**.
2. Click it to view details.
3. Click **🚀 Begin Sequence**.
4. The AI drafts a personalized email and places it in the **Approvals** queue for human review before sending.

> **Example:** The AI might draft: *"Hi Dr. Sharma, I noticed Delhi University serves 70,000+ students across 12 hostels. Fretbox helps institutions like yours reduce inventory loss by 30%..."*

### Reverting a Stage
Each pipeline card has a **↩️ Move back a step** button if you need to rewind a university to the previous stage (e.g., move from *Replied* back to *Outreach Active*).

### Managing Replies
When a stakeholder replies, the system auto-classifies:

| Classification | Action |
|----------------|--------|
| `meeting_request` | Stakeholder wants to schedule a call |
| `positive_interest` | Interested; follow up |
| `request_info` | Asking for more details |
| `not_interested` / `opt_out` | Stop outreach |
| `out_of_office` | Temporary absence; retry later |

Unread or unclassified replies show a badge on the **Outreach** sidebar item.

### Auto-Replies
For `meeting_request` and `positive_interest` replies, the system automatically sends a polite response and proposes meeting times. This happens immediately after classification without manual intervention.

---

## 6. Approvals

All AI-drafted emails land here for human review before they are sent. This is a mandatory Human-in-the-Loop (HITL) gate.

### Reviewing an Email
1. Go to **Approvals**.
2. Each card shows the recipient, subject, and body.
3. Choose an action:

| Action | Result |
|--------|--------|
| **Approve & Send** | Dispatches immediately via SendGrid |
| **Edit** | Modify subject or body, then approve |
| **Reject** | Deletes the draft permanently |

### Bulk Approve
If you have multiple pending drafts, click **Approve All** to send them all at once.

> **Tip:** A quick human edit — like mentioning a recent university award — can significantly improve open rates.
>
> **Edge case:** If SendGrid returns a bounce after approval, the email status updates to **Failed** and appears in Analytics.

---

## 7. Proposals

Proposals are AI-generated PDF documents tailored to each university.

### Generating a Proposal
1. Go to **Proposals**.
2. Click **Generate Proposal**.
3. Select a **university**. You may also select a **stakeholder** to personalize the addressee (optional).
4. The AI produces a structured PDF containing:
   - Executive summary
   - Problem statement
   - Solution overview
   - Key benefits
   - ROI summary
   - Next steps

> **Example:** A proposal for a large public university might highlight the *Hostel Inventory* and *Mess Management* modules based on scraped signals showing 12 hostels and a central mess.

### Viewing & Sending
- **Preview & Send** — Preview the generated document inline, edit content if needed, and send.
- **Regenerate Content** — If the PDF fails to generate, click to retry.

### Google Calendar Integration
If configured in Settings, you can create a Google Calendar event with a Google Meet link directly from a proposal. Meeting details are stored with the proposal for reference.

> **Edge case:** Proposals require at least one enriched university. If no stakeholders exist for the selected university, the proposal will be generically addressed.

---

## 8. Analytics

The **Analytics** page gives you a high-level view of your pipeline performance.

### Funnel Chart
A visual bar chart shows how many universities are at each stage:

```
Total → Enriched → Outreach Active → Replied → Meeting Booked → Proposal Sent → Closed / Won
```

### Email Performance
Track delivery metrics for each sequence step (Steps 1–4):

| Metric | What It Tells You |
|--------|-------------------|
| **Sent** | Emails dispatched |
| **Opened** | Recipients opened the email |
| **Open Rate** | Percentage of sent emails that were opened |
| **Clicked** | Recipients clicked a link |
| **Bounced** | Invalid email address or mailbox full |

### Reply Intent Breakdown
A grid of classification cards shows how stakeholders have responded and the percentage of total replies each represents.

| Classification | Typical Follow-Up |
|---------------|-----------------|
| `meeting_request` | Schedule via Google Calendar |
| `positive_interest` | Continue sequence or send proposal |
| `request_info` | Send FAQ or module details |
| `not_interested` / `opt_out` | Stop outreach; move to *Not Interested* |
| `out_of_office` | Retry follow-up later |

> **Example:** If 40% of replies are `request_info`, consider adding a detailed FAQ to your intro email to reduce back-and-forth.

---

## 9. Settings

The **Settings** page is where you configure API integrations and credentials.

### API Keys
Add, test, and remove keys for the following services. Each shows a **status indicator** (configured / not configured).

| Service | What It Powers |
|---------|----------------|
| **Google Gemini** | AI reasoning, reply classification, proposal generation |
| **Serper** | Google Search, news, and image discovery during enrichment |
| **Firecrawl** | Deep web crawling, sitemap discovery, contact extraction |
| **SendGrid** | Sending transactional emails and outreach sequences |
| **SendGrid From Email** | Verified sender address for all outbound emails (default: `outreach@fretbox.in`) |

> **Edge case:** If a key shows as valid but features still fail, check that the corresponding service account has active credits or permissions.

### Google Calendar Integration
| Setting | Purpose |
|---------|---------|
| **Service Account JSON** | Google Cloud service account key for creating calendar events and Google Meet links |
| **Calendar ID** | Target calendar for meetings. Use `primary` or a specific calendar ID |

### Theme
Use the **Theme Toggle** in the sidebar header (next to the logo) to switch between light and dark mode.

---

## 10. Quick Tips

- **Start small** — Enrich 5–10 universities first to see how the AI personalizes emails before scaling up.
- **Review approvals carefully** — All emails must be approved before sending. A quick human edit can significantly improve open rates.
- **Check Analytics weekly** — Use funnel and reply data to understand what messaging resonates.
- **Keep API keys fresh** — If enrichment or sending suddenly stops, check Settings for expired or invalid keys.
- **Use UGC Sync** — The fastest way to populate your database with Indian government-recognized institutions.
- **Tag stakeholders** — Ensure key contacts (Vice Chancellor, Registrar) are discovered before starting outreach; sequences cannot start without a target email.
- **Use skipped wisely** — If a university is not a good fit, move it to *Skipped* rather than leaving it in the pipeline.

---

## Need Help?

If a feature is not working as expected:

1. **Check Settings** — Ensure all required API keys are valid and have active quotas.
2. **Check Analytics** — Look for bounced emails or failed enrichments.
3. **Check Outreach** — Review unclassified replies that may need manual attention.
4. **Check the university detail view** — Verify the university has a discovered website and at least one stakeholder before running enrichment or outreach.

> **Still stuck?** Capture any error messages from the browser console and share them with your team.
