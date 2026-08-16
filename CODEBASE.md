# Fretbox Outreach AI v2 — Codebase Map

This document is the central reference for navigating the `fretbox-outreach-v2` (OnboardingAI) repository. It is meant to be kept in sync with the code. See [README.md](./README.md) for a higher-level overview and [convex/README.md](./convex/README.md) for Convex-specific conventions.

## Project Overview

**Fretbox Outreach AI v2 / OnboardingAI** is an AI-native outreach engine for university hostel management. It handles ingestion, discovery, deep data enrichment, multi-step personalized sequences, human-in-the-loop (HITL) email approval, auto-reply handling, proposal automation with Google Calendar/Meet integration, and monitoring.

## Tech Stack

- **Framework:** Next.js 16.3.1 (Webpack-pinned via `--webpack`), React 19, App Router. The legacy `middleware.ts` / `proxy.ts` edge middleware was removed; dashboard auth protection is now client-side via `components/AuthGuard.tsx`.
- **Backend & Database:** Convex `^1.42.1` (serverless queries/mutations/actions, real-time DB, HTTP actions, crons, vector search, scheduler)
- **Auth:** `@convex-dev/auth` `^0.0.95` with Password provider and password-reset email config; `@auth/core` `^0.41.3`
- **Styling:** Tailwind CSS `^3.4.1`, glassmorphism / flat design system in `design-system/onboardingai/MASTER.md`
- **Icons:** Heroicons React
- **AI Models:** Google Gemini via `@google/genai` `^1.43.0`. Model allocation in `convex/lib/models.ts`:
  - `gemini-3.7-flash` — complex reasoning, per-source extraction, partial-merge, proposals, general Gemini calls (thinking level `LOW`; `MINIMAL` is rejected by 3.7).
  - `gemini-3.5-flash-lite` — scraper extraction, government-data extraction, scoring, personalization, and other high-volume/low-cost paths.
  - `gemini-embedding-001` — 768-dim embeddings (unchanged).
- **LLM Guardrails:** Daily budget tracking (`llmBudget` table) + deterministic response cache (`llmCache` table). Default budget `$50/day`; configurable via `LLM_DAILY_BUDGET_USD`. Gemini 3.7 pricing: `$0.75/$3.75` per million (input/output) through 2026-12-31; thinking tokens counted in `candidatesTokenCount` + `thoughtsTokenCount`.
- **PDF extraction:** `unpdf` `^1.8.1` (serverless-safe PDF.js build). Replaces worker-dependent `pdfjs-dist`. Used by `convex/lib/scrapers.ts` (`extractPdfText`, `extractPdfTables`) and `convex/actions/enrichGovernmentData.ts`.
- **External Services:**
  - ZeptoMail (transactional email, delivery tracking, inbound reply routing)
  - Serper (web search, ≤14 queries/university, budget-enforced via `convex/lib/serperBudget.ts`)
  - Firecrawl (scraping / site maps, ≤8 credits/university, Jina fallback on exhaustion)
  - Jina Reader / `fetch` (scraping fallback)
  - Google Calendar API (events, Meet links, push notifications)
  - UGC.gov.in (Indian university dataset proxy via `app/api/sync-ugc/route.ts`)
- **Proposal rendering:** Rich HTML emails (legacy `pdf_storage_id` field in schema)
- **Testing:** Playwright E2E (`tests/e2e`, baseURL `http://localhost:3000`) + tsx unit tests (`tests/unit/*.test.ts`, ~496 tests)
- **Monitoring:** Sentry (`@sentry/nextjs` frontend, `@sentry/node` backend)

## Core Directory Structure

### `/app`

Next.js 15 App Router frontend.

- `/(auth)/`
  - `sign-in/page.tsx`: Sign-in page (Convex Auth Password, FormData-based, `redirectTo: "/dashboard"`)
  - `sign-up/page.tsx`: Sign-up page (same pattern)
  - `forgot-password/page.tsx`: Requests a password reset code via `signIn("password", { flow: "reset" })`
  - `reset-password/page.tsx`: Code + new password entry via `signIn("password", { flow: "reset-verification" })`, pre-fills email from query params
- `/(dashboard)/`
  - `layout.tsx`: Dashboard shell wrapping children in `<AuthGuard>`, `<Sidebar />`, glassmorphism styling, theme support, and `<ApiAlertModal />`
  - `dashboard/page.tsx`: Universities list & detail view with filters, search, CSV upload, and the `Sync IITs / NITs / IIITs` button (`<SyncIniButton />`)
  - `dashboard/enrichment/page.tsx`: Signal enrichment & scoring overview
  - `dashboard/analytics/page.tsx`: Pipeline analytics & KPIs
  - `dashboard/outreach/page.tsx`: Sequence management, reply inbox, email thread viewer
  - `dashboard/outreach/demo/page.tsx`: Outreach demo/visualization page
  - `dashboard/approvals/page.tsx`: Pending email approvals queue (HITL)
  - `dashboard/proposals/page.tsx`: Generated rich HTML proposals, Google Calendar integration. Proposal cards show meeting status (Confirmed / Pending / Not Scheduled) and an "Open Meet Link" when available. Includes "Confirm Meeting & Create Meet Link" / "Reschedule Meeting" actions that open a datetime + duration picker. Calls `api.actions.proposals.confirmMeeting`.
  - `dashboard/settings/page.tsx`: System configuration — API keys, toggles, enrichment controls
  - `dashboard/settings/components.tsx`: Reusable settings UI components (`PasswordInput`, `TestResultAlert`, `StatusBadge`, `cleanConvexError`, `getErrorMessage`)
  - `dashboard/settings/ApiKeySection.tsx`: Per-key settings section
- `/api/sync-ugc/route.ts`: Next.js proxy route for UGC.gov.in university data (rate-limited)
- `not-found.tsx`: Global 404 page
- `globals.css`: Global styles, Tailwind directives, glassmorphism CSS variables, blue brand scale
- `layout.tsx`: Root layout with `ConvexClientProvider`, `ThemeProvider`, Sentry instrumentation
- `page.tsx`: Marketing / landing page. Renders instantly without a blocking loading spinner. Uses `<RedirectIfAuthenticated />` to redirect authenticated users to `/dashboard`.
- `global-error.tsx`: Global error boundary

### `/convex`

The entire backend ecosystem (queries, mutations, actions, HTTP routes, crons).

- **Core Entities:**
  - `universities.ts`: CRUD, search, filtering, ingestion, UGC sync, discovery triggers, and internal helpers (`listAllInternal`, `patchInternal`, `deleteInternal`, `bulkSyncUgcInternal`, `bulkSyncCuratedInternal`, `updateOutreachStageInternal`, `updateEnrichmentProgressInternal`, `getInternal`). Curated INI records are protected from UGC sync.
  - `stakeholders.ts`: Contact management, enrichment, deduplication, email/LinkedIn tracking. Includes `dedupeSingletonRoleContactsInternal` (singleton-role enforcement with `Offg.` / `I/c` / `Acting` suffix normalization) and filters out UGC placeholder stakeholders with no real contact info.
  - `signals.ts`: Signal ingestion, vector search, semantic retrieval
  - `proposals.ts`: Proposal CRUD, rich HTML proposal generation, Calendar event linking
  - `sequences.ts`: Outreach sequence state machine (`active` / `paused` / `pending_approval` / `completed` / `opted_out`)
  - `emails.ts`: Email log CRUD, delivery status tracking, HITL approval queue (`pendingCount`, `listPending`, `updateDraft`, `rejectDraft`, `updateStatusByZeptomailIdInternal`)
  - `replies.ts`: Reply log management, classification review
  - `priorityScores.ts`: Lead scoring storage (deterministic + AI + final composite)
  - `apiAlerts.ts`: Provider quota/error alert store. `recordInternal` (internalMutation) deduplicates identical unacknowledged alerts for 6 hours. `list` / `acknowledge` / `acknowledgeAll` are public + `validateAuth`-gated. Surfaced in the frontend by `components/ApiAlertModal.tsx`.
  - `settings.ts`: System settings key-value store. API keys are stored in the `systemSettings` table with XOR obfuscation (`SETTINGS_OBFUSCATION_SECRET`). Provides `getObfuscationSecretStatus`, status queries, set/remove mutations, test actions, and internal getters with env fallbacks.
  - `rateLimits.ts`: Distributed persistent rate limiter used by external API calls and email dispatch
  - `admin.ts`: Admin operations (`resetUniversityEnrichment` — admin-gated) + CLI ops `clearAllAuthSessions` and `clearAuthVerificationCodes` (internalMutation — force-logout all users / purge stale reset codes after a JWT key rotation; run via `npx convex run 'admin:<name>'`)
  - `users.ts`: Basic user listing/count queries
  - `dbReset.ts`: Database reset utilities
  - `wipeAllData.ts`: Danger-zone wipe helpers (`wipeEverything`, `wipeUniversityInternal`)
  - `wipeEnrichment.ts`: Bulk enrichment data wiping
  - `removeDuplicates.ts`: Action-based duplicate cleanup (`removeFuzzyDuplicates`)
  - `test.ts`: Test endpoints / helpers

- **Infrastructure:**
  - `schema.ts`: Full database schema with auth tables, indexes, search indexes, vector index (`gemini-embedding-001`, 768-dim). Defines `llmBudget`, `llmCache`, `apiAlerts` (provider quota/error alerts, 6h dedup), `universities.category` (`IIT` | `NIT` | `IIIT`), `universities.data_source` (`ugc` | `curated` | `csv` | `manual`), and enrichment-progress fields on `universities` (`enrichment_status`, `enrichment_phase`, `enrichment_started_at`, `enrichment_finished_at`).
  - `crons.ts`: Scheduled jobs — outreach sequence processing every **15 minutes**, weekly proposal cleanup (30 days)
  - `dispatcher.ts` / `dispatcherInternal.ts`: Staggered job scheduling for website validation / discovery
  - `http.ts`: Convex HTTP actions. Webhooks run on the **Convex site URL** (`https://*.convex.site`, `NEXT_PUBLIC_CONVEX_SITE_URL`), not the API URL.
  - `auth.ts` / `auth.config.ts`: Convex Auth configuration (Password provider with a `reset` email provider for password-reset codes, plus `checkEmailExists` query)

- **`/actions/` (24 files)**
  Heavy / side-effect serverless operations. **All action files must start with `"use node"`**:
  - `iniSeed.ts`: Seeds the 80-curated Institutes of National Importance (IIT/NIT/IIIT) list from `convex/lib/institutesOfNationalImportance.ts`. Exports `syncInstitutesOfNationalImportance` (public) and `syncInstitutesOfNationalImportanceInternal` (internal). Curated records get `data_source: "curated"` and are protected from UGC sync.
  - `deepEnrichment.ts`: AI-based deep enrichment — Firecrawl map (≤8 credits) + Serper external search (≤14 queries) + bounded fetches + per-source Gemini 3.7 Flash extraction + Flash merge. Singleton-role enforcement and gap-fill are applied post-extraction. Splits into a scheduled `finishEnrichmentChainInternal` for phases 5–6 to stay within Convex action runtime limits. Records Firecrawl/Serper quota errors to `apiAlerts`.
  - `discovery.ts`: University website discovery via Serper, validation via HEAD/GET + Jina fallback, candidate ranking with owned-domain heuristics.
  - `scraper.ts`: Web content extraction via Jina Reader, Firecrawl fallback, Gemini Grounding fallback. Primary stakeholder extraction with regex fallback. Records Serper quota errors to `apiAlerts`.
  - `enrichment.ts`: Social & media enrichment — LinkedIn, news, image signal discovery via Serper (cooldown-gated, no image search). Records Serper quota errors to `apiAlerts`.
  - `inferContacts.ts`: Role-based contact inference from scraped email patterns.
  - `scrapeAntiRagging.ts`: Anti-ragging committee page scraping for additional stakeholder discovery.
  - `enrichGovernmentData.ts`: Government data enrichment — NIRF/AISHE/NAAC source discovery, `unpdf` PDF extraction (`extractPdfText` / `extractPdfTables`), deterministic regex fallback, Round-2 NAAC/university-site search, Gemini grounding last-resort fallback. Records Serper quota errors to `apiAlerts`. Does not fabricate demographics when no official numeric data exists.
  - `orchestrator.ts`: Orchestrates the full enrichment chain in strict phase order. Exports the scheduler-based entrypoints `scheduleEnrichmentInternal` (single university), `scheduleEnrichmentBatch` (sequential queue), `runEnrichmentChainInternal` (phases 1–4), and `finishEnrichmentChainInternal` (phases 5–6 + queue chaining). See "Enrichment Pipeline" below for the full phase list and the rationale for splitting long runs across scheduled actions.
  - `stakeholderCleanup.ts`: Cleanup actions for stale/scraper-only records and provenance self-consistency (sets `phone_source` / `linkedin_source` to `"none"` when values are stripped).
  - `outreach.ts`: Multi-stage email sequence dispatch. `processDueSequences` batches up to **100** sequences with **250 ms** stagger. Emails are drafted as `pending_approval` (HITL); they are not sent until a human approves.
  - `personalize.ts`: AI email copy generation with prompt injection sanitization and output cleaning.
  - `scoring.ts`: Lead potential scoring using university-specific signals.
  - `proposals.ts`: AI-generated proposals. Exports `generateProposal`, `confirmMeeting`, `cancelMeeting`, and `emailProposal` (rich HTML email via ZeptoMail, step `100`).
  - `replyClassifier.ts`: Inbound reply classification. Low-confidence high-stakes classifications (`meeting_request`, `positive_interest`) block auto-reply and require human review.
  - `autoReply.ts`: Automated response sending for positive replies & meeting requests. Exports `sendAutoReply` (internal) which calls `email.sendEmail`.
  - `email.ts`: ZeptoMail email dispatch. Exports `sendEmail` (internal) and `approveAndSend` (public HITL action). Used by `auth.ts` password reset, `autoReply`, and `proposals.emailProposal`.
  - `ingest.ts`: CSV/UGC data ingestion helpers
  - `ugcSeed.ts`: UGC dataset seeding
  - `ugcSync.ts`: UGC synchronization action — strict in-memory matching, input deduplication, batched writes. Never overwrites `data_source === "curated"` records.
  - `migrateEmbeddings.ts`: Embedding backfill for vector search
  - `realWorldVerify.ts`: Real-world pipeline verification (`runFullPipeline`)
  - `liveTest.ts`: Live testing & recovery actions
  - `listUniversities.ts`: University listing helpers

### Action Visibility & Authentication

- **Public actions** (`action(...)`) are exposed to the frontend and **must** call `await validateAuth(ctx)` at the top of the handler. Examples: `actions/proposals.confirmMeeting`, `actions/proposals.cancelMeeting`, `actions/proposals.emailProposal`, `actions/proposals.generateProposal`, `actions/replyClassifier.classifyReply`, `actions/email.approveAndSend`, `actions/iniSeed.syncInstitutesOfNationalImportance`.
- **Internal actions** (`internalAction(...)`) are callable only by the Convex scheduler, crons, webhooks, or other server functions. Call via `ctx.runAction(internal.actions.<module>.<name>, args)`. Examples: `actions/email.sendEmail`, `actions/orchestrator.runEnrichmentChainInternal`, `actions/replyClassifier.classifyReplyInternal`, `actions/outreach.processSequenceStep`, `actions/autoReply.sendAutoReply`, `actions/liveTest.*`.
- **Do not call `api.actions.*` from internal code.** All internal callers use `internal.actions.*` or `internal.<module>.*`.
- **Avoid circular type inference:** extract shared action logic into `do*` helper functions (`doSendEmail`, `doGenerateProposal`) called by both the internal and public wrappers.
- `actions/outreach.ts` schedules `processSequenceStep` recursively for multi-step sequences, using `ctx.scheduler.runAfter(0, internal.actions.outreach.processSequenceStep, ...)`. Batch cap is 100 sequences per cron run with 250 ms stagger.

### `/lib/` (24 files)

Shared backend utilities:

- `models.ts`: Centralized model, temperature, and thinking-budget constants (`MODELS`, `TEMP`, `THINKING`, `THINKING_LEVEL`). Imported by `llm.ts` and `settings.ts` (both can safely reference it because it has no `"use node"` directives).
- `llm.ts`: Gemini SDK wrappers (`callGemini`, `callGeminiWithUsage`, `callGeminiWithGrounding`, `callGeminiWithGroundingAndUsage`, `callFlash`, `embed`). Exact cost tracking (Gemini 3.7 pricing `$0.75/$3.75` per million; thinking tokens counted via `thoughtsTokenCount`), 48h `llmCache`, daily `llmBudget` guard. Gemini 3.x models get `thinkingConfig: { thinkingBudget: "LOW" }` (3.7 rejects `MINIMAL`). All calls use `httpOptions: { timeout: 25000 }`. Gemini quota/rate-limit errors are caught centrally and recorded to `apiAlerts`.
- `llmBudget.ts`: Internal queries/mutations for daily LLM budget and response cache.
- `prompts.ts`: Centralized prompt library.
- `emailTemplates.ts`: Typed email template functions (intro, follow-up, auto-reply, proposal).
- `proposalPdf.tsx`: Legacy React-PDF components (proposals are now sent as rich HTML emails).
- `googleCalendar.ts`: Google Calendar API integration (events, Meet links, watch channels).
- `moduleRecommender.ts`: AI-driven module recommendation logic.
- `scrapers.ts`: Shared scraping helpers — `firecrawlMap`, `firecrawlScrape`, `downloadPdfBuffer`, `extractPdfText` (unpdf), `extractPdfTables` (unpdf). PDF extraction uses `unpdf` (serverless-safe PDF.js build); the legacy `pdfPolyfills.ts` and `pdfjs-dist` dependency have been removed.
- `scoring.ts`: Scoring algorithm utilities.
- `cadence.ts`: Outreach timing/cadence rules.
- `universityUtils.ts`: `namesMatch()` — normalized fuzzy name matcher for university deduplication, with stop-word, acronym, and campus/branch filtering.
- `institutesOfNationalImportance.ts`: Curated 80-record list of IITs/NITs/IIITs used by `actions/iniSeed.ts`.
- `auth_utils.ts`: `validateAuth` and admin helpers.
- `utils.ts`: Shared utilities — `withRetry`, `withConcurrencyLimit`, `truncateAtNewline`, `sanitizeLlmInput`, `sanitizeLlmOutput`, `validateJsonOutput`, `parseJsonResponse` (robust LLM-JSON parsing: raw → fence-stripped → balanced-extraction), phone helpers.
- `async.ts`: `raceWithTimeout` helper. **Must NEVER wrap `ctx.runAction(...)`**.
- `contactInference.ts`: Role-based institutional email inference and canonical singleton roles.
- `discoveryCandidates.ts`: Website discovery candidate ranking.
- `phone.ts`: Indian phone validation & normalization.
- `serperBudget.ts`: Serper query budget enforcement (`createSerperBudget` / `runWithSerperBudget`).
- `stakeholderQuality.ts`: Stakeholder quality scoring and regex fallback extraction.
- `roleRegistry.ts`: Canonical role names, aliases, and decision/singleton flags used by singleton enforcement and gap-fill.
- `perSourceExtraction.ts`: Map-reduce per-source extraction used by `deepEnrichment.ts`.
- `validateDeepEnrichment.ts`: Structured output validation, provenance helpers, and acting-suffix normalization (`Offg.` / `I/c` / `Acting`) for singleton-role deduplication.
- `gapFill.ts`: Gap-fill for missing VC/Registrar roles. Free passes first (officers-table extraction, NIRF officer extraction, thin-site snippet fallback), Serper last. `verifyNameRoleProximity` guards against false positives from department pages.

### `/components`

Shared React UI components:

- `ApiKeyModal.tsx`: API key input modal
- `ApiAlertModal.tsx`: Global modal surfaced when a provider (Gemini / Firecrawl / Serper) hits quota exhaustion or an error during any background activity. Subscribes to `api.apiAlerts.list`, shows the latest unacknowledged alert, and offers Dismiss (session-only) / Got-it (persists `acknowledged_at`). Mounted in `app/(dashboard)/layout.tsx`.
- `AuthGuard.tsx`: Client-side auth guard. Uses `useConvexAuth` + `next/navigation` `useRouter` to redirect unauthenticated users to `/sign-in`. Shows a loading spinner while auth state resolves. Wraps the dashboard layout. Replaces the deleted edge middleware (`proxy.ts`).
- `ConvexClientProvider.tsx`: Convex client context provider. Falls back to the production Convex URL (`https://energetic-raven-535.convex.cloud`) when `NEXT_PUBLIC_CONVEX_URL` is not set, so the app works on any host without extra env configuration.
- `DocumentMailerModal.tsx`: Upload a `.docx`, optionally attach extra files, choose a stakeholder or custom email per university, and draft to the HITL queue.
- `Sidebar.tsx`: Dashboard navigation sidebar with badge counts (approvals + unclassified replies)
- `ErrorBoundary.tsx`: React error boundary
- `RedirectIfAuthenticated.tsx`: Redirects authenticated users away from auth pages.
- `SyncIniButton.tsx`: `Sync IITs / NITs / IIITs` trigger (`api.actions.iniSeed.syncInstitutesOfNationalImportance`)
- `SyncUgcButton.tsx`: UGC sync trigger
- `ThemeProvider.tsx` / `ThemeToggle.tsx`: Dark/light mode support
- `Toast.tsx`: Toast notification component
- `UniversityDetail.tsx`: Detailed university view modal/panel
- `UploadCsvButton.tsx`: CSV upload trigger

### `/tests`

- `e2e/`: Playwright E2E specs (22 files, baseURL `http://localhost:3000`). Includes `approvals`, `auth`, `dashboard`, `enrichment`, `landing`, `navigation`, `proposals`, `settings`, `responsive`, `smoke`, `thorough`, and authenticated workflows. Navigation tests wait for client-side `AuthGuard` redirect (`waitForURL`). Responsive tests target the landing page and auth pages (not the dashboard, which requires authentication).
- `unit/`: 39+ hermetic unit test files (~496 tests, no API keys required) covering:
  - Admin auth, anti-ragging persistence
  - `async.test.ts` — `raceWithTimeout`, `serperBudget` caps
  - `budgetEnvVar.test.ts` — `LLM_DAILY_BUDGET_USD` parsing
  - `cadence.test.ts` — Outreach timing rules
  - `checkEmailExists.test.ts` — email normalization
  - `contactInference.test.ts` — email alias inference, role normalization
  - `discoveryCandidates.test.ts` — candidate ranking, owned-domain heuristics, portal detection
  - `emailTemplates.test.ts` — template rendering
  - `embed.test.ts` — hermetic embedding / zero-vector fallback
  - `enrichmentHash.test.ts` — LLM cache hashing
  - `googleCalendar.test.ts` — calendar helper utilities
  - `hashPrompt.test.ts` — prompt hash stability
  - `iniSeed.test.ts` — INI seed normalizers and scoring
  - `latencyWarning.test.ts` — LLM latency thresholds
  - `llm.test.ts` — `createLlmUsageEntry`, `summarizeLlmUsage`
  - `modelFallback.test.ts` — model selection
  - `namesMatch.test.ts` — name fuzzy matching
  - `obfuscation.test.ts` — XOR obfuscation round-trips
  - `orchestratorSequence.test.ts` — phase ordering invariants
  - `rateLimit.test.ts` — rate limiting behavior
  - `replyClassifier.test.ts` — reply classification logic
  - `replyInputCap.test.ts` — reply size guards
  - `sanitize.test.ts` — LLM input/output sanitization
  - `scoring.test.ts` — scoring algorithms
  - `scrapers.test.ts` — scraping utilities
  - `settingsEnv.test.ts` / `settingsErrorDisplay.test.ts` — env-var V8 bug regression and `cleanConvexError`
  - `stakeholderQuality.test.ts` — quality scoring, deduplication
  - `stakeholders.test.ts` — stakeholder CRUD
  - `timingSafeEqual.test.ts` — constant-time comparison
  - `toNum.test.ts` — number parsing
  - `truncateAtNewline.test.ts` — truncation logic
  - `universityUtils.test.ts` — university data normalization
  - `utils.test.ts` — general utilities
  - `validateJsonOutput.test.ts` — JSON validation
  - `webhookSecurity.test.ts` — bearer token extraction, HMAC verification
  - `withConcurrencyLimit.test.ts` — concurrency limiting
  - `zeptomailWebhook.test.ts` — ZeptoMail webhook signature, event mapping, ID correlation
- `run-unit-tests.mjs`: Optional helper for running unit tests.

### `/design-system`

- `onboardingai/MASTER.md`: Design system master file (Flat Design, Poppins + Open Sans, color palette, component specs, anti-patterns)

### `/docs`

- `PLAN.md`, `Requirement.md`, `roadmap.md`

### Root Config & Scripts

- `next.config.ts`: Next.js 16 configuration. The obsolete `eslint` config property was removed (lint is enforced via the npm script). Custom webpack config is preserved for production builds (`npm run build` passes `--webpack`); `next dev` runs on Turbopack. The legacy `middleware.ts` / `proxy.ts` edge middleware was removed; auth protection is now client-side via `AuthGuard`.
- `tailwind.config.ts`: Tailwind theme config (blue brand scale; banned violet references removed)
- `playwright.config.ts`: Playwright E2E config (`testDir: "./tests/e2e"`, `baseURL: "http://localhost:3000"`, `workers: 1`)
- `instrumentation.ts` / `instrumentation-client.ts`: Sentry instrumentation
- `generateKeys.mjs`, `setAuthKeys.mjs`, `setJwtKey.mjs`, `setConvexAuth.sh`: Auth key setup scripts
- `get_console_errors.ts`: Console error capture utility
- `vercel.json`: Vercel deployment config — pins the `@vercel/next` builder (CLI framework detection is unreliable for Next.js 16 and falls back to a static build) and security headers incl. a CSP with `wss://*.convex.cloud` (required for the Convex realtime connection)
- `vercel.json`: Vercel deployment config
- `.devin/scripts/checklist.py`: Master validation checklist runner
- `test_universities.csv` / `ugc_data_sample.json`: Sample data files

## Core Architectures & Patterns

### 1. Data Flow & AI Governance

Convex is the single source of truth. Discovery, scraping, and scoring use batching and retry logic (`withRetry` in `convex/lib/utils.ts`) inside `convex/actions/` before hydrating standard Convex database rows. `signals` are dynamic data points about a `university` or `stakeholder` that influence `scoring` and `personalization`.

All prompts are centralized in `convex/lib/prompts.ts`. Do not inline prompts inside actions.

### 2. LLM Usage Tracking, Cost Guardrails & Response Caching

Every Gemini call is tracked via `createLlmUsageEntry()` and `summarizeLlmUsage()` in `convex/lib/llm.ts`:

- Reads exact token counts from Gemini `usageMetadata` (`promptTokenCount`, `candidatesTokenCount`, and `thoughtsTokenCount` for Gemini 3.x thinking tokens)
- Falls back to char-length estimates only when metadata is absent
- Costs computed from `MODEL_PRICING_USD_PER_MILLION` (Gemini 3.7 Flash: `$0.75/$3.75` per million through 2026-12-31, then `$1.50/$7.50`; Flash-Lite: `$0.25/$1.50` per million). Thinking tokens are billed at the output rate.
- Gemini 3.x models receive `thinkingConfig: { thinkingBudget: "LOW" }` (3.7 rejects `MINIMAL`).
- Aggregated at the orchestrator level

Three guardrails are applied automatically when `ctx` is passed to any LLM wrapper:

1. **Cache lookup** (`llmCache` table, 48h TTL): Deterministic prompts with identical `(model, temperature, systemPrompt, userPrompt)` return cached responses at zero cost. Dynamic/personalized calls **must** pass `skipCache: true` (enforced in all university-specific actions).
2. **Budget check** (`llmBudget` table): Daily soft cap (default `$50`, configurable via `LLM_DAILY_BUDGET_USD`). Concurrent calls may slightly exceed under burst load.
3. **Spend recording**: Actual cost is persisted after each call for auditability.

### 3. Vector Search & RAG

`universitySignals` stores 768-dimensional embeddings (`gemini-embedding-001`) with a Convex `vectorIndex` (`by_embedding`). Enables semantic retrieval of news, LinkedIn, website, and image signals for personalized outreach and proposal generation.

### 4. Enrichment Pipeline

`convex/actions/orchestrator.ts` runs enrichment in strict phase order to prevent write races. Long runs are split across scheduled actions so no single action exceeds the Convex runtime limit and the CLI client (~5-minute wait) never blocks the chain.

**Entrypoints (scheduler-based):**

- `scheduleEnrichmentInternal` (single university) — marks `outreach_stage: "enriching"`, sets `enrichment_status: "running"`, schedules `runEnrichmentChainInternal`, returns immediately.
- `scheduleEnrichmentBatch` (sequential queue) — schedules the first university's `runEnrichmentChainInternal` with the rest of the queue; each chain schedules the next on completion so Firecrawl/Serper are never hit concurrently.
- `runEnrichmentChainInternal` — phases 1–4 (below), then schedules `finishEnrichmentChainInternal`.
- `finishEnrichmentChainInternal` — phases 5–6, credit telemetry, progress completion, and sequential queue chaining.

**Phase order:**

1. **Discovery** — find website if missing
2. **Phase 1** — scrape, anti-ragging, social discovery (parallel)
3. **Phase 2** — contact inference
4. **Phase 3** — government data enrichment (writes demographics; `unpdf` for PDFs; NIRF → AISHE → Round-2 NAAC/site → Gemini grounding fallback)
5. **Phase 4** — deep enrichment (Firecrawl map ≤8 credits → Serper ≤14 queries → bounded fetches → per-source Gemini 3.7 Flash extraction → Flash merge → singleton enforcement → gap-fill for missing VC/Registrar)
6. **Phase 5** — social refresh post-deep enrichment (cooldown-gated, no image search)
7. **Phase 6** — scoring

Government data **must** run before deep enrichment because both write to `demographics`.

**Singleton-role enforcement** (`stakeholders.dedupeSingletonRoleContactsInternal` + `lib/validateDeepEnrichment.ts`): normalizes `Offg.` / `Officiating` / `Acting` / `i/c` suffixes (including punctuation inside parentheses and space-separated suffixes like `Registrar i/c`) so acting duplicates of the same person collapse into one record while the original role label is preserved.

**Gap-fill** (`lib/gapFill.ts`): when VC/Registrar is missing after deep enrichment, runs free passes first (officers-table extraction, NIRF officer extraction, thin-site snippet fallback for any blocked/thin site), then a final Serper pass. `verifyNameRoleProximity` plus URL/department-page guards prevent false positives (e.g., a department-page person being promoted to VC). Post-gap-fill singleton enforcement catches any new duplicates.

**Provenance discipline:** `phone_source` / `linkedin_source` are set to `"none"` when values are stripped; a nonempty value must never have `"none"` provenance; existing valid provenance is not overwritten by a new `"none"`; scraper-only records without evidence lose unverified phone/LinkedIn values. `actions/stakeholderCleanup.ts` makes this self-consistent and idempotent.

**Provider alerts:** Firecrawl 429/insufficient-credit, Serper quota exhaustion, and Gemini quota/rate-limit errors are recorded to `apiAlerts` (6h dedup) and surfaced in the frontend via `components/ApiAlertModal.tsx`. Firecrawl switches to Jina after insufficient credits instead of retrying.

### 5. Outreach Orchestrator (HITL)

Sequences follow a HITL-aware state machine: **Draft** (`pending_approval`) → Human Review / Edit / Reject → **Approved & Sent** (`actions/email.approveAndSend`) → Replied/Bounced. `convex/emails.ts` provides `listPending`, `pendingCount`, `updateDraft`, and `rejectDraft` for the approvals queue.

`actions/outreach.ts` drafts each email with `status: "pending_approval"` and pauses the sequence. When `approveAndSend` runs it:

1. Verifies the email is `pending_approval`
2. Sends via the internal `doSendEmail` helper in `actions/email.ts` (ZeptoMail)
3. Updates `emailsSent` to `sent` and persists `zeptomail_message_id`
4. Resumes the sequence and computes `next_send_at` from `convex/lib/cadence.ts`

Auto-replies (step `99`) and proposal emails (step `100`) are sent through the same `email.sendEmail` path but do not advance the standard sequence step counter.

Threaded `Message-ID` headers (`<fretbox-{emailId}@reply.fretbox.in>`) enable conversation tracking and inbound reply correlation.

### 6. API Key Management (DB-Backed)

All external API keys are stored in the `systemSettings` table with **XOR obfuscation** (not encryption) using `SETTINGS_OBFUSCATION_SECRET` (must be at least 32 characters, read at call time):

- `geminiApiKey`
- `serperApiKey`
- `firecrawlApiKey`
- `zeptomailApiKey`
- `googleCalendarJson`
- `googleCalendarId`
- `zeptomailFromEmail`
- `zeptomailFromName`

Each has: status query (`get*KeyStatus`), set mutation (`set*Key`), test action (`test*Key` or `test*KeyStored`), remove mutation (`remove*Key`), and internal getter (`getInternal*Key`) with env fallbacks. `convex/settings.ts` imports `MODELS` from `convex/lib/models.ts` for `testGeminiKey`.

Keys are validated and sanitized before storage with `sanitizeApiKey()`. `sanitizeApiKey()` only accepts printable ASCII characters (code points 33–126); control characters, whitespace, and non-ASCII characters are rejected. Display names (`zeptomailFromName`) use `.trim()` only and do **not** use `sanitizeApiKey()`.

### 7. ZeptoMail Integration

Email is delivered through **ZeptoMail** via `convex/actions/email.ts`:

- `doSendEmail`: shared helper that fetches the ZeptoMail key, from-email, and from-name from `systemSettings`, builds MIME headers (`Message-ID`, `In-Reply-To`, `References`), and posts to `https://api.zeptomail.in/v1.1/email`. Supports base64 `attachments`.
- `sendEmail` (`internalAction`): used by `autoReply.sendAutoReply`, `proposals.emailProposal`, and `auth.ts` password reset.
- `approveAndSend` (`action`): HITL gate that sends drafted outreach emails, including fetching and base64-encoding stored attachments.
- `convex/actions/document.ts` (`parseDocx`, `createDocumentDrafts`): parses an uploaded `.docx` to plain text and creates one `pending_approval` draft per recipient. Recipients can be a stakeholder or a custom email address.
- `components/DocumentMailerModal.tsx`: upload a `.docx`, optionally attach extra files, choose a stakeholder or custom email per university, and draft to the HITL queue.
- `convex/files.ts`: generic `generateUploadUrl` for Convex Storage uploads.
- Rate limit: **3 emails per minute per destination** (`send_email:${to}` key) enforced before every send via `rateLimits.checkRateLimitInternal`.

ZeptoMail response `request_id` is stored in `emailsSent.zeptomail_message_id` and passed as `client_reference` for delivery event correlation.

### 8. Webhook Hardening (HTTP Layer)

`convex/http.ts` exposes HTTP actions on the **Convex site URL** (`https://*.convex.site` / `NEXT_PUBLIC_CONVEX_SITE_URL`), not the `*.convex.cloud` API URL:

- `POST /webhooks/zeptomail`: HMAC-SHA256 signature verification using `ZEPTOMAIL_WEBHOOK_SECRET`. Maps delivery events (`email_open` → `opened`, `email_link_click` → `clicked`, `hardbounce` / `softbounce` → `bounced`) to `emailsSent` status updates. Correlates by `email_reference`, `request_id`, or `client_reference`.
- `POST /webhooks/email-reply`: Shared-secret (`EMAIL_WEBHOOK_SECRET`). Resolves thread context from `Message-ID` / `References` / `In-Reply-To`, then from email address, inserts a `replies` record, and schedules `internal.actions.replyClassifier.classifyReplyInternal`.
- `POST /webhooks/google-calendar`: Channel token verification via `GOOGLE_CALENDAR_WEBHOOK_TOKEN` for Google Calendar push sync notifications.
- Convex Auth HTTP routes (sign-in, sign-out, session) are also mounted here.
- Test endpoints (`/test/ping`, `/test/run-pipeline`) are disabled by default. Enable with `DISABLE_TEST_ENDPOINTS=false` and pass `TEST_WEBHOOK_SECRET` as a bearer token.

### 9. INI Seed & UGC Sync Protection

- `convex/lib/institutesOfNationalImportance.ts` contains an 80-record curated list (23 IITs, 31 NITs, 26 IIITs).
- `convex/actions/iniSeed.ts` ingests them with `data_source: "curated"` and `category` (`IIT` | `NIT` | `IIIT`). It uses name/domain/state scoring and `bulkSyncCuratedInternal` for batched writes.
- The `Sync IITs / NITs / IIITs` button in `components/SyncIniButton.tsx` calls `api.actions.iniSeed.syncInstitutesOfNationalImportance`.
- `convex/actions/ugcSync.ts` and `convex/universities.ts` (`bulkSyncUgc`) skip any record where `data_source === "curated"`, preventing the UGC dataset from overwriting curated institutes.

### 10. Auth & Client-Side Guard

- `@convex-dev/auth` `^0.0.95` with Password provider (`convex/auth.ts`). Password reset uses a custom `reset` email provider that generates a 32-character code and sends it through `internal.actions.email.sendEmail`.
- Password reset flow: `/forgot-password` submits email → reset code is stored in `authVerificationCodes` and emailed → `/reset-password` verifies code and sets a new password.
- **Client-side auth guard**: `components/AuthGuard.tsx` replaces the deleted edge middleware (`proxy.ts`). It uses `useConvexAuth` + `next/navigation` `useRouter` to redirect unauthenticated users from `/dashboard` to `/sign-in`. The dashboard layout (`app/(dashboard)/layout.tsx`) wraps its content in `<AuthGuard>`. The landing page (`app/page.tsx`) renders instantly without a blocking spinner and uses `<RedirectIfAuthenticated />` to redirect authenticated users to `/dashboard`. `/forgot-password` and `/reset-password` are public.
- `ConvexClientProvider.tsx` falls back to the production Convex URL (`https://energetic-raven-535.convex.cloud`) when `NEXT_PUBLIC_CONVEX_URL` is not set, so the app works on any host without additional env configuration.

### 11. Design System

Flat design with glassmorphism accents. Fonts: Poppins (headings) + Open Sans (body). Primary `#3B82F6`, CTA/Accent `#F97316`. The brand scale in `app/globals.css` and `tailwind.config.ts` has been switched to a blue/cyan spectrum; violet references have been removed and color audit scripts now pass. See `design-system/onboardingai/MASTER.md` for full specs.

## File Dependency Rules (CRITICAL FOR AGENTS)

- **Database Mod:** Mutating `convex/schema.ts` necessitates checking all `convex/actions/*` and entity files for type safety (especially `deepEnrichment.ts`, `scoring.ts`, `proposals.ts`).
- **Prompt Mod:** Modifying `convex/lib/prompts.ts` often requires updates to parsing logic in `convex/actions/personalize.ts`, `convex/actions/deepEnrichment.ts`, `convex/actions/proposals.ts`, `convex/actions/replyClassifier.ts`.
- **Template Mod:** Changes to `convex/lib/emailTemplates.ts` may require updates in `convex/actions/autoReply.ts` or `convex/actions/outreach.ts`.
- **Proposal Mod:** Changes to proposal generation logic in `convex/actions/proposals.ts` and `convex/lib/moduleRecommender.ts` affect the rich HTML email output. `convex/lib/proposalPdf.tsx` is legacy and not currently used.
- **LLM / Model Mod:** Changes to `convex/lib/models.ts` affect `convex/lib/llm.ts`, `convex/settings.ts`, and any action that imports the model constants.
- **Utils Mod:** Changes to `convex/lib/utils.ts` affect all actions that import it (scraper, enrichment, deepEnrichment, etc.). Be careful with Sentry imports (`@sentry/nextjs` vs `@sentry/node`) — `utils.ts` is imported by both frontend and backend contexts via generated types.
- **Discovery Mod:** Changes to `convex/lib/discoveryCandidates.ts` affect `discovery.ts` and `orchestrator.ts`.
- **Contact Inference Mod:** Changes to `convex/lib/contactInference.ts` affect `inferContacts.ts` and `scraper.ts`.
- **INI / University Mod:** Changes to `convex/lib/institutesOfNationalImportance.ts` or `convex/lib/universityUtils.ts` (`namesMatch`) affect `convex/actions/iniSeed.ts`, `convex/actions/ugcSync.ts`, and `convex/universities.ts`.
- **Frontend Mod:** When changing UI in `/app/(dashboard)/`, ensure Tailwind classes follow the glassmorphism system in `globals.css` and `tailwind.config.ts`. Check `design-system/onboardingai/MASTER.md` for constraints.
- **Package Mod:** When updating external SDKs, verify both Next.js frontend and Convex backend compatibility.
- **Action Visibility Mod:** When adding an action, decide if it is `action` (public + needs `validateAuth`) or `internalAction` (scheduler/webhook-only). Internal callers use `internal.actions.*`; public callers use `api.actions.*`.
- **Circular Type Mod:** If `npx tsc --noEmit` reports `implicitly has type 'any'` on actions, extract shared logic into a `do*` helper with an explicit return type, and have both the `internalAction` and `action` wrappers call it.

## System Hardening Guidelines

1. **Exponential Backoff:** All external API hits in actions must use `withRetry` (`convex/lib/utils.ts`).
2. **Centralized Prompts:** Do not inline prompts inside actions; keep them in `convex/lib/prompts.ts`.
3. **Internal Mutations:** Webhook handlers in `convex/http.ts` must use internal mutations (not direct DB writes) to keep logic centralized and auditable.
4. **ZeptoMail ID Persistence:** Always store normalized `zeptomail_message_id` in `emailsSent` for delivery event correlation, and pass `client_reference` for proposal/reply tracking.
5. **Sentry Logging:** Ensure AI failures have structured payload logs.
6. **Environment Variables:** The following environment variables are used by the app and backend: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `SITE_URL`, `CONVEX_DEPLOYMENT`, `SETTINGS_OBFUSCATION_SECRET`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN`, `ZEPTOMAIL_WEBHOOK_SECRET`, `EMAIL_WEBHOOK_SECRET`, `DISABLE_TEST_ENDPOINTS`, `TEST_WEBHOOK_SECRET`, `LLM_DAILY_BUDGET_USD`, `ADMIN_EMAILS`, `SKIP_RATE_LIMITS`, `SENTRY_DSN`, and `NEXT_PUBLIC_SENTRY_DSN`. All API service keys (Gemini, Serper, Firecrawl, ZeptoMail, Google Calendar) belong in the DB via the Settings page.
7. **Rate Limiting:** Use `rateLimits` table + `withConcurrencyLimit` for external API call throttling. Email dispatch is capped at **3 emails/minute per destination**.
8. **Serper Budget:** Use `createSerperBudget` / `runWithSerperBudget` from `convex/lib/serperBudget.ts` to enforce per-university query caps and detect quota exhaustion.
9. **Timeout Safety:** All Gemini SDK calls use `httpOptions: { timeout: 25000 }`. All `fetch()` calls use `AbortSignal.timeout(...)`. Do **not** wrap `ctx.runAction(...)` in `raceWithTimeout`.
10. **API Key Validation:** `set*Key` mutations validate keys with `sanitizeApiKey()` before storage. `sanitizeApiKey()` only accepts printable ASCII characters (33–126). **Do NOT** use `sanitizeApiKey()` on human-readable display names (e.g., `zeptomailFromName`) — use `.trim()` instead.
11. **LLM Output Sanitization:** Always pipe LLM-generated text through `sanitizeLlmOutput()` before persistence or email injection. It strips leftover injection artifacts and placeholder markers (`[Name]`, `[University]`, `[Role]`).
12. **Cache Policy:** Deterministic calls benefit from `llmCache`. Any call with university-specific, stakeholder-specific, or reply-specific data **must** pass `skipCache: true`.
13. **Budget Soft Cap:** The `llmBudget` guard is a best-effort daily limit, not an atomic hard cap. Concurrent actions may slightly overspend under burst load. Set `LLM_DAILY_BUDGET_USD` conservatively.
14. **No "use node" in Queries/Mutations:** Convex queries and mutations run in the V8 isolate runtime. Only **actions** can use `"use node"`. Importing a `"use node"` file into a V8 file causes esbuild to bundle Node built-ins into the browser bundle, which crashes with "Could not resolve" errors.
15. **Clean Convex Errors in UI:** Raw Convex mutation errors contain `[CONVEX M(...)] [Request ID: ...]` noise. Strip this via `cleanConvexError()` / `getErrorMessage()` in `app/(dashboard)/dashboard/settings/components.tsx` before displaying to users.
16. **Public Action Authentication:** Every public `action` exposed to the frontend must call `await validateAuth(ctx)` at the start of the handler.
17. **Internal Call Discipline:** Internal actions use `internalAction` and are called via `internal.actions.*` or `internal.<module>.*`. Never call `api.actions.*` from internal code or webhooks.
18. **Proposal Status Values:** The `proposals` table supports `status` values: `draft`, `ready`, `sent`, `meeting_confirmed`, and `cancelled`. Update `convex/schema.ts` and `convex/proposals.ts` union validators when adding statuses.
19. **Accurate Analytics Counts:** `getFunnelStats` in `convex/universities.ts` uses full `collect()` queries instead of `take(limit)` so stage counts and totals are accurate.
20. **Curated Record Immunity:** Any sync or import logic must preserve records with `data_source: "curated"`. UGC sync and duplicate cleanup skip these records.
21. **Provider Alert Surfacing:** When Gemini / Firecrawl / Serper hit quota exhaustion or an error during any background activity, record it via `apiAlerts.recordInternal` (6h dedup). The frontend `ApiAlertModal` surfaces unacknowledged alerts. Do not crash unrelated processing on a single provider failure — degrade gracefully (e.g., Firecrawl → Jina fallback).
22. **Scheduled Long-Running Enrichment:** Long enrichment chains must not be awaited inline from `npx convex run` (the CLI client waits ~5 minutes). Use `scheduleEnrichmentInternal` / `scheduleEnrichmentBatch` to enqueue via the scheduler, then poll `universities:getInternal`. Deep enrichment and finish phases run as separate scheduled actions; sequential batches chain via the scheduler so providers are never hit concurrently.
23. **Acting-Suffix Normalization:** Singleton-role deduplication must normalize `Offg.` / `Officiating` / `Acting` / `i/c` (including punctuation inside parentheses and space-separated suffixes like `Registrar i/c`) while preserving the original role label. Same-person acting duplicates collapse; same-name people with conflicting roles do not merge unless contact evidence connects them.
24. **Gap-Fill Guards:** Gap-fill for missing VC/Registrar must run free passes first (officers-table, NIRF officer, thin-site snippet) and Serper last. `verifyNameRoleProximity` plus URL/department-page guards must prevent department-page people from being promoted into singleton roles. Post-gap-fill singleton enforcement must run.
25. **Provenance Self-Consistency:** When a phone/LinkedIn value is stripped, set `phone_source` / `linkedin_source` to `"none"`. A nonempty value must never have `"none"` provenance. Existing valid provenance must not be overwritten by a new `"none"`. Scraper-only records without evidence lose unverified phone/LinkedIn values.
26. **No Fabricated Data:** Do not invent missing VC, Registrar, or demographic data. When no official numeric enrollment data exists across all fallback tiers (NIRF → AISHE → Round-2 NAAC/site → Gemini grounding), preserve `null` and emit an explicit warning. The pipeline reports what it cannot find rather than hallucinating.
27. **unpdf for PDFs:** Use `unpdf` (`extractPdfText` / `extractPdfTables` in `convex/lib/scrapers.ts`) for serverless-safe PDF extraction. Do not reintroduce `pdfjs-dist` or worker-dependent PDF libraries. Distinguish parser success from data availability — a parsed PDF with no numeric enrollment values is not a demographic success.
28. **Next.js 16 Build Webpack Pin:** the production build passes `--webpack` (`npm run build`) to preserve the custom webpack config in `next.config.ts`; the dev server runs on Turbopack. Do not switch the build to Turbopack without re-evaluating the webpack config. The edge middleware (`proxy.ts` / `middleware.ts`) was removed; dashboard auth protection is client-side via `components/AuthGuard.tsx`.

## Useful Commands

- **Dev Console:** `npm run dev` starts both Convex and Next.js concurrently (Next dev runs on Turbopack).
- **Dev Split:** `npm run dev:next` (`next dev`, Turbopack) or `npm run dev:convex` (`npx convex dev`) for individual services.
- **Test (E2E):** `npm run test` — Playwright tests (`tests/e2e`, baseURL `http://localhost:3000`).
- **Test (Unit):** `npm run test:unit` — tsx unit tests (~517 tests, hermetic — no API keys required).
- **Lint:** `npm run lint` — ESLint.
- **Build:** `npm run build` — `next build --webpack` production build.
- **Master Checklist:** `python3 .devin/scripts/checklist.py .` — runs security, lint, schema, tests, UX, SEO in priority order.
- **Convex Dashboard:** `npx convex dev` opens the Convex dashboard for manual review of events, logs, and cron jobs.
- **Type Check:** `npx tsc --noEmit` — full project TypeScript check. For backend-only: `npx tsc --noEmit --project convex/tsconfig.json`.
- **Convex Codegen:** `npx convex codegen` — regenerate TypeScript bindings after schema or action changes. **Required** whenever a new Convex module/function is added.
- **Production enrichment (single):** `npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentInternal' '{"universityId":"<id>"}'` — enqueues and returns immediately; poll with `universities:getInternal`.
- **Production enrichment (batch):** `npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentBatch' '{"queue":["<id1>","<id2>"]}'` — sequential queue, each university schedules the next on completion.
- **Security audit:** `npm audit --audit-level=high`.

## More Documentation

- [Project README](./README.md)
- [Convex backend notes](./convex/README.md)
- [User guide](./user-guide.md)
- [Quick user guide](./user-guide-lite.md)
- [Implementation plan](./docs/PLAN.md)
- [Requirements](./docs/Requirement.md)
- [Roadmap](./docs/roadmap.md)
- [Design system](./design-system/onboardingai/MASTER.md)

---

© 2026 Fretbox. Confidential.
