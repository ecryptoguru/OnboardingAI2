# Fretbox Outreach AI v2 — Client Onboarding Guide (megaplan)

This guide walks the client team through first-time setup and daily use. It is
**doc-only** — accounts are created by the client following the steps below.

Companion docs: `user-guide.md` / `user-guide-lite.md` (end-user flows),
`docs/runbook.md` (operations), `docs/PRODUCTION_READINESS.md` (verification
report).

---

## 1. Access the app

- Production URL: **https://onboardingai2.vercel.app**
- Backend/DB/emails: Fretbox-operated Convex + ZeptoMail (no client setup needed)

## 2. Create accounts

1. Open **Sign up** (link on the sign-in page).
2. Create one account per operator (email + password ≥ 8 chars).
3. **Tell Fretbox the operator emails.** Fretbox sets `ADMIN_EMAILS` on the
   backend so admins get access to data-reset/cleanup operations. Until that is
   set, the app runs in a permissive mode where every signed-up user is treated
   as an admin — Fretbox will lock this down as part of handover.

## 3. First-run checklist

- [ ] Sign in → you land on the **Universities** dashboard.
- [ ] **Settings → API Keys**: verify Google Gemini, Serper, Firecrawl, and
      ZeptoMail keys are populated (Fretbox pre-configures these; do not
      overwrite unless replacing a key).
- [ ] **Universities** page → **Sync IITs / NITs / IIITs** to load/refresh the 80
      curated Institutes of National Importance (INI) seed.
- [ ] Optional: upload a CSV (Universities → Upload CSV) or run **Sync UGC** to
      add more institutions.

## 4. Core workflows (quick map)

| Goal | Where |
| --- | --- |
| Discover + enrich a university (websites, VCs, Registrars, demographics, scores) | Universities → pick a university → run enrichment (Fretbox can also schedule batches) |
| Send AI-personalized outreach | Outreach → **Begin Sequence** on an enriched university |
| Review AI drafts before sending (HITL) | **Approvals** page → Approve & Send / Reject / Edit |
| Send a document (.docx) to one or many recipients | Outreach → **Document Mailer** |
| Reply to inbound email / simulate a reply | Outreach → Replies panel → Simulate Reply (real replies arrive once webhooks are enabled) |
| Generate partnership proposals | **Proposals** → Generate Proposal → Preview & Send |
| Confirm meetings | Proposals → Confirm Meeting (needs Google Calendar setup — see §6) |
| Track pipeline | **Analytics** + Outreach kanban |

## 5. Daily operations notes

- **Emails are human-approved before sending** — the AI never sends without an
  Approve click. Keep an eye on the Approvals page (badge shows pending count).
- **Provider alerts**: if Gemini/Firecrawl/Serper hit quota limits, a modal
  appears in the dashboard. Contact Fretbox to raise limits or swap keys.
- **Reply handling**: inbound replies are classified by AI (meeting request /
  positive / not interested / opt-out…). Meeting requests create a draft
  proposal for human confirmation — nothing is auto-booked.

## 6. Items Fretbox will enable at handover (client action may be needed)

| Item | Why | Who does it |
| --- | --- | --- |
| `ADMIN_EMAILS` | Locks admin-only operations to listed emails | Fretbox (needs operator emails from client) |
| ZeptoMail webhooks (delivery tracking + inbound replies) | Email statuses (`sent → delivered → opened`) and real inbound replies | Fretbox generates secrets; client pastes webhook URLs/secrets into ZeptoMail (steps in `docs/runbook.md` §3) |
| Google Calendar service account | "Confirm Meeting" creates real calendar events + Meet links | Client provides a Google Workspace service account (or Fretbox sets one up); steps in `docs/runbook.md` §4 |
| Sentry DSN | Error monitoring dashboards | Fretbox |
| Daily backups | RPO 1 day | Fretbox (schedule) |

## 7. Support & escalation

- Product/ops questions: Fretbox team (contact via the handover contact).
- Incidents (emails failing, enrichment stuck, auth issues): see
  `docs/runbook.md` §7 — Fretbox escalation first, client operator second.

---

*Document end — companion to `user-guide.md` and `user-guide-lite.md`.*
