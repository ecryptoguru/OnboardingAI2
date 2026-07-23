
FRETBOX OUTREACH AI — NEXT-GEN EDITION
Powered by Convex + Next.js 15
AI-Native Backend | Real-Time Reactive | Zero DevOps

═══════════════════════════════════════════════════════════════
PART 1: ARCHITECTURE OVERVIEW
═══════════════════════════════════════════════════════════════

This document is the official build roadmap for Fretbox Outreach AI v2.0 —
redesigned from the ground up to use Convex as the exclusive backend.

The old stack (FastAPI + Celery + Redis + SQLAlchemy + Supabase) has been
replaced with a unified Convex backend that handles the database, serverless
functions, task scheduling, AI agents, vector search, file storage, and
webhooks — all in TypeScript with zero infrastructure to manage.

## Final Tech Stack

| Layer           | Technology                                                  |
|-----------------|-------------------------------------------------------------|
| Backend         | Convex (TypeScript) — Queries, Mutations, Actions           |
| Database        | Convex DB (Document-Relational, reactive)                   |
| Task Queue      | Convex Scheduled Functions + Cron Jobs                      |
| High-Tier LLM   | Gemini 3.5 Flash (Google AI API) — reasoning, proposals, reply classification |
| Fast-Tier LLM   | Gemini 3.1 Flash-Lite (Google AI API) — scoring, email, vision     |
| Vector Embeddings | gemini-embedding-001 (Google AI) — 768-dim, same key as Gemini |
| Vector Search   | Convex Native Vector Search (768-dim)                       |
| Web Scraping    | Firecrawl + Jina Reader + fetch() HTML parse fallback       |
| File Storage    | Convex File Storage (PDFs, assets)                          |
| Email Delivery  | ZeptoMail REST API (called from Convex Actions)              |
| Inbound Email   | ZeptoMail Inbound Parse → Convex HTTP Action webhook         |
| PDF Generation  | @react-pdf/renderer (TypeScript native)                     |
| Frontend        | Next.js 15 (App Router) + React 19                         |
| Data Fetching   | Convex React hooks (useQuery, useMutation, useAction)       |
| Auth            | Convex Native Auth (built-in, no external service)          |
| Deployment      | Vercel (frontend) + Convex Cloud (backend, free tier)       |
| Monitoring      | Convex Dashboard + Sentry SDK                               |

## AI Keys (2 total)

```bash
GOOGLE_AI_API_KEY   → Gemini 3.5 Flash (reasoning, proposals, reply classification)
                    → Gemini 3.1 Flash-Lite (scoring, personalization, vision)
                    → gemini-embedding-001 (vector embeddings) ← SAME KEY
```

**Optional service keys** are stored in Convex `systemSettings` (XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`):
- `SERPER_API_KEY` — web search / discovery
- `FIRECRAWL_API_KEY` — deep crawling / sitemap
- `ZEPTOMAIL_API_KEY` — email delivery
- `Google Calendar Service Account JSON` + `Calendar ID` — calendar / Meet integration

## System Pipeline

```
UGC CSV Upload (uploadFile → Convex Storage → parse Action)
     ↓
Website Discovery (Convex Action → Serper.dev REST API)
     ↓
Stakeholder Extraction (fetch() HTML parse → Jina Reader fallback)
     ↓
LinkedIn + News Enrichment (Convex Actions → Serper.dev)
     ↓
Priority Scoring (Deterministic Convex Mutation + Gemini 3 Flash AI score)
     ↓
Tiered Email Outreach (Convex Cron → Scheduled Mutations → ZeptoMail)
     ↓
Reply Classification (Convex HTTP Action webhook → Gemini 3.5 Flash)
     ↓
Action Dispatch (Convex Mutation → schedule follow-ups or proposals)
     ↓
Meeting Booked (Google Calendar + Meet link from proposal confirmation)
     ↓
AI Proposal Generated (Gemini 3.5 Flash + Vector Search → rich HTML → @react-pdf → Convex Storage)
```

**Key Benefit:** Every step above is observable in real-time on the frontend
via Convex's reactive `useQuery` hooks — no polling, no manual state management.

═══════════════════════════════════════════════════════════════
PART 1.5: POST-REFACTOR HARDENING (COMPLETED)
═══════════════════════════════════════════════════════════════

The following security and maintainability improvements have been implemented after the initial build:

1. **Action Internalization** — Pipeline actions (`orchestrator`, `scraper`, `enrichment`, `deepEnrichment`, `discovery`, `scoring`, `outreach`, `ingest`, `ugcSync`, `liveTest`, `realWorldVerify`, etc.) are now `internalAction` and are called via `internal.actions.*` from crons, webhooks, and other internal actions. Public wrappers require `validateAuth(ctx)`.
2. **HTTP Test Endpoint Lockdown** — Test endpoints in `convex/http.ts` are disabled by default. They require `DISABLE_TEST_ENDPOINTS=false` and a `TEST_WEBHOOK_SECRET` bearer token.
3. **API Key Sanitization** — `sanitizeApiKey()` enforces printable ASCII (33–126) before keys are stored in `systemSettings`.
4. **Proposal Status Expansion** — `proposals` table supports `draft`, `ready`, `sent`, `meeting_confirmed`, and `cancelled`.
5. **Meeting Idempotency** — `confirmMeeting` is idempotent for the same time slot; `cancelMeeting` cancels the Google Calendar event and updates the proposal.
6. **Funnel Accuracy** — `getFunnelStats` uses `collect()` queries to produce accurate counts across all stages, including `Not Interested` and `Skipped`.
7. **Circular Type Fix** — `email.ts` (`doSendEmail`) and `proposals.ts` (`doGenerateProposal`) use helper functions to avoid circular `any` inference.

═══════════════════════════════════════════════════════════════
PART 1.6: AUTHENTICATION — FORGOT PASSWORD (COMPLETED)
═══════════════════════════════════════════════════════════════

1. **Forgot Password Flow** — Added `/forgot-password` and `/reset-password` pages using Convex Auth's Password provider `reset` email configuration.
2. **Reset Code Delivery** — Generates a 32-character code, stores it in `authVerificationCodes`, and sends it via ZeptoMail through the existing `actions/email.sendEmail` internal action.
3. **UI Integration** — "Forgot password?" link on `/sign-in`, email pre-fill via query params on `/reset-password`, and 8-character minimum password validation.
4. **Env Configuration** — Requires `SITE_URL` (Convex env) for reset-callback URL construction and a valid `zeptomailApiKey` in Dashboard → Settings for email delivery.

═══════════════════════════════════════════════════════════════
PART 2: 6-PHASE BUILD ROADMAP
═══════════════════════════════════════════════════════════════

### PHASE 1: CONVEX FOUNDATION ⏱ Day 1–2

**Objective:** Replace the entire FastAPI/Celery/Supabase/Redis infrastructure
with a single Convex project. Auth, schema, CRUD, and frontend shell.

#    Task                Details
1.1  Init Convex         npx convex dev in project root. Creates /convex dir.
1.2  Define Schema       convex/schema.ts with all 8 defineTable() definitions
                         (universities, stakeholders, priorityScores,
                         universitySignals, outreachSequences, emailsSent,
                         replyLogs, proposals). Add indexes + vectorIndex
                         (dimensions: 768 for text-embedding-004).
1.3  Convex Native Auth  convex/auth.config.ts — email/password provider.
                         ConvexAuthNextjsServerProvider in app/layout.tsx.
                         convexAuthNextjsMiddleware() in middleware.ts.
1.4  CRUD Functions      convex/universities.ts, convex/stakeholders.ts etc.
                         Write query() and mutation() for all 8 tables.
1.5  Next.js 15 Shell    App Router: /app/(dashboard)/layout.tsx with sidebar.
                         Pages: universities, enrichment, outreach, proposals.
1.6  Env Vars            Set all secrets via `npx convex env set`:
                         ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, ZEPTOMAIL,
                         SERPER_API_KEY, CALENDLY keys, SENTRY_DSN.
1.7  Verify              Convex dashboard shows 8 tables. Auth works.
                         Frontend connects and shows empty university list.

---

### PHASE 2: DATA INGESTION & WEBSITE DISCOVERY ⏱ Day 2–3

#    Task                Details
2.1  CSV Parse Action    convex/actions/ingest.ts — parse CSV/XLSX bytes,
                         bulk insert via ctx.runMutation.
2.2  File Upload UI      Drag-and-drop upload → generateUploadUrl() → action.
2.3  Website Validator   Convex action: HTTP fetch → check 200 → update status.
2.4  Website Discovery   Convex action: Serper.dev REST → find university URL.
                         ctx.scheduler.runAfter() for retries.
2.5  Batch Dispatcher    Mutation: stagger-schedule discovery per university
                         (100ms gaps for rate limiting).

---

### PHASE 3: STAKEHOLDER EXTRACTION & ENRICHMENT ⏱ Day 3–5

**Scraping strategy (3-step, all free):**
  Step 1: Serper search `site:domain contact email` → check snippets for emails
  Step 2: fetch(url) → regex parse HTML (works ~70% of sites)
  Step 3: fetch(r.jina.ai/url) → Jina Reader → clean markdown (free, no key)

#    Task                Details
3.1  Scraper Action      convex/actions/scraper.ts — 3-step above. Returns
                         { emails, phones, contacts, source }.
3.2  Stakeholder Extract Parse scraper output → upsert stakeholders table.
3.3  LinkedIn Enrichment Serper.dev query → parse LinkedIn URL → update record.
3.4  News Signals        3x Serper.dev news queries → insert signals →
                         Google text-embedding-004 (768-dim) → store embedding.
3.5  Deterministic Score convex/lib/scoring.ts SCORING_FACTORS map → score.
3.6  AI Scoring          Gemini 3 Flash: feed signals → returns ai_score (0-10).
3.7  Enrichment Chain    Mutation: schedule 3.1→3.2→3.3→3.4→3.5→3.6 in order.
                         Each action schedules next on success.

---

### PHASE 4: OUTREACH AUTOMATION ENGINE ⏱ Day 5–8

#    Task                Details
4.1  Sequence Manager    createSequence mutation + processEmailStep action.
4.2  Email Action        ZeptoMail REST fetch → POST /v3/mail/send.
4.3  Email Templates     TypeScript template literals (convex/lib/emailTemplates.ts).
4.4  Personalization     Gemini 3 Flash → 2-sentence opener (implicit cache).
4.5  Cadence Cron        crons.ts: every hour → query due sequences → schedule.
4.6  Delivery Webhook    httpAction POST /webhooks/zeptomail → update emailsSent.
4.7  Inbound Reply       httpAction POST /webhooks/email-reply → save replyLogs.
4.8  Reply Classifier    Claude Sonnet 4.6 → classify into 7 categories
                         (explicit cache breakpoint on system prompt).
4.9  Action Dispatcher   Mutation: switch on classification → schedule next step.
4.10 Outreach Kanban     Real-time Kanban driven by useQuery on outreach_stage.

---

### PHASE 5: PROPOSALS ⏱ Day 8–10

#    Task                Details
5.1  Calendly Webhook    httpAction: HMAC verify → update stage → schedule agent.
5.2  Agenda Agent        Claude Sonnet 4.6 → meeting agenda from signals.
5.3  Proposal Agent      Vector search universitySignals (768-dim) → Claude
                         Sonnet 4.6 → structured JSON proposal (3 cache breakpoints).
5.4  Module Recommender  convex/lib/moduleRecommender.ts — rule-based selection.
5.5  PDF Generation      @react-pdf/renderer → PDF bytes → storage.store() →
                         store ID in proposals.pdf_storage_id.
5.6  Proposals Page      Card grid + PDF iframe + download + resend buttons.

---

### PHASE 6: HARDENING ⏱ Day 10–11

#    Task                Details
6.1  Sentry              @sentry/nextjs + Sentry.captureException() in catches.
6.2  Rate Limiting       Exponential backoff on Serper 429 via scheduler.runAfter.
6.3  Vercel Deploy       Connect repo → set NEXT_PUBLIC_CONVEX_URL as Vercel var.
6.4  Smoke Tests         Playwright: CSV upload → university appears → enrichment.
6.5  README              Update with setup instructions and env var list.

═══════════════════════════════════════════════════════════════
PART 3: CONVEX SCHEMA NOTES
═══════════════════════════════════════════════════════════════

See: convex/schema.ts (created in Phase 1.2)

Key points:
- UUIDs replaced by Convex native document IDs (v.id("tableName"))
- TIMESTAMPTZ replaced by v.number() (Unix ms timestamps)
- JSONB fields replaced by v.object({...}) with typed sub-schemas
- Vector embeddings: 768 dimensions (gemini-embedding-001, NOT 1536)
- No migrations needed — Convex handles DDL automatically

═══════════════════════════════════════════════════════════════
PART 4: ELIMINATED INFRASTRUCTURE
═══════════════════════════════════════════════════════════════

The following are permanently removed in v2:

- ❌ FastAPI (Python) — replaced by Convex Functions (TypeScript)
- ❌ Celery + Redis — replaced by Convex Cron + Scheduled Actions
- ❌ SQLAlchemy + asyncpg — replaced by Convex DB
- ❌ Supabase PostgreSQL — replaced by Convex DB
- ❌ Supabase Storage — replaced by Convex File Storage
- ❌ WeasyPrint — replaced by @react-pdf/renderer
- ❌ Jinja2 templates — replaced by TypeScript template strings
- ❌ Docker Compose — replaced by npx convex dev
- ❌ Fly.io (backend) — replaced by Convex Cloud
- ❌ Clerk — replaced by Convex Native Auth
- ❌ Browserbase — replaced by Firecrawl + Jina Reader + fetch() HTML parse
- ❌ OpenRouter — removed; direct Google AI Gemini API used
- ❌ OpenAI — removed; replaced by Google AI (Gemini + embeddings)
- ❌ Anthropic Claude — removed; proposals, reply classification, and scoring now use Gemini 3.5 Flash / Flash-Lite

═══════════════════════════════════════════════════════════════
Document End — Fretbox Outreach AI Roadmap v2.0 (Convex Edition)
