# Outreach AI for Fretbox — Requirements

## Functional Requirements

### University Data

- **Ingestion**: Universities can be loaded from three sources:
  - CSV upload (drag-and-drop or file picker) parsed by `convex/actions/ingest.ts`.
  - UGC.gov.in sync via the `/api/sync-ugc` proxy and `convex/actions/ugcSync.ts`.
  - Curated INI seed for a known baseline set.
- **CRUD & Search**: List, search, filter, paginate, and view university details including state, city, type, category, NAAC grade, and UGC status.
- **Website Discovery**: Discover and validate official websites using Serper search, `fetch()`/`HEAD` validation, Jina Reader fallback, and candidate ranking with owned-domain and education-TLD heuristics.
- **Data Source Tracking**: Track `data_source` (`ugc`, `curated`, `csv`, `manual`) and `website_status` (`pending`, `valid`, `invalid`, `discovered`, `discovered_weak`).

### Enrichment

- **Stakeholder Extraction**: Scan university websites for decision-makers and contacts:
  - Owner / President / Chairman / Chancellor / Vice Chancellor / Pro Vice Chancellor.
  - Registrar / Deputy Registrar / Dean Student Welfare / Dean Student Affairs.
  - Director Administration / Chief Warden / Controller of Examinations.
  - Finance Officer / Librarian / Placement Officer / Public Relations Officer.
  - Extraction sources: Firecrawl, Jina Reader, `fetch()` HTML parse, regex fallback, anti-ragging pages, and role-based email inference.
- **Demographics**: Extract student population data including male/female split and hostelites/day-scholars from NIRF, AISHE, NAAC SSR, and mandatory disclosure PDFs. Track `data_quality` (`verified`, `partial`, `inferred`).
- **Signals**: Discover and store news, LinkedIn, website, and image signals. Embed signals with `gemini-embedding-001` (768-dim) for vector search and proposal RAG.
- **Scoring**: Compute a deterministic score, an AI score from Gemini, and a weighted final composite. Surface hostelite, student scale, NAAC, agility, stakeholder, and digital signal factors.
- **Orchestrated Chain**: Run the full enrichment pipeline in strict phase order via `convex/actions/orchestrator.ts`.

### Outreach

- **Sequences**: Create and manage multi-step outreach sequences with configurable steps, cadence, and status (`active`, `paused`, `completed`, `opted_out`).
- **HITL Approval**: Draft emails as `pending_approval`; human review is required before sending. Approvals are surfaced on the **Approvals** dashboard page.
- **Email Dispatch**: Send approved emails via ZeptoMail REST API with retry logic and delivery tracking (`queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `failed`).
- **Personalization**: Generate personalized email copy with Gemini, using university-specific signals and sanitizing inputs/outputs.
- **Inbound Replies**: Receive replies via the ZeptoMail inbound webhook on `*.convex.site`, store raw replies, and classify them.
- **Reply Classification**: Classify replies into `meeting_request`, `positive_interest`, `request_info`, `not_interested`, `opt_out`, `out_of_office`, `other`. Low-confidence high-stakes classifications (`meeting_request`, `positive_interest` with confidence < 0.85) require human review.
- **Auto-Replies**: Automatically send configured replies for positive interest and meeting requests when confidence is high.
- **Document Mailer** (manual): Upload a `.docx` file, extract its text as the email body, optionally attach the original and additional `.docx` files, select one or more universities, choose a stakeholder or enter a custom email per university, and create `pending_approval` drafts that are queued for HITL review.

### Proposals

- **AI Proposal Generation**: Generate structured proposals from university signals and vector search. Output rich HTML; proposals are emailed directly as HTML and no PDF is generated.
- **Google Calendar / Meet**: Confirm meetings to create Google Calendar events with Meet links; update proposal status to `meeting_confirmed`. Cancel meetings to remove calendar events and update status to `cancelled`.
- **Proposal Statuses**: Support `draft`, `ready`, `sent`, `meeting_confirmed`, `cancelled`.
- **Proposal Delivery**: Email generated proposals to stakeholders from the **Proposals** dashboard.

### Dashboard & Settings

- **Pages**: Provide real-time dashboard pages: Universities, Enrichment, Outreach, Approvals, Proposals, Analytics, and Settings.
- **Settings — API Key Management**: Store and XOR-obfuscate keys for Google Gemini, Serper, Firecrawl, ZeptoMail, Google Calendar service account, and calendar ID. Provide test buttons and status indicators.
- **Authentication**: Email/password auth via Convex Native Auth with sign-in, sign-up, sign-out, and password reset (`/forgot-password`, `/reset-password`). Reset codes expire after one hour.
- **Theming**: Support light/dark mode via `next-themes`.

### Testing & Quality

- **Unit Tests**: `tests/unit/*.test.ts` covering LLM usage, scoring, scraping, reply classification, contact inference, Google Calendar helpers, settings, webhooks, and more.
- **E2E Tests**: Playwright E2E suite in `tests/e2e/` covering auth, dashboard, approvals, outreach, proposals, settings, universities, analytics, theme, responsiveness, and smoke tests.
- **Master Checklist**: `.devin/scripts/checklist.py` orchestrates Security Scan, Lint, Schema Validation, Test Runner, UX Audit, SEO Check, Lighthouse, and Playwright E2E.

## Non-Functional / Security Requirements

- **Authentication**: All public user-facing Convex actions must authenticate the user via `validateAuth(ctx)`.
- **Internalization**: Scheduler, cron, webhook, and test-only actions must be `internalAction` and called via `internal.actions.*`.
- **HTTP Security**: Webhook endpoints verify HMAC signatures or bearer tokens. Test endpoints are disabled by default and require `DISABLE_TEST_ENDPOINTS=false` plus `TEST_WEBHOOK_SECRET`.
- **API Key Hygiene**: API keys stored in `systemSettings` are XOR-obfuscated and validated with `sanitizeApiKey()` (printable ASCII 33–126) before storage.
- **Idempotency**: Confirming a meeting for the same time slot is idempotent; cancelling a meeting updates both the calendar event and the proposal status.
- **Cost Control**: Daily LLM spend is tracked in `llmBudget` with a soft cap from `LLM_DAILY_BUDGET_USD` (default $50). Deterministic calls are cached in `llmCache` for 48 hours.
- **Rate Limiting**: Persistent rate-limiting and Serper query budgets prevent runaway API usage.
- **Analytics Accuracy**: Funnel counts use full queries (`collect()`) so totals and stage counts are accurate across all stages.
- **Type Safety**: Avoid circular type inference in actions; use `do*` helper functions with explicit return types where needed.
- **Error Tracking**: Sentry integrated for frontend and backend error/performance tracking.
- **Observability**: `llmUsage` records exact token and cost metadata per LLM call.

## More Documentation

- [Project README](../README.md)
- [Codebase map](../CODEBASE.md)
- [Implementation plan](./PLAN.md)
- [Roadmap](./roadmap.md)
- [User guide](../user-guide.md)
