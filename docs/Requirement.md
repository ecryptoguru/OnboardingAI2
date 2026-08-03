# Outreach AI for Fretbox — Requirements

## Functional Requirements

### University Data

1. **Ingestion** — Universities can be loaded from three sources:
   - CSV upload (drag-and-drop or file picker) parsed by `convex/actions/ingest.ts`.
   - UGC.gov.in sync via the `/api/sync-ugc` proxy and `convex/actions/ugcSync.ts`.
   - Curated INI seed for a known baseline set.
2. **CRUD & Search** — List, search, filter, paginate, and view university details including state, city, type, category, NAAC grade, and UGC status.
3. **Website Discovery** — Discover and validate official websites using Serper search, `fetch()`/`HEAD` validation, Jina Reader fallback, and candidate ranking with owned-domain and education-TLD heuristics.
4. **Data Source Tracking** — Track `data_source` (`ugc`, `curated`, `csv`, `manual`) and `website_status` (`pending`, `valid`, `invalid`, `discovered`, `discovered_weak`).

### Enrichment

5. **Stakeholder Extraction** — Scan university websites for decision-makers and contacts:
   - Owner / President / Chairman / Chancellor / Vice Chancellor / Pro Vice Chancellor
   - Registrar / Deputy Registrar / Dean Student Welfare / Dean Student Affairs
   - Director Administration / Chief Warden / Controller of Examinations
   - Finance Officer / Librarian / Placement Officer / Public Relations Officer
   - Extraction sources: Firecrawl, Jina Reader, `fetch()` HTML parse, regex fallback, anti-ragging pages, and role-based email inference.
6. **Demographics** — Extract student population data including male/female split and hostelites/day-scholars from NIRF, AISHE, NAAC SSR, and mandatory disclosure PDFs. Track `data_quality` (`verified`, `partial`, `inferred`).
7. **Signals** — Discover and store news, LinkedIn, website, and image signals. Embed signals with `gemini-embedding-001` (768-dim) for vector search and proposal RAG.
8. **Scoring** — Compute a deterministic score, an AI score from Gemini, and a weighted final composite. Surface hostelite, student scale, NAAC, agility, stakeholder, and digital signal factors.
9. **Orchestrated Chain** — Run the full enrichment pipeline in strict phase order via `convex/actions/orchestrator.ts`.

### Outreach

10. **Sequences** — Create and manage multi-step outreach sequences with configurable steps, cadence, and status (`active`, `paused`, `completed`, `opted_out`).
11. **HITL Approval** — Draft emails as `pending_approval`; human review is required before sending. Approvals are surfaced on the **Approvals** dashboard page.
12. **Email Dispatch** — Send approved emails via ZeptoMail REST API with retry logic and delivery tracking (`queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`).
13. **Personalization** — Generate personalized email copy with Gemini, using university-specific signals and sanitizing inputs/outputs.
14. **Inbound Replies** — Receive replies via the ZeptoMail inbound webhook on `*.convex.site`, store raw replies, and classify them.
15. **Reply Classification** — Classify replies into `meeting_request`, `positive_interest`, `request_info`, `not_interested`, `opt_out`, `out_of_office`, `other`. Low-confidence high-stakes classifications (`meeting_request`, `positive_interest` with confidence < 0.85) require human review.
16. **Auto-Replies** — Automatically send configured replies for positive interest and meeting requests when confidence is high.

### Proposals

17. **AI Proposal Generation** — Generate structured proposals from university signals and vector search. Output rich HTML; proposals are emailed directly as HTML and no PDF is generated.
18. **Google Calendar / Meet** — Confirm meetings to create Google Calendar events with Meet links; update proposal status to `meeting_confirmed`. Cancel meetings to remove calendar events and update status to `cancelled`.
19. **Proposal Statuses** — Support `draft`, `ready`, `sent`, `meeting_confirmed`, `cancelled`.
20. **Proposal Delivery** — Email generated proposals to stakeholders from the **Proposals** dashboard.

### Dashboard & Settings

21. **Pages** — Provide real-time dashboard pages:
   - **Universities** — list, upload, sync, search, detail
   - **Enrichment** — enrichment status and signals
   - **Outreach** — sequences, reply inbox, email thread viewer, demo
   - **Approvals** — pending email approval queue
   - **Proposals** — generated rich HTML proposals, meeting actions
   - **Analytics** — pipeline KPIs and funnel stats
   - **Settings** — API keys, sender details, enrichment controls
22. **Settings — API Key Management** — Store and XOR-obfuscate keys for Google Gemini, Serper, Firecrawl, ZeptoMail, Google Calendar service account, and calendar ID. Provide test buttons and status indicators.
23. **Authentication** — Email/password auth via Convex Native Auth with sign-in, sign-up, sign-out, and password reset (`/forgot-password`, `/reset-password`). Reset codes expire after one hour.
24. **Theming** — Support light/dark mode via `next-themes`.

### Testing & Quality

25. **Unit Tests** — `tests/unit/*.test.ts` covering LLM usage, scoring, scraping, reply classification, contact inference, Google Calendar helpers, settings, webhooks, and more.
26. **E2E Tests** — Playwright E2E suite in `tests/e2e/` covering auth, dashboard, approvals, outreach, proposals, settings, universities, analytics, theme, responsiveness, and smoke tests.
27. **Master Checklist** — `.devin/scripts/checklist.py` orchestrates Security Scan, Lint, Schema Validation, Test Runner, UX Audit, SEO Check, Lighthouse, and Playwright E2E.

## Non-Functional / Security Requirements

- **Authentication:** All public user-facing Convex actions must authenticate the user via `validateAuth(ctx)`.
- **Internalization:** Scheduler, cron, webhook, and test-only actions must be `internalAction` and called via `internal.actions.*`.
- **HTTP Security:** Webhook endpoints verify HMAC signatures or bearer tokens. Test endpoints are disabled by default and require `DISABLE_TEST_ENDPOINTS=false` plus `TEST_WEBHOOK_SECRET`.
- **API Key Hygiene:** API keys stored in `systemSettings` are XOR-obfuscated and validated with `sanitizeApiKey()` (printable ASCII 33–126) before storage.
- **Idempotency:** Confirming a meeting for the same time slot is idempotent; cancelling a meeting updates both the calendar event and the proposal status.
- **Cost Control:** Daily LLM spend is tracked in `llmBudget` with a soft cap from `LLM_DAILY_BUDGET_USD` (default $50). Deterministic calls are cached in `llmCache` for 48 hours.
- **Rate Limiting:** Persistent rate-limiting and Serper query budgets prevent runaway API usage.
- **Analytics Accuracy:** Funnel counts use full queries (`collect()`) so totals and stage counts are accurate across all stages.
- **Type Safety:** Avoid circular type inference in actions; use `do*` helper functions with explicit return types where needed.
- **Error Tracking:** Sentry integrated for frontend and backend error/performance tracking.
- **Observability:** `llmUsage` records exact token and cost metadata per LLM call.
