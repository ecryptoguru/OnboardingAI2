# CODEBASE MAP

This document serves as the central reference point for AI coding agents to navigate the `fretbox-outreach-v2` (OnboardingAI) repository.

## 🎯 Project Overview

**Fretbox Outreach AI v2 / OnboardingAI** is an AI-native outreach engine designed for university hostel management. It manages ingestion, discovery, deep data enrichment, multi-step personalized sequences, auto-reply handling, proposal automation with Google Calendar/Meet integration, and monitoring.

## 🏗 Tech Stack

- **Framework:** Next.js 15 (React 19, App Router)
- **Backend & Database:** Convex (Serverless functions, Real-time DB, Crons, Vector search)
- **Auth:** `@convex-dev/auth` with Password provider
- **Styling:** Tailwind CSS v3.4.1, Glassmorphism design system (see `design-system/onboardingai/MASTER.md`)
- **Icons:** Heroicons React
- **AI Models:** Google Gemini 3.5 Flash (complex tasks), Gemini 3.1 Flash-Lite (high-volume), `gemini-embedding-001` (768-dim embeddings). Uses direct `@google/genai` SDK.
- **External Services:**
  - SendGrid (Email dispatch & delivery tracking)
  - Serper (Web search & discovery)
  - Firecrawl (Web scraping & site mapping)
  - Jina Reader / fetch (Web scraping fallback)
  - Google Calendar API (Meeting creation, Meet links, push notifications)
  - UGC.gov.in (Indian university dataset proxy via `/api/sync-ugc`)
- **PDF:** `@react-pdf/renderer`
- **Testing:** Playwright (E2E) + tsx unit tests (`tests/unit/*.test.ts`)
- **Monitoring:** Sentry (`@sentry/nextjs` for frontend, `@sentry/node` for backend)

## 📂 Core Directory Structure

### `/app`

Next.js 15 App Router frontend.

- `/(auth)/`
  - `sign-in/page.tsx`: Sign-in page (Convex Auth Password, FormData-based, `redirectTo: "/dashboard"`)
  - `sign-up/page.tsx`: Sign-up page (same pattern)
- `/(dashboard)/`
  - `layout.tsx`: Dashboard shell with `<Sidebar />`, glassmorphism styling, theme support
  - `not-found.tsx`: Global 404 page
  - `dashboard/page.tsx`: Universities list & detail view with filters, search, CSV upload
  - `dashboard/enrichment/page.tsx`: Signal enrichment & scoring overview
  - `dashboard/analytics/page.tsx`: Pipeline analytics & KPIs
  - `dashboard/outreach/page.tsx`: Sequence management, reply inbox, email thread viewer
  - `dashboard/outreach/demo/page.tsx`: Outreach demo/visualization page
  - `dashboard/approvals/page.tsx`: Pending email approvals queue
  - `dashboard/proposals/page.tsx`: Generated proposals, PDF viewer, Google Calendar integration
  - `dashboard/settings/page.tsx`: System configuration — API keys (Gemini, Serper, Firecrawl, SendGrid, Google Calendar), toggles, enrichment controls
  - `dashboard/settings/components.tsx`: Reusable settings UI components (PasswordInput, TestResultAlert, StatusBadge)
- `/api/sync-ugc/route.ts`: Next.js proxy route for UGC.gov.in university data (rate-limited)
- `globals.css`: Global styles, Tailwind directives, glassmorphism CSS variables
- `layout.tsx`: Root layout with ConvexClientProvider, ThemeProvider, Sentry instrumentation
- `page.tsx`: Marketing / landing page
- `global-error.tsx`: Global error boundary

### `/convex`

The entire backend ecosystem (Queries, Mutations, Actions, HTTP routes, Crons).

- **Core Entities:**
  - `universities.ts`: CRUD, search, filtering, ingestion, UGC sync, discovery triggers. Also exposes internal helpers: `listAllInternal`, `patchInternal`, `deleteInternal`, `bulkSyncUgcInternal` for action-based batching.
  - `stakeholders.ts`: Contact management, enrichment, deduplication, email/LinkedIn tracking. Includes `dedupeSingletonRoleContactsInternal` for admin-role deduplication.
  - `signals.ts`: Signal ingestion, vector search, semantic retrieval
  - `proposals.ts`: Proposal CRUD, PDF storage, Calendar event linking
  - `sequences.ts`: Outreach sequence state machine (active/paused/completed/opted_out)
  - `emails.ts`: Email log CRUD, delivery status tracking, approval workflows
  - `replies.ts`: Reply log management, classification review
  - `priorityScores.ts`: Lead scoring storage (deterministic + AI + final composite)
  - `settings.ts`: System settings key-value store. **All API keys are DB-backed with obfuscation** (`geminiApiKey`, `serperApiKey`, `firecrawlApiKey`, `sendgridApiKey`, `googleCalendarJson`, `googleCalendarId`, `sendgridFromEmail`). Provides status queries, test actions, and internal getters with env fallbacks.
  - `rateLimits.ts`: Persistent rate-limiting for external APIs
  - `admin.ts`: Admin operations (e.g., `resetUniversityEnrichment`)
  - `dbReset.ts`: Database reset utilities
  - `removeDuplicates.ts`: Action-based duplicate cleanup (`removeFuzzyDuplicates`) — exact-match grouping by `(name, state)` with rich-record scoring and merge-before-delete.
  - `wipeEnrichment.ts`: Bulk enrichment data wiping
  - `test.ts` / `testDeep.ts`: Test endpoints

- **Infrastructure:**
  - `schema.ts`: Full database schema with auth tables, indexes, search indexes, vector index (768-dim)
  - `crons.ts`: Scheduled jobs — hourly outreach sequence processing, weekly proposal cleanup
  - `dispatcher.ts`: Staggered job scheduling for website validation/discovery
  - `http.ts`: Convex HTTP webhooks (SendGrid delivery, inbound replies, Google Calendar push, auth routes)
  - `auth.ts` / `auth.config.ts`: Convex Auth configuration (Password provider)

- `/actions/` (23 files)
  Heavy / side-effect serverless operations. **All action files must start with `"use node"`**:
  - `deepEnrichment.ts`: AI-based deep enrichment — external source discovery (Serper + Firecrawl), stakeholder extraction, demographics synthesis via Gemini. Uses `callGeminiWithUsage` for structured JSON output.
  - `discovery.ts`: University website discovery via Serper search, validation via HEAD/GET + Jina fallback, candidate ranking with owned-domain heuristics.
  - `scraper.ts`: Web content extraction via Jina Reader, Firecrawl fallback, Gemini Grounding fallback for blocked domains. Primary stakeholder extraction with regex fallback.
  - `enrichment.ts`: Social & media enrichment — LinkedIn, news, image signal discovery via Serper. Signal upsert with deduplication.
  - `inferContacts.ts`: Role-based contact inference from scraped email patterns. Merges inferred aliases with canonical singleton roles.
  - `scrapeAntiRagging.ts`: Anti-ragging committee page scraping for additional stakeholder discovery.
  - `enrichGovernmentData.ts`: Government data enrichment — NIRF/AISHE/NAAC source discovery, PDF extraction (pdf-parse + Jina + Gemini inline PDF), structured demographic extraction. **Includes Gemini Grounding fallback** for blocked .gov.in domains. Returns exact `llmUsage` per call.
  - `orchestrator.ts`: **Orchestrates the full enrichment chain** in strict phase order: Discovery → Phase 1 (scrape + antiRagging + social) → Phase 2 (contact inference) → Phase 3 (government data) → Phase 4 (deep enrichment) → Phase 5 (social refresh) → Phase 6 (scoring). Aggregates `llmUsage` from all sub-actions. Government data runs **before** deep enrichment to prevent write races on demographics.
  - `outreach.ts`: Multi-stage email sequence dispatch & cadence logic
  - `personalize.ts`: AI email copy generation with prompt injection sanitization
  - `scoring.ts`: Lead potential scoring (hostelites, NAAC, agility, digital signals, stakeholders, etc.)
  - `proposals.ts`: AI-generated PDF proposals & module recommendations
  - `replyClassifier.ts`: Inbound reply classification (meeting_request, positive_interest, opt_out, etc.)
  - `autoReply.ts`: Automated response sending for positive replies & meeting requests
  - `email.ts`: SendGrid email dispatch with retry logic
  - `ingest.ts`: CSV/UGC data ingestion helpers
  - `ugcSeed.ts`: UGC dataset seeding
  - `ugcSync.ts`: UGC synchronization action — in-memory strict matching, state-indexed candidate lookup, input deduplication, and batched writes via `bulkSyncUgcInternal` to avoid mutation timeouts.
  - `migrateEmbeddings.ts`: Embedding backfill for vector search
  - `realWorldVerify.ts`: Real-world pipeline verification
  - `liveTest.ts`: Live testing & recovery actions — `verifyUniversityDirect`, `recoverUniversityContacts`, `buildPriorityOutreachTable`, `repairUniversityStakeholders`. **Critical fix**: `verifyUniversityDirect` directly `await`s `runEnrichmentChain` without timeout-racing to prevent "outstanding action call" errors.
  - `listUniversities.ts`: University listing helpers

- `/lib/` (18 files)
  Shared backend utilities:
  - `llm.ts`: Gemini SDK wrappers (`callGemini`, `callGeminiWithUsage`, `callGeminiWithGrounding`, `callGeminiWithGroundingAndUsage`, `callFlash`, `embed`). **Exact cost tracking** via `createLlmUsageEntry` / `summarizeLlmUsage` using Gemini `usageMetadata`. Model constants (`MODELS`), temperature presets (`TEMP`), thinking budgets (`THINKING`). All calls use `httpOptions: { timeout: 25000 }`.
  - `prompts.ts`: Centralized prompt library for unified AI governance
  - `emailTemplates.ts`: Typed email template functions (intro, follow-up, auto-reply, proposal)
  - `proposalPdf.tsx`: React-PDF components for proposal generation
  - `googleCalendar.ts`: Google Calendar API integration (events, Meet links, watch channels)
  - `moduleRecommender.ts`: AI-driven module recommendation logic
  - `scrapers.ts`: Shared scraping helpers — `firecrawlMap`, `firecrawlScrape`, `downloadPdfBuffer`, `extractPdfText`, `extractPdfTables`. Firecrawl calls use body `timeout: 60000` + fetch `signal: AbortSignal.timeout(25000)`.
  - `scoring.ts`: Scoring algorithm utilities
  - `cadence.ts`: Outreach timing/cadence rules
  - `universityUtils.ts`: University data normalization helpers
  - `auth_utils.ts`: Convex Auth helper functions (`validateAuth`)
  - `utils.ts`: Shared utilities — `withRetry` (exponential backoff + `isTransientLlmError`), `withConcurrencyLimit`, `truncateAtNewline`, `sanitizeLlmInput`, `validateJsonOutput`, phone validation helpers.
  - `async.ts`: `raceWithTimeout` helper. **⚠️ Must NEVER be used with Convex `ctx.runAction(...)`** — it does not cancel the underlying promise and causes "outstanding action call" warnings.
  - `contactInference.ts`: Role-based institutional email inference. Normalizes domains, detects role-based aliases, canonicalizes singleton roles (Vice Chancellor → vc, Registrar → registrar, etc.).
  - `discoveryCandidates.ts`: Website discovery candidate ranking — owned-domain heuristics, hosted-portal detection (.edu.in, .gov.in, .ac.in), education-TLD scoring, deduplication.
  - `phone.ts`: Indian phone validation & normalization utilities.
  - `serperBudget.ts`: Serper query budget enforcement — `createSerperBudget`, `runWithSerperBudget` with hard caps and quota-exhaustion detection.
  - `stakeholderQuality.ts`: Stakeholder quality scoring — `isDecisionMakerRole`, `stakeholderRank`, deduplication heuristics, regex fallback extraction for emails/phones from raw text.

### `/components`

Shared React UI components:
- `ApiKeyModal.tsx`: API key input modal
- `ConvexClientProvider.tsx`: Convex client context provider (`verbose` mode gated to development)
- `Sidebar.tsx`: Dashboard navigation sidebar with badge counts (approvals + unclassified replies)
- `ErrorBoundary.tsx`: React error boundary
- `SyncUgcButton.tsx`: UGC sync trigger button
- `ThemeProvider.tsx` / `ThemeToggle.tsx`: Dark/light mode support
- `Toast.tsx`: Toast notification component
- `UniversityDetail.tsx`: Detailed university view modal/panel
- `UploadCsvButton.tsx`: CSV upload trigger

### `/tests`

- `e2e/approvals.spec.ts`: Approvals flow E2E tests
- `e2e/dashboard.spec.ts`: Dashboard navigation E2E tests
- `smoke.spec.ts`: Smoke tests
- `thorough.spec.ts`: Thorough E2E checks
- `unit/`: 26 unit test files covering:
  - Admin auth, anti-ragging persistence
  - `async.test.ts` — `raceWithTimeout` behavior, `serperBudget` caps
  - `cadence.test.ts` — Outreach timing rules
  - `contactInference.test.ts` — Email alias inference, role normalization
  - `discoveryCandidates.test.ts` — Candidate ranking, owned-domain heuristics, portal detection
  - `emailTemplates.test.ts` — Template rendering
  - `embed.test.ts` — **Hermetic**: skips live test without API key, tests zero-vector fallback
  - `googleCalendar.test.ts` — Calendar helper utilities
  - `llm.test.ts` — `createLlmUsageEntry` exact-cost logic, `summarizeLlmUsage` aggregation
  - `namesMatch.test.ts` — Name fuzzy matching
  - `orchestratorSequence.test.ts` — Phase ordering invariants (govData before deepEnrichment)
  - `rateLimit.test.ts` — Rate limiting behavior
  - `replyClassifier.test.ts` — Reply classification logic
  - `sanitize.test.ts` — LLM input sanitization
  - `scoring.test.ts` — Scoring algorithms
  - `scrapers.test.ts` — Scraping utilities
  - `stakeholderQuality.test.ts` — Quality scoring, deduplication
  - `stakeholders.test.ts` — Stakeholder CRUD
  - `toNum.test.ts` — Number parsing
  - `truncateAtNewline.test.ts` — Truncation logic
  - `universityUtils.test.ts` — University data normalization
  - `utils.test.ts` — General utilities
  - `validateJsonOutput.test.ts` — JSON validation
  - `webhookSecurity.test.ts` — Bearer token extraction
  - `withConcurrencyLimit.test.ts` — Concurrency limiting

### `/design-system`

- `onboardingai/MASTER.md`: Design system master file (Flat Design, Poppins + Open Sans, color palette, component specs, anti-patterns)

### `/docs`

- `PLAN.md`, `Requirement.md`, `roadmap.md`

### Root Config & Scripts

- `middleware.ts`: Next.js middleware — protects `/dashboard` routes and redirects authenticated users away from `/sign-in` / `/sign-up`.
- `next.config.ts`: Next.js configuration
- `tailwind.config.ts`: Tailwind theme config
- `playwright.config.ts`: Playwright E2E config
- `instrumentation.ts` / `instrumentation-client.ts`: Sentry instrumentation
- `generateKeys.mjs`, `setAuthKeys.mjs`, `setJwtKey.mjs`, `setConvexAuth.sh`: Auth key setup scripts
- `get_console_errors.ts`: Console error capture utility
- `netlify.toml` / `vercel.json`: Deployment configs
- `test_universities.csv` / `ugc_data_sample.json`: Sample data files

## ⚙️ Core Architectures & Patterns

### 1. Data Flow & AI Governance

Convex is the single source of truth. Discovery, Scraping, and Scoring use batching and retry logic (`withRetry` in `convex/lib/utils.ts`) inside `convex/actions/` before hydrating standard Convex database rows. `signals` are dynamic data points about a `university` or `stakeholder` that influence `scoring` and `personalization`.

All prompts are centralized in `convex/lib/prompts.ts`. Do not inline prompts inside actions.

### 2. LLM Usage Tracking & Exact Cost Accounting

Every Gemini call is tracked via `createLlmUsageEntry()` and `summarizeLlmUsage()` in `convex/lib/llm.ts`:
- Reads **exact token counts** from Gemini `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`)
- Falls back to char-length estimates only when metadata is absent
- Costs computed from `MODEL_PRICING_USD_PER_MILLION` (Flash-Lite: $0.25/$1.50 per million; Flash: $1.50/$9.00 per million)
- Aggregated at orchestrator level so `verifyUniversityDirect` reports per-unipeline LLM cost

### 3. Vector Search & RAG

`universitySignals` stores 768-dimensional embeddings (`gemini-embedding-001`) with a Convex `vectorIndex` (`by_embedding`). Enables semantic retrieval of news, LinkedIn, website, and image signals for personalized outreach and proposal generation.

### 4. Outreach Orchestrator

`convex/actions/orchestrator.ts` runs enrichment in **strict phase order** to prevent write races:
1. **Discovery** — find website if missing
2. **Phase 1** — scrape, anti-ragging, social discovery (parallel)
3. **Phase 2** — contact inference
4. **Phase 3** — government data enrichment (writes demographics)
5. **Phase 4** — deep enrichment (can augment demographics)
6. **Phase 5** — social refresh post-deep enrichment
7. **Phase 6** — scoring

Government data **must** run before deep enrichment because both write to `demographics`. The orchestrator aggregates `llmUsage` from every phase.

Sequences follow a deterministic state machine: Draft -> Scheduled -> Sent -> Replied/Bounced. Emails are dynamically generated via Gemini AI prompt injection using enrichment data. Auto-replies trigger for positive classifications with threaded `Message-ID` headers for conversation tracking.

### 5. API Key Management (DB-Backed)

All external API keys are stored in the `systemSettings` table with **XOR obfuscation** (not encryption) using `SETTINGS_OBFUSCATION_SECRET`:
- `geminiApiKey` — `getInternalGeminiKey` reads DB first, falls back to `GOOGLE_API_KEY` / `GEMINI_API_KEY`
- `serperApiKey` — `getInternalSerperKey` reads DB first, falls back to `SERPER_API_KEY`
- `firecrawlApiKey` — `getInternalFirecrawlKey` reads DB first, falls back to `FIRECRAWL_API_KEY`
- `sendgridApiKey` — `getInternalSendgridKey` reads DB first, falls back to `SENDGRID_API_KEY`

Each has: status query (`get*KeyStatus`), set mutation (`set*Key`), test action (`test*Key`), remove mutation (`remove*Key`), and internal setter (`set*KeyInternal`) for seeding. Keys are sanitized on read to strip control characters.

### 6. Webhook Hardening (HTTP Layer)

`convex/http.ts` handles inbound webhooks securely:
- **SendGrid delivery events:** HMAC-SHA256 signature verification, normalized message ID mapping to `emailsSent` status updates via internal mutations.
- **Inbound email replies:** Shared-secret auth, multi-layer context resolution (thread Message-ID -> email lookup -> sender email -> stakeholder lookup), then schedules `replyClassifier`.
- **Google Calendar push notifications:** Channel token verification for sync notifications.
- **Auth routes:** Convex Auth HTTP routes (sign-in, sign-out, session).

### 7. Auth & Middleware

- `@convex-dev/auth` with Password provider (`convex/auth.ts`).
- `middleware.ts` protects all non-public routes. Development auth bypass is supported via `DEV_AUTH_BYPASS_SECRET` but **never** active in production.

### 8. Design System

Flat design with glassmorphism accents. Fonts: Poppins (headings) + Open Sans (body). Primary `#3B82F6`, CTA/Accent `#F97316`. See `design-system/onboardingai/MASTER.md` for full specs.

## 🔗 File Dependency Rules (CRITICAL FOR AGENTS)

- **Database Mod:** Mutating `convex/schema.ts` necessitates checking all `convex/actions/*` and entity files for type safety (especially `deepEnrichment.ts`, `scoring.ts`, `proposals.ts`).
- **Prompt Mod:** Modifying `convex/lib/prompts.ts` often requires updates to parsing logic in `convex/actions/personalize.ts`, `convex/actions/deepEnrichment.ts`, `convex/actions/proposals.ts`, `convex/actions/replyClassifier.ts`.
- **Template Mod:** Changes to `convex/lib/emailTemplates.ts` may require updates in `convex/actions/autoReply.ts` or `convex/actions/outreach.ts`.
- **PDF Mod:** Changes to `convex/lib/proposalPdf.tsx` affect proposal rendering in `convex/actions/proposals.ts`.
- **LLM Mod:** Changes to `convex/lib/llm.ts` (model names, pricing, timeout) affect all actions that call Gemini. Ensure `settings.ts:testGeminiKey` uses `MODELS.gemini`.
- **Utils Mod:** Changes to `convex/lib/utils.ts` affect all actions that import it (scraper, enrichment, deepEnrichment, etc.). Be careful with Sentry imports (`@sentry/nextjs` vs `@sentry/node`) — `utils.ts` is imported by both frontend and backend contexts via generated types.
- **Discovery Mod:** Changes to `convex/lib/discoveryCandidates.ts` affect `discovery.ts` and `orchestrator.ts`.
- **Contact Inference Mod:** Changes to `convex/lib/contactInference.ts` affect `inferContacts.ts` and `scraper.ts`.
- **Frontend Mod:** When changing UI in `/app/(dashboard)/`, ensure Tailwind classes follow the glassmorphism system in `globals.css` and `tailwind.config.ts`. Check `design-system/onboardingai/MASTER.md` for constraints.
- **Package Mod:** When updating external SDKs, verify both Next.js frontend and Convex backend compatibility.

## 🛡 System Hardening Guidelines

1. **Exponential Backoff:** All external API hits in actions must use `withRetry` (`convex/lib/utils.ts`).
2. **Centralized Prompts:** Do not inline prompts inside actions; keep them in `convex/lib/prompts.ts`.
3. **Internal Mutations:** Webhook handlers in `convex/http.ts` must use internal mutations (not direct DB writes) to keep logic centralized and auditable.
4. **SendGrid ID Persistence:** Always store normalized `sendgrid_message_id` in `emailsSent` for delivery event correlation.
5. **Sentry Logging:** Ensure AI failures have structured payload logs.
6. **Environment Variables:** Only `CONVEX_*`, `NEXT_PUBLIC_*`, and `SETTINGS_OBFUSCATION_SECRET` should live in `.env`. All API service keys belong in the DB via Settings page.
7. **Rate Limiting:** Use `rateLimits` table + `withConcurrencyLimit` for external API call throttling.
8. **Serper Budget:** Use `createSerperBudget` / `runWithSerperBudget` from `convex/lib/serperBudget.ts` to enforce per-university query caps and detect quota exhaustion.
9. **Timeout Safety:** All Gemini SDK calls use `httpOptions: { timeout: 25000 }`. All `fetch()` calls use `AbortSignal.timeout(...)`. Do **not** wrap `ctx.runAction(...)` in `raceWithTimeout`.
10. **API Key Validation:** Sanitize keys with `sanitizeApiKey()` before use to strip control characters that break HTTP headers.

## 🏃‍♂️ Useful Commands

- **Dev Console:** `npm run dev` starts both Convex and Next.js concurrently.
- **Dev Split:** `npm run dev:next` or `npm run dev:convex` for individual services.
- **Test (E2E):** `npm run test` — Playwright tests.
- **Test (Unit):** `npm run test:unit` — tsx unit tests (239 tests, hermetic — no API keys required).
- **Lint:** `npm run lint` — ESLint.
- **Build:** `npm run build` — Next.js production build.
- **Convex Dashboard:** `npx convex dev` opens the Convex dashboard for manual review of events, logs, and cron jobs.
- **Type Check:** `npx tsc --noEmit --project convex/tsconfig.json` — Convex backend type checking.
