# Fretbox Outreach AI v2 — Roadmap

Powered by **Convex + Next.js 15**
AI-Native Backend | Real-Time Reactive | Zero DevOps

---

## PART 1: ARCHITECTURE OVERVIEW

This document is the build roadmap for **Fretbox Outreach AI v2.0** —
redesigned from the ground up to use Convex as the exclusive backend.

The old stack (FastAPI + Celery + Redis + SQLAlchemy + Supabase) has been
replaced with a unified Convex backend that handles the database, serverless
functions, task scheduling, AI agents, vector search, file storage, and
webhooks — all in TypeScript with zero infrastructure to manage.

### Final Tech Stack

| Layer | Technology |
| ------- | ------------ |
| Backend | Convex (TypeScript) — Queries, Mutations, Actions, HTTP Actions |
| Database | Convex DB (Document-Relational, reactive) |
| Task Queue | Convex Scheduled Functions + Cron Jobs |
| High-Tier LLM | Gemini 3.5 Flash (Google AI API) — reasoning, proposals, reply classification |
| Fast-Tier LLM | Gemini 3.1 Flash-Lite (Google AI API) — scoring, email, vision |
| Vector Embeddings | `gemini-embedding-001` (Google AI API) — 768-dim, same key as Gemini |
| Vector Search | Convex Native Vector Search (768-dim) |
| Web Scraping | Firecrawl + Jina Reader + `fetch()` HTML parse fallback |
| File Storage | Convex File Storage (PDFs, CSVs) |
| Email Delivery | ZeptoMail REST API (called from Convex Actions) |
| Inbound Email | ZeptoMail Inbound Parse → Convex HTTP Action webhook on `*.convex.site` |
| Proposal Rendering | Rich HTML emails (legacy `pdf_storage_id` field remains unused) |
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind CSS |
| Data Fetching | Convex React hooks (`useQuery`, `useMutation`, `useAction`) |
| Auth | Convex Native Auth with Password provider |
| Deployment | Vercel (frontend) + Convex Cloud (backend) |
| Monitoring | Convex Dashboard + Sentry SDK |

### AI & Service Keys

```bash
GOOGLE_AI_API_KEY   → Gemini 3.5 Flash (reasoning, proposals, reply classification)
                    → Gemini 3.1 Flash-Lite (scoring, personalization, vision)
                    → gemini-embedding-001 (768-dim embeddings) — SAME KEY
```

**Optional service keys** are stored in Convex `systemSettings` (XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`):

- `SERPER_API_KEY` — web search / discovery
- `FIRECRAWL_API_KEY` — deep crawling / sitemap
- `ZEPTOMAIL_API_KEY` — email delivery
- `ZEPTOMAIL_FROM_EMAIL` — verified sender address
- `ZEPTOMAIL_FROM_NAME` — sender display name
- `Google Calendar Service Account JSON` + `Calendar ID` — calendar / Meet integration

### System Pipeline

```text
CSV Upload / UGC Sync / Curated INI Seed
    ↓
Website Discovery (Convex Action → Serper.dev REST API)
    ↓
Website Validation (fetch HEAD/GET → Jina Reader fallback)
    ↓
Stakeholder Extraction (Jina Reader → Firecrawl → regex fallback)
    ↓
Demographics & Government Data (NIRF / AISHE / NAAC / PDFs)
    ↓
Social & News Enrichment (Serper → vector embeddings)
    ↓
AI Scoring (deterministic + Gemini composite)
    ↓
Outreach Sequences (HITL approval → ZeptoMail dispatch)
    ↓
Inbound Replies (ZeptoMail Inbound webhook)
    ↓
Reply Classification (Gemini 3.5 Flash)
    ↓
Auto-Reply / Proposal Draft / Meeting Request Dispatch
    ↓
Meeting Booked (Google Calendar + Meet link)
    ↓
AI Proposal Generated (Gemini 3.5 Flash + Vector Search → rich HTML email)
```

**Key Benefit:** Every step above is observable in real-time on the frontend
via Convex's reactive `useQuery` hooks — no polling, no manual state management.

---

## PART 1.5: POST-REFACTOR HARDENING — Completed

The following security and maintainability improvements are implemented and in production:

1. **Action Internalization** — Pipeline actions (`orchestrator`, `scraper`, `enrichment`, `deepEnrichment`, `discovery`, `scoring`, `outreach`, `ingest`, `ugcSync`, `liveTest`, `realWorldVerify`, etc.) are `internalAction` and are called via `internal.actions.*` from crons, webhooks, and other internal actions. Public wrappers require `validateAuth(ctx)`.
2. **HTTP Test Endpoint Lockdown** — Test endpoints in `convex/http.ts` are disabled by default. They require `DISABLE_TEST_ENDPOINTS=false` and a `TEST_WEBHOOK_SECRET` bearer token.
3. **API Key Sanitization** — `sanitizeApiKey()` enforces printable ASCII (33–126) before keys are stored in `systemSettings`.
4. **Proposal Status Expansion** — `proposals` table supports `draft`, `ready`, `sent`, `meeting_confirmed`, and `cancelled`.
5. **Meeting Idempotency** — `confirmMeeting` is idempotent for the same time slot; `cancelMeeting` cancels the Google Calendar event and updates the proposal.
6. **Funnel Accuracy** — `getFunnelStats` uses `collect()` queries to produce accurate counts across all stages, including `not_interested` and `skipped`.
7. **Circular Type Fix** — `email.ts` (`doSendEmail`) and `proposals.ts` (`doGenerateProposal`) use helper functions to avoid circular `any` inference.

---

## PART 1.6: AUTHENTICATION — FORGOT PASSWORD — Completed

1. **Forgot Password Flow** — Added `/forgot-password` and `/reset-password` pages using Convex Auth's Password provider `reset` email configuration.
2. **Reset Code Delivery** — Generates a 32-character code, stores it in `authVerificationCodes`, and sends it via ZeptoMail through the existing `actions/email.sendEmail` internal action.
3. **UI Integration** — "Forgot password?" link on `/sign-in`, email pre-fill via query params on `/reset-password`, and 8-character minimum password validation.
4. **Env Configuration** — Requires `SITE_URL` (Convex env) for reset-callback URL construction and a valid `zeptomailApiKey` in Dashboard → Settings for email delivery.

---

## PART 2: BUILD ROADMAP — Delivered

All six original build phases are complete. The table below records the final, as-built state.

### PHASE 1: CONVEX FOUNDATION Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 1.1 | Init Convex | `npx convex dev` in project root. `/convex` directory created. | Done |
| 1.2 | Define Schema | `convex/schema.ts` with auth, universities, stakeholders, priorityScores, universitySignals, outreachSequences, emailsSent, replyLogs, proposals, rateLimits, llmBudget, llmCache, systemSettings. Indexes + 768-dim vector index. | Done |
| 1.3 | Convex Native Auth | `convex/auth.config.ts` with Password provider. `ConvexAuthNextjsServerProvider` in `app/layout.tsx`. `convexAuthNextjsMiddleware()` in `middleware.ts`. | Done |
| 1.4 | CRUD Functions | `convex/universities.ts`, `convex/stakeholders.ts`, `convex/signals.ts`, `convex/proposals.ts`, `convex/sequences.ts`, `convex/emails.ts`, `convex/replies.ts`, `convex/settings.ts`, etc. | Done |
| 1.5 | Next.js 15 Shell | App Router with `/(dashboard)/layout.tsx`, glassmorphism sidebar, pages: Universities, Enrichment, Outreach, Approvals, Proposals, Analytics, Settings. | Done |
| 1.6 | Env Vars | Secrets set via `npx convex env set`: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `SITE_URL`, `SETTINGS_OBFUSCATION_SECRET`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN`, `LLM_DAILY_BUDGET_USD`, `DISABLE_TEST_ENDPOINTS`, `TEST_WEBHOOK_SECRET`, `ADMIN_EMAILS`, `SENTRY_DSN`. | Done |
| 1.7 | Verify | Convex dashboard shows tables. Auth works. Frontend connects and shows live university list. | Done |

### PHASE 2: DATA INGESTION & WEBSITE DISCOVERY Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 2.1 | CSV Parse Action | `convex/actions/ingest.ts` — parse CSV bytes, bulk insert via `ctx.runMutation`. | Done |
| 2.2 | UGC Sync | `convex/actions/ugcSync.ts` — strict matching, batched writes, in-memory deduplication. | Done |
| 2.3 | Curated INI Seed | Seeded curated university list with known baseline data. | Done |
| 2.4 | File Upload UI | Drag-and-drop and button upload → `generateUploadUrl()` → action. | Done |
| 2.5 | Website Discovery | `convex/actions/discovery.ts` — Serper search, candidate ranking, owned-domain heuristics. | Done |
| 2.6 | Website Validation | `fetch()` `HEAD`/`GET` validation, Jina Reader fallback, `discovered` / `discovered_weak` status. | Done |
| 2.7 | Batch Dispatcher | `convex/dispatcher.ts` — stagger-schedule discovery per university. | Done |

### PHASE 3: STAKEHOLDER EXTRACTION & ENRICHMENT Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 3.1 | Scraper Action | `convex/actions/scraper.ts` — `fetch()` HTML parse → Jina Reader → Firecrawl fallback. | Done |
| 3.2 | Anti-Ragging Scrape | `convex/actions/scrapeAntiRagging.ts` — extra stakeholder discovery from anti-ragging pages. | Done |
| 3.3 | Stakeholder Extract | Upsert stakeholders with role, email, phone, LinkedIn, source attribution. | Done |
| 3.4 | Contact Inference | `convex/lib/contactInference.ts` — role-based email alias inference and canonicalization. | Done |
| 3.5 | LinkedIn Enrichment | `convex/actions/enrichment.ts` — Serper search for LinkedIn and professional signals. | Done |
| 3.6 | News & Image Signals | `convex/actions/enrichment.ts` — Serper news and image queries → `universitySignals` with 768-dim embedding. | Done |
| 3.7 | Government Data | `convex/actions/enrichGovernmentData.ts` — NIRF / AISHE / NAAC / PDF extraction with `pdf-parse`, Jina, Gemini inline PDF. | Done |
| 3.8 | Demographics | `universities.demographics` object with total/male/female, hostelites/day scholars, NIRF program-wise breakdown, and `data_quality`. | Done |
| 3.9 | Deterministic Score | `convex/lib/scoring.ts` — Fretbox-specific factor map. | Done |
| 3.10 | AI Scoring | `convex/actions/scoring.ts` — Gemini 3.1 Flash-Lite feeds signals and returns `ai_score` (0–10). | Done |
| 3.11 | Enrichment Chain | `convex/actions/orchestrator.ts` — strict phase order with government data before deep enrichment. | Done |

### PHASE 4: OUTREACH AUTOMATION ENGINE Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 4.1 | Sequence Manager | `convex/sequences.ts` — state machine (`active`, `paused`, `completed`, `opted_out`). | Done |
| 4.2 | Email Action | `convex/actions/email.ts` — ZeptoMail REST `POST https://api.zeptomail.in/v1.1/email` with retry. | Done |
| 4.3 | Email Templates | `convex/lib/emailTemplates.ts` — typed intro, follow-up, auto-reply, proposal templates. | Done |
| 4.4 | Personalization | `convex/actions/personalize.ts` — Gemini 3.5 Flash with `sanitizeLlmInput` / `sanitizeLlmOutput`. | Done |
| 4.5 | HITL Approval | Emails drafted as `pending_approval` on the **Approvals** page before sending. | Done |
| 4.6 | Cadence Cron | `convex/crons.ts` — process due sequences every 15 minutes, batch cap 100 with 250ms stagger. | Done |
| 4.7 | Delivery Webhook | `convex/http.ts` — ZeptoMail delivery webhook updates `emailsSent` status. | Done |
| 4.8 | Inbound Reply | `convex/http.ts` — ZeptoMail Inbound Parse webhook saves `replyLogs`. | Done |
| 4.9 | Reply Classifier | `convex/actions/replyClassifier.ts` — Gemini 3.5 Flash with confidence and HITL gate. | Done |
| 4.10 | Auto-Reply | `convex/actions/autoReply.ts` — send auto-replies for positive / meeting-request replies. | Done |
| 4.11 | Outreach Dashboard | Kanban/list view, reply inbox, email thread viewer. | Done |

### PHASE 5: PROPOSALS Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 5.1 | Google Calendar Webhook | `convex/http.ts` — Google Calendar push notifications verified with `GOOGLE_CALENDAR_WEBHOOK_TOKEN`. | Done |
| 5.2 | Meeting Confirmation | `convex/actions/proposals.ts` — `confirmMeeting` creates calendar event + Meet link; idempotent. | Done |
| 5.3 | Meeting Cancellation | `cancelMeeting` removes calendar event and updates proposal to `cancelled`. | Done |
| 5.4 | Proposal Generation | `convex/actions/proposals.ts` — vector search on `universitySignals` + Gemini 3.5 Flash → structured JSON. | Done |
| 5.5 | Module Recommender | `convex/lib/moduleRecommender.ts` — rule-based module selection. | Done |
| 5.6 | Rich HTML Proposal Generation | `convex/actions/proposals.ts` renders structured proposal JSON as rich HTML and sends it via ZeptoMail. `proposals.pdf_storage_id` is legacy and unused. | Done |
| 5.7 | Proposals Page | Card grid, rich HTML preview/resend, confirm/reschedule/cancel meeting. | Done |

### PHASE 6: HARDENING, TESTING & MONITORING Done

| # | Task | Details | Status |
| --- | ------ | --------- | -------- |
| 6.1 | Sentry | `@sentry/nextjs` for frontend and `@sentry/node` for backend error/performance tracking. | Done |
| 6.2 | Rate Limiting | Persistent rate limits and Serper budget enforcement. | Done |
| 6.3 | LLM Budget | `llmBudget` daily spend tracking and `llmCache` 48h deterministic cache. | Done |
| 6.4 | Vercel Deploy | Configured for Vercel + Convex Cloud. | Done |
| 6.5 | Unit Tests | `tests/unit/` — 40+ test files covering core logic. | Done |
| 6.6 | Playwright E2E | `tests/e2e/` — 20+ specs covering auth, dashboard, outreach, proposals, settings, theme, responsiveness. | Done |
| 6.7 | Master Checklist | `.devin/scripts/checklist.py` orchestrates Security, Lint, Schema, Tests, UX, SEO, Lighthouse, Playwright. | Done |
| 6.8 | README | `README.md` with setup, env vars, stack, features, and verification commands. | Done |

---

## PART 3: CONVEX SCHEMA NOTES Done

See: `convex/schema.ts`

- UUIDs replaced by Convex native document IDs (`v.id("tableName")`).
- Timestamps are `v.number()` Unix ms.
- JSONB fields replaced by `v.object({...})` with typed sub-schemas.
- Vector embeddings: **768 dimensions** via `gemini-embedding-001`.
- No migrations needed — Convex handles DDL automatically.
- Auth tables are provided by `@convex-dev/auth/server`.

---

## PART 4: ELIMINATED INFRASTRUCTURE

The following are permanently removed in v2:

- ❌ FastAPI (Python) — replaced by Convex Functions (TypeScript)
- ❌ Celery + Redis — replaced by Convex Cron + Scheduled Actions
- ❌ SQLAlchemy + asyncpg — replaced by Convex DB
- ❌ Supabase PostgreSQL — replaced by Convex DB
- ❌ Supabase Storage — replaced by Convex File Storage
- ❌ WeasyPrint — not used; proposals are sent as rich HTML emails
- ❌ Jinja2 templates — replaced by TypeScript template strings
- ❌ Docker Compose — replaced by `npx convex dev`
- ❌ Fly.io (backend) — replaced by Convex Cloud
- ❌ Clerk — replaced by Convex Native Auth
- ❌ Browserbase — replaced by Firecrawl + Jina Reader + `fetch()` HTML parse
- ❌ OpenRouter — removed; direct Google AI Gemini API used
- ❌ OpenAI — removed; replaced by Google AI (Gemini + embeddings)
- ❌ Anthropic Claude — removed; Gemini 3.5 Flash / Flash-Lite used for all reasoning

---

## PART 5: CONTINUOUS ROADMAP

The following are grounded next steps and continuous improvements, not aspirational moonshots. Each item is small enough to ship incrementally and large enough to move the product forward.

| Priority | Area | Item | Rationale |
| ---------- | ------ | ------ | ----------- |
| P2 | Data Quality | Improve demographics source attribution and add confidence scoring per field. | Higher-quality hostelite/day-scholar numbers improve targeting. |
| P2 | Enrichment | Add fallback for blocked `.gov.in` domains and better PDF table extraction. | Government sources are high value but frequently blocked. |
| P2 | Outreach | A/B test email templates and track open/click lift per variant. | Improve reply rates with data-driven copy. |
| P3 | Analytics | Add cohort and stage-conversion analytics beyond the funnel. | Better visibility into which sequences perform best. |
| P3 | UX | Bulk actions on Universities and Proposals (bulk re-enrich, bulk approve). | Reduces manual work for operators. |
| P3 | Auth | Role-based access control (admin / operator / viewer). | Current auth is binary; roles would support teams. |
| P3 | Integrations | Additional calendar providers (e.g., Outlook) behind adapter pattern. | Expand beyond Google Workspace customers. |
| P3 | Monitoring | LLM cost dashboard and per-university spend attribution. | `llmUsage` already records this; surface it in Analytics. |
| P4 | Compliance | Opt-out and suppression-list management with audit log. | Required for scaling outbound volume safely. |
| P4 | DevEx | Expand E2E coverage for settings test buttons and UGC sync. | Increase regression confidence. |

---

> *Document End — Fretbox Outreach AI v2 Roadmap*
