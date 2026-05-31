# OnboardingAI — User Guide

A step-by-step guide for new users to navigate and use the Fretbox Outreach AI platform.

---

## 1. Getting Started

### Sign In
Open the app URL and sign in with your email and password. If you do not have an account, use the **Sign Up** page to create one.

### First-Time Setup
Before using any AI-powered features, go to **Settings** and add your API keys:

| Key | Why You Need It |
|-----|-----------------|
| **Gemini API Key** | Powers AI enrichment, scoring, personalization, and proposals |
| **Serper API Key** | Discovers and validates university websites |
| **SendGrid API Key** | Sends emails and tracks delivery |
| **SendGrid From Email** | The sender address for all outreach emails |

> **Tip:** Each key can be saved, tested, and removed independently from the Settings page.

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
  - **Settings** — Configure API keys, toggles, and system preferences

Badges on **Outreach** and **Approvals** show the count of unclassified replies and pending emails awaiting your review.

---

## 3. Universities

### Browse the List
The **Universities** page shows all universities in your database. Use the tabs at the top to filter by type (e.g., *Public*, *Private*, *Deemed*, *Central*, *State*, or *All*).

### Search
Type at least two characters in the search bar to find universities by name. Results update automatically after you stop typing.

### Upload Universities via CSV
1. Click **Upload CSV**.
2. Select a CSV file with at least a `university_name` column.
3. Optional columns include `state`, `city`, `website`, `address`, `type`, `naac_grade`, `established_year`, and `notes`.
4. The system will ingest the file and create university records in bulk.

### Sync from UGC
Click **Sync UGC** to fetch the latest Indian university dataset from UGC.gov.in. This is useful for seeding your database with government-recognized institutions.

### University Detail View
Click any university card to open a detail panel. Here you can:
- View and edit basic information
- See discovered stakeholders (Vice Chancellor, Registrar, etc.)
- View enrichment signals (news, LinkedIn, website content)
- Check the current **Outreach Stage** and **Lead Tier**
- Manually trigger discovery or enrichment actions

---

## 4. Enrichment

Enrichment is the process of using AI to research a university and extract valuable signals.

### What Enrichment Does
For each selected university, the AI will:
- Discover and validate the official website
- Scrape key pages for hostel, student, and administration data
- Search for recent news and LinkedIn activity
- Extract demographic signals (hostelite counts, NAAC grades, student scale)
- Generate a **Priority Score** based on Fretbox-relevant factors

### How to Run Enrichment
1. Go to the **Enrichment** page.
2. In the **New** section, select universities using the checkboxes.
3. Click **Run Deep Enrichment**.
4. The selected universities move to the **Enriched** section when complete.

> **Tip:** You can select multiple universities at once to batch-process them.

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
| **Not Interested** | The contact opted out or declined |

### Starting a Sequence
1. Find a university in **Ready to Sequence**.
2. Click it to view details.
3. Click **Start Sequence**.
4. The AI will draft a personalized email. Depending on your settings, it may go directly to the **Approvals** queue or be sent immediately.

### Managing Replies
When a stakeholder replies, the email is automatically classified:
- `meeting_request` — They want to schedule a call
- `positive_interest` — Interested, follow up
- `request_info` — Asking for more details
- `not_interested` / `opt_out` — Stop outreach
- `out_of_office` — Temporary absence

Unread / unclassified replies are flagged with a badge on the Outreach sidebar item.

### Auto-Replies
For `meeting_request` and `positive_interest` replies, the system can automatically send a polite response and propose meeting times. This is configured in **Settings**.

---

## 6. Approvals

If your system is set to require approval before sending, drafted emails land here.

### Reviewing an Email
1. Go to **Approvals**.
2. Each card shows the recipient, subject, and body.
3. You can:
   - **Approve & Send** — Dispatches immediately via SendGrid
   - **Edit** — Modify the subject or body, then approve
   - **Reject** — Deletes the draft

> **Tip:** Editing is useful for adding a personal touch before the email goes out.

---

## 7. Proposals

Proposals are AI-generated PDF documents tailored to each university.

### Generating a Proposal
1. Go to **Proposals**.
2. Click **Generate Proposal**.
3. Select a university and a primary stakeholder.
4. The AI will:
   - Analyze the university's signals and demographics
   - Recommend relevant Fretbox modules
   - Produce a structured proposal with executive summary, problem statement, solution overview, key benefits, ROI summary, and next steps

### Viewing & Sending
- Click **View PDF** to preview the generated document.
- Click **Send** to deliver the proposal via email to the stakeholder.

### Google Calendar Integration
If configured, you can create a Google Calendar event with a Google Meet link directly from a proposal. The meeting details are stored alongside the proposal for easy reference.

---

## 8. Analytics

The **Analytics** page gives you a high-level view of your pipeline performance.

### Funnel Chart
A visual bar chart shows how many universities are at each stage:
Total → Enriched → Outreach Active → Replied → Meeting Booked → Proposal Sent → Closed / Won

### Email Performance
Track delivery metrics across your outreach steps:
- Sent, Delivered, Opened, Clicked, Bounced, Failed

### Reply Classifications
A summary of how stakeholders have responded:
- How many requested meetings
- How many showed positive interest
- How many opted out

Use this data to refine your outreach strategy.

---

## 9. Settings

The **Settings** page is where you control the platform.

### API Keys
Add, test, and remove keys for Gemini, Serper, SendGrid, and Firecrawl. Each key has a status indicator so you know if it is working.

### Enrichment Toggles
- Enable or disable specific enrichment sources (news, LinkedIn, website scraping, image analysis)
- Adjust how aggressively the system fetches external data

### Outreach Controls
- Require approval before sending emails
- Enable or disable auto-replies for positive interests and meeting requests

### Theme
Use the **Theme Toggle** in the top-right corner to switch between light and dark mode.

---

## 10. Quick Tips

- **Start small:** Enrich 5–10 universities first to see how the AI personalizes emails before scaling up.
- **Review approvals carefully:** The AI is good, but a quick human edit can significantly improve open rates.
- **Check Analytics weekly:** Use the funnel and reply classifications to understand what messaging resonates.
- **Keep API keys fresh:** If enrichment or sending suddenly stops, check the Settings page for expired or invalid keys.
- **Use UGC Sync:** If you are targeting Indian universities, the UGC sync is the fastest way to populate your database.

---

## Need Help?

If a feature is not working as expected:
1. Check **Settings** to ensure all required API keys are valid.
2. Check the **Analytics** page for error indicators (bounced emails, failed enrichments).
3. Review the **Outreach** page for unclassified replies that may need manual attention.
