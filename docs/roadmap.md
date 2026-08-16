# Fretbox Outreach AI v2 — Roadmap

Powered by **Convex + Next.js 16.3.1**
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
| Backend | Convex `^1.42.1` (TypeScript) — Queries, Mutations, Actions, HTTP Actions, Scheduler |
| Database | Convex DB (Document-Relational, reactive) |
| Task Queue | Convex Scheduled Functions + Cron Jobs (scheduler-chained for long enrichment) |
| High-Tier LLM | `gemini-3.7-flash` (Google AI API, thinking `LOW`) — per-source extraction, partial-merge, proposals, complex reasoning |
| Fast-Tier LLM | `gemini-3.5-flash-lite` (Google AI API) — scraper, government-data, scoring, personalization |
| Vector Embeddings | `gemini-embedding-001` (Google AI API) — 768-dim, same key as Gemini |
| Vector Search | Convex Native Vector Search (768-dim) |
| PDF Extraction | `unpdf` `^1.8.1` (serverless-safe PDF.js build; replaces `pdfjs-dist`) |
| Web Scraping | Firecrawl (≤8 credits/university, Jina fallback on exhaustion) + Jina Reader + `fetch()` HTML parse fallback |
| Discovery | Serper (≤14 queries/university, budget-enforced via `convex/lib/serperBudget.ts`) |
| File Storage | Convex File Storage (PDFs, CSVs) |
| Email Delivery | ZeptoMail REST API (called from Convex Actions) |
| Inbound Email | ZeptoMail Inbound Parse → Convex HTTP Action webhook on `*.convex.site` |
| Proposal Rendering | Rich HTML emails (legacy `pdf_storage_id` field remains unused) |
| Frontend | Next.js 16.3.1 (App Router, Webpack-pinned) + React 19 + Tailwind CSS |
| Data Fetching | Convex React hooks (`useQuery`, `useMutation`, `useAction`) |
| Auth | `@convex-dev/auth` `^0.0.95` + `@auth/core` `^0.41.3` with Password provider |
| Deployment | Vercel only (`vercel.json` — `@vercel/next` builder + CSP with `wss://*.convex.cloud`; live `https://onboardingai2.vercel.app`) + Convex Cloud (backend, production: `energetic-raven-535`). Netlify retired 2026-08-16. |
| Monitoring | Convex Dashboard + Sentry SDK (`@sentry/nextjs` / `@sentry/node`) |
| Provider Alerts | `apiAlerts` table + `components/ApiAlertModal.tsx` (6h dedup, surfaced in dashboard) |

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

## PART 1.7: DOCUMENT MAILER — Completed

1. **Upload & Parse** — `components/DocumentMailerModal.tsx` uploads `.docx` files to Convex Storage and calls `convex/actions/document.ts:parseDocx` to extract plain text with Mammoth.
2. **Recipient Selection** — For each selected university, the user can pick an existing stakeholder or enter a custom email address. `convex/stakeholders.ts:listByUniversities` populates per-university stakeholders.
3. **Draft Creation** — `convex/actions/document.ts:createDocumentDrafts` creates one `emailsSent` record per recipient with `status: "pending_approval"`, preserving the HITL gate.
4. **Attachments** — The original `.docx` and any additional `.docx` files can be attached. `convex/actions/email.ts:approveAndSend` fetches attachment bytes from Convex Storage, base64-encodes them, and sends them through ZeptoMail.
5. **Schema Updates** — `emailsSent` now has optional `stakeholder_id`, `recipient_email`, `document_storage_id`, and an `attachments` array.
6. **Approvals UI** — `app/(dashboard)/dashboard/approvals/page.tsx` shows the recipient (stakeholder or custom) and lists attached file names.

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

- FastAPI (Python) — replaced by Convex Functions (TypeScript)
- Celery + Redis — replaced by Convex Cron + Scheduled Actions
- SQLAlchemy + asyncpg — replaced by Convex DB
- Supabase PostgreSQL — replaced by Convex DB
- Supabase Storage — replaced by Convex File Storage
- WeasyPrint — not used; proposals are sent as rich HTML emails
- Jinja2 templates — replaced by TypeScript template strings
- Docker Compose — replaced by `npx convex dev`
- Fly.io (backend) — replaced by Convex Cloud
- Clerk — replaced by Convex Native Auth
- Browserbase — replaced by Firecrawl + Jina Reader + `fetch()` HTML parse
- OpenRouter — removed; direct Google AI Gemini API used
- OpenAI — removed; replaced by Google AI (Gemini + embeddings)
- Anthropic Claude — removed; Gemini 3.5 Flash / Flash-Lite used for all reasoning

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

## PART 5: AS-BUILT — PRODUCTION RELIABILITY & ENRICHMENT HARDENING

This section records the production-reliability work completed after the initial build. It is kept here as an as-built record so future work does not regress these guarantees.

### 5.1 Gemini 3.7 upgrade and model allocation

- `convex/lib/models.ts` now uses `gemini-3.7-flash` for complex / per-source extraction / partial-merge / proposals / general Gemini calls, and `gemini-3.5-flash-lite` for scraper / government-data / scoring / personalization. Embeddings remain `gemini-embedding-001`.
- `convex/lib/llm.ts` was updated for Gemini 3.x model detection, `thinkingConfig: { thinkingBudget: "LOW" }` (3.7 rejects `MINIMAL`), Gemini 3.7 pricing (`$0.75/$3.75` per million through 2026-12-31, then `$1.50/$7.50`), and `thoughtsTokenCount` billing.
- Production SDK path verified (not just raw API): Jamia Hamdard test extracted Prof. Asgar Ali (VC Offg.) and Col. Tahir Mustafa (Registrar) with correct institution emails.

### 5.2 Scheduled long-running enrichment

- Long enrichment chains no longer depend on a caller waiting synchronously (~5-minute CLI client limit).
- `scheduleEnrichmentInternal` (single) and `scheduleEnrichmentBatch` (sequential queue) enqueue via the Convex scheduler and return immediately.
- `runEnrichmentChainInternal` (phases 1–4) schedules `finishEnrichmentChainInternal` (phases 5–6 + queue chaining). Each stage gets a full Convex action runtime budget.
- Sequential batches chain via the scheduler so Firecrawl/Serper are never hit concurrently.

### 5.3 Firecrawl and Serper discipline

- Firecrawl: ≤8 credits/university, real counter, immediate Jina fallback on insufficient-credit detection, bounded retry/backoff, per-university caps.
- Serper: ≤14 queries/university via `convex/lib/serperBudget.ts`, cooldown-gated social refresh, no image search, controlled discovery with institution-specific validation.
- Both record quota/error conditions to `apiAlerts`.

### 5.4 API provider alert modal

- New `apiAlerts` table (`convex/schema.ts`) and `convex/apiAlerts.ts` (`recordInternal` with 6h dedup, `list` / `acknowledge` / `acknowledgeAll` with `validateAuth`).
- `components/ApiAlertModal.tsx` mounted in `app/(dashboard)/layout.tsx` surfaces unacknowledged alerts with Dismiss / Got-it actions.
- Gemini quota/rate-limit errors caught centrally in `convex/lib/llm.ts`; Firecrawl 429/insufficient-credit in `deepEnrichment.ts`; Serper exhaustion in `deepEnrichment.ts`, `enrichGovernmentData.ts`, `scraper.ts`, `enrichment.ts`, `lib/gapFill.ts`.

### 5.5 unpdf PDF extraction

- Replaced worker-dependent `pdfjs-dist` with `unpdf` `^1.8.1` (serverless-safe PDF.js build).
- `extractPdfText` and `extractPdfTables` in `convex/lib/scrapers.ts`; legacy `convex/lib/pdfPolyfills.ts` removed.
- Production-verified against a real NIRF PDF (43,322 bytes → 13,861 chars text / 15,860 chars tables, no worker error).

### 5.6 Government data enrichment fallbacks

- NIRF/AISHE/NAAC source discovery → deterministic regex fallback → Round-2 NAAC/university-site search → Gemini grounding last-resort fallback.
- No fabricated demographics: Adamas University exercised all four tiers and preserved `null` because no reliable public enrollment figures exist.

### 5.7 Singleton-role enforcement and acting-suffix normalization

- `stakeholders.dedupeSingletonRoleContactsInternal` + `convex/lib/validateDeepEnrichment.ts` normalize `Offg.` / `Officiating` / `Acting` / `i/c` (including punctuation inside parentheses and space-separated suffixes like `Registrar i/c`).
- Same-person acting duplicates collapse; the original role label is preserved; same-name people with conflicting roles do not merge unless contact evidence connects them.

### 5.8 Gap-fill guards

- `convex/lib/gapFill.ts` runs free passes first (officers-table extraction, NIRF officer extraction, thin-site snippet fallback for any blocked/thin site), Serper last.
- `verifyNameRoleProximity` plus URL/department-page guards prevent false positives (e.g., the Nagarjuna false VC Prof. Raja Sekhar Patteti from an English-department page was caught and deleted).
- Post-gap-fill singleton enforcement catches any new duplicates.

### 5.9 Provenance self-consistency

- `phone_source` / `linkedin_source` set to `"none"` when values are stripped; a nonempty value must never have `"none"` provenance; existing valid provenance is not overwritten by a new `"none"`.
- `convex/actions/stakeholderCleanup.ts` makes cleanup self-consistent and idempotent. Verified across multiple production universities.

### 5.10 Next.js 16 migration

- Next.js 15 → 16.3.1. `middleware.ts` was renamed to `proxy.ts` and subsequently **removed entirely** (see §5.13). `next.config.ts` lost the obsolete `eslint` property. The production build passes `--webpack` (`npm run build`) to preserve the custom webpack config; `next dev` runs on Turbopack.
- Auth packages upgraded: `@convex-dev/auth` → `0.0.95`, `@auth/core` → `0.41.3`.
- Build, lint, and TypeScript pass after migration. `npm audit` clean.

### 5.11 Verified production universities

| University | VC | Registrar | Notes |
| --- | --- | --- | --- |
| Jamia Hamdard | Prof. Asgar Ali (Offg.) | Col. Tahir Mustafa | Correct institution emails; unverified phones/LinkedIn removed; 40 stakeholders after cleanup. |
| Gondwana University | Dr. Prashant Bokare | Dr. Anil Hirekhan | Pro VC deduped; 22 stakeholders after cleanup; 1,101 students. |
| Indian Institute of Heritage | Dr. Sachchidanand Joshi | (record exists, name may be absent) | Difficult to scrape; deep enrichment can return zero new stakeholders with explicit warnings. |
| Anna University | (not found — not published) | Dr. V. Kumaresan | Duplicate `Registrar i/c` merged; 11,940 students (NIRF 2024-25). |
| Acharya Nagarjuna University | Prof. Kancharla Gangadhara Rao (I/c) | — | False-positive VC Patteti deleted; 5,433 students (NIRF 2025-26). |
| Adamas University | — | Dr. Rajat Ray (Acting) | Deep enrichment succeeds after scheduled-action split; demographics unavailable (no public data). |

### 5.13 Client-side auth guard & edge middleware removal

- The edge middleware (`proxy.ts` / `middleware.ts`) was removed because it was incompatible with the Netlify edge runtime and caused deployment failures.
- Dashboard route protection is now client-side via `components/AuthGuard.tsx`, which uses `useConvexAuth` + `next/navigation` `useRouter` to redirect unauthenticated users to `/sign-in`.
- The landing page (`app/page.tsx`) was refactored to render marketing content instantly without a blocking loading spinner. Authenticated users are redirected to `/dashboard` via `<RedirectIfAuthenticated />`.
- `ConvexClientProvider.tsx` now falls back to the production Convex URL (`https://energetic-raven-535.convex.cloud`) when `NEXT_PUBLIC_CONVEX_URL` is not set, ensuring the app works on Netlify without additional env configuration.
- E2E navigation tests updated to wait for client-side `AuthGuard` redirect (`waitForURL`). Responsive tests now target the landing page and auth pages instead of the dashboard (which requires authentication).

### 5.14 Honest limits

- No pipeline can extract data that is not published. Anna University's VC and Adamas's demographics are absent from reachable official sources; the pipeline reports this honestly rather than hallucinating.
- Firecrawl depends on account credits; Jina-only mode works but is slower/lower-quality for JS-rendered sites.
- Gap-fill false-positive guards are robust against the known Nagarjuna pattern but new ambiguous department-page patterns may emerge.
- Frontend deployment is Vercel-only (`vercel.json` pins the `@vercel/next` builder because CLI framework detection is unreliable for Next.js 16, and the CSP must include `wss://*.convex.cloud` for the Convex realtime connection). Netlify was retired 2026-08-16 (`netlify.toml` removed).

---

## More Documentation

- [Project README](../README.md)
- [Codebase map](../CODEBASE.md)
- [Implementation plan](./PLAN.md)
- [Requirements](./Requirement.md)
- [User guide](../user-guide.md)

---

Document End — Fretbox Outreach AI v2 Roadmap
