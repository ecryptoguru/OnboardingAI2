# Real-World Test Plan — Fretbox Outreach AI

This document outlines how to verify every stage of the Outreach AI pipeline
using real external services and real data.

---

## Automated Tests

### 1. Unit Tests (Fast, No External Calls)

```bash
npm run test:unit
```

Covers:
- Email template rendering (`tests/unit/emailTemplates.test.ts`)
- Scoring algorithm (`tests/unit/scoring.test.ts`)
- Stakeholder deduplication (`tests/unit/stakeholders.test.ts`)
- Webhook security parsing (`tests/unit/webhookSecurity.test.ts`)
- **NEW:** Cadence math (`tests/unit/cadence.test.ts`)
- **NEW:** Reply classifier validation (`tests/unit/replyClassifier.test.ts`)

### 2. Playwright E2E (UI Smoke Tests)

```bash
npm test
```

Covers:
- Home page load (`tests/smoke.spec.ts`)
- Dashboard routing (`tests/e2e/dashboard.spec.ts`)
- API proxy health (`tests/thorough.spec.ts`)
- **NEW:** Approvals page rendering (`tests/e2e/approvals.spec.ts`)

### 3. Full Pipeline Integration Test (Real APIs, Real DB)

```bash
# Terminal 1 — start the dev server
npm run dev

# Terminal 2 — run the test (uses real Gemini + Serper APIs)
./scripts/run-pipeline-test.sh "Anna University" "Tamil Nadu"
```

Or via curl directly:

```bash
curl -X POST http://localhost:3001/api/test/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"universityName":"Anna University","state":"Tamil Nadu","stages":["ingestion","discovery","scraper","enrichment","scoring","outreach","reply","proposal"]}'
```

**What it verifies:**

| Stage | Verified Behaviour | External Service |
|---|---|---|
| Ingestion | University created or reused | — |
| Discovery | Website discovered via Serper | Serper.dev |
| Scraper | Stakeholders extracted from site | Jina AI + Gemini |
| Enrichment | LinkedIn, news, images found | Serper.dev + Gemini |
| Deep Enrichment | Demographics & NIRF data | Gemini |
| Scoring | AI + deterministic score computed | Gemini |
| Outreach | Sequence enrolled, email drafted as `pending_approval` | — |
| Reply | Simulated reply classified, auto-reply drafted | Gemini |
| Proposal | Proposal JSON generated | Gemini |

**Cost estimate:** ~3-5 Gemini API calls (~$0.01-0.03) + ~3 Serper calls.

---

## Manual Verification Checklist

Use this checklist after running the automated pipeline test to confirm
real-world behaviour that cannot be fully automated.

### SendGrid Email Delivery

- [ ] `SENDGRID_API_KEY` is configured in Convex environment variables.
- [ ] `SENDGRID_FROM_EMAIL` is set (e.g. `outreach@fretbox.in`).
- [ ] SendGrid webhook URL `/webhooks/sendgrid` is configured in SendGrid dashboard.
- [ ] SendGrid webhook secret (`SENDGRID_WEBHOOK_SECRET`) is set for signature verification.
- [ ] **Test:** Approve one pending email from the dashboard. Verify SendGrid accepts it (HTTP 202).
- [ ] **Test:** Verify delivery status updates in the DB after SendGrid webhook fires.

### Inbound Reply Handling

- [ ] `EMAIL_WEBHOOK_SECRET` is configured in Convex environment variables.
- [ ] Reply webhook URL `/webhooks/email-reply` is reachable from the email provider.
- [ ] **Test:** Send a test reply to a sent email. Verify the reply appears in the Replies table with correct classification.
- [ ] **Test:** Verify thread resolution works (Message-ID lookup + sender email fallback).

### HITL Approval Flow

- [ ] Navigate to `/dashboard/approvals`.
- [ ] Verify pending emails are listed with university, stakeholder, and step info.
- [ ] **Test:** Click "Edit" on a draft, modify subject/body, save.
- [ ] **Test:** Click "Approve & Send" — verify email status changes to `sent` and sequence advances.
- [ ] **Test:** Click "Reject" — verify status changes to `failed` and sequence pauses.
- [ ] **Test:** Click "Approve All" bulk button — verify all pending emails are processed.

### Proposal & Meeting Booking

- [ ] Google Calendar / Meet integration credentials are configured (if using).
- [ ] **Test:** After a `meeting_request` classification, verify a draft proposal is created with `calendar_event_status: "pending"`.
- [ ] **Test:** Manually set a meeting date in the proposal and trigger proposal generation. Verify status becomes `ready`.
- [ ] **Test:** Send the proposal via email. Verify status becomes `sent` and university stage updates to `proposal_sent`.

### UGC Sync

- [ ] UGC sync proxy endpoint `/api/sync-ugc` returns valid JSON (not 500).
- [ ] **Test:** Trigger UGC sync from dashboard. Verify universities are inserted/updated.
- [ ] **Test:** Verify `ugc_status` and `website` fields are populated for synced records.

### Rate Limiting

- [ ] **Test:** Rapidly trigger the same SendGrid destination multiple times. Verify rate limiting blocks excessive sends.
- [ ] **Test:** Rapidly sync UGC. Verify UGC sync rate limit kicks in after 5 attempts in 5 minutes.

### Environment Variables

Ensure these are set in your Convex project:

| Variable | Used By | Test Command |
|---|---|---|
| `GEMINI_API_KEY` | Scraper, Scoring, Enrichment, Proposal | Pipeline test |
| `SERPER_API_KEY` | Discovery, Enrichment | Pipeline test |
| `SENDGRID_API_KEY` | Email sending | Approve one email |
| `SENDGRID_FROM_EMAIL` | Email sender identity | Approve one email |
| `SENDGRID_WEBHOOK_SECRET` | Webhook signature verification | Optional |
| `EMAIL_WEBHOOK_SECRET` | Inbound reply auth | Optional |
| `DEV_AUTH_BYPASS_SECRET` | Local dev auth bypass | `npm run dev` |

---

## Interpreting Pipeline Test Results

A successful run returns JSON like:

```json
{
  "success": true,
  "universityName": "Anna University",
  "stages": {
    "ingestion": { "status": "created", "id": "k3j4h5..." },
    "discovery": { "status": "success", "website": "https://www.annauniv.edu" },
    "scraper": { "success": true },
    "enrichment": { "success": true, "signalsAdded": 4 },
    "deep_enrichment": { "success": true },
    "scoring": { "success": true, "final_score": 72, "lead_tier": "High" },
    "outreach": { "sequenceId": "...", "pendingEmails": 1, "hasStep1Draft": true },
    "reply": { "classification": "meeting_request", "autoReplyExists": true },
    "proposal": { "status": "ready", "hasJson": true }
  }
}
```

If any stage fails, inspect the `error` field and check Convex logs for that action.

---

## Running Against Different Universities

Recommended test universities (public, well-known, high signal):

| University | State | Expected Outcome |
|---|---|---|
| Anna University | Tamil Nadu | Strong website, many stakeholders |
| IIT Bombay | Maharashtra | High score, clear domain |
| BITS Pilani | Rajasthan | Private, strong digital presence |
| Delhi University | Delhi | Large scale, public |

---

## Cleanup

To remove test artifacts after verification:

1. Delete the test university from the Convex dashboard.
2. Or re-run the pipeline test with `"cleanup": true`:

```bash
curl -X POST http://localhost:3001/api/test/run-pipeline \
  -H "Content-Type: application/json" \
  -d '{"universityName":"Anna University","cleanup":true}'
```
