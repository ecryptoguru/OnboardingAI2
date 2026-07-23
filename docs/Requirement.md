# Outreach AI for Fretbox

## Functional Requirements

1. Get list of universities from UGC dataset / CSV upload.
2. Find their relevant websites.
3. Find student demographics (preferably male/female split and hostelites/day scholars) from NIRF, AISHE, NAAC, and mandatory disclosures.
4. Scan websites for key stakeholder data with name, designation, and preferably email, phone, LinkedIn:
   Owner / President / Chairman / Chancellor / Vice Chancellor / Pro Vice Chancellor / Registrar / Dy Registrar / Dean Student Welfare / Dean Student Affairs / Director Administration / Chief Warden / Controller of Examinations / Finance Officer / Librarian / Placement Officer / Public Relations Officer.
5. Find relevant profiles/signals on LinkedIn / news / Google Images.
6. Send an introduction email.
7. Send follow-up emails.
8. Auto-reply to inbound replies based on classification.
9. Fix meeting via Google Calendar/Meet integration.
10. Generate and send AI proposals.
11. Support proposal statuses: `draft`, `ready`, `sent`, `meeting_confirmed`, `cancelled`.
12. **Password Reset**: Users can request a password reset code via email, then set a new password using the code. Reset codes expire after a configurable time (default 1 hour).

## Non-Functional / Security Requirements

- **Authentication:** All public user-facing Convex actions must authenticate the user via `validateAuth(ctx)`.
- **Internalization:** Scheduler, cron, webhook, and test-only actions must be `internalAction` and called via `internal.actions.*`.
- **HTTP Security:** Webhook endpoints must verify HMAC signatures or bearer tokens; test endpoints must be disabled by default and require `DISABLE_TEST_ENDPOINTS=false` plus `TEST_WEBHOOK_SECRET`.
- **API Key Hygiene:** API keys stored in `systemSettings` must be validated with `sanitizeApiKey()` before storage (printable ASCII 33–126 only).
- **Idempotency:** Confirming a meeting for the same time slot should be idempotent; cancelling a meeting should update both the calendar event and the proposal status.
- **Analytics Accuracy:** Funnel counts must use full queries (`collect()`) so totals and stage counts are accurate.
- **Type Safety:** Avoid circular type inference in actions; use `do*` helper functions with explicit return types where needed.
