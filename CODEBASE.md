# CODEBASE MAP

This document serves as the central reference point for AI coding agents to navigate the `fretbox-outreach-v2` (OnboardingAI) repository.

## 🎯 Project Overview

**Fretbox Outreach AI v2 / OnboardingAI** is an AI-native outreach engine designed for university hostel management. It manages ingestion, discovery, deep data enrichment, multi-step personalized sequences, auto-reply handling, proposal automation with Google Calendar/Meet integration, and monitoring.

## 🏗 Tech Stack

- **Framework:** Next.js 15 (React 19, App Router)
- **Backend & Database:** Convex (Serverless functions, Real-time DB, Crons, Vector search)
- **Auth:** `@convex-dev/auth` with Password provider
- **Styling:** Tailwind CSS v3.4.1, Glassmorphism design system (see `design-system/onboardingai/MASTER.md`)
- **Icons:** Heroicons React + Lucide React
- **AI Models:** Google Gemini 3.5 Flash (complex tasks), Gemini 3.1 Flash-Lite (high-volume), `text-embedding-005` (768-dim embeddings). Uses direct `@google/genai` SDK.
- **External Services:**
  - SendGrid (Email dispatch & delivery tracking)
  - Serper (Website discovery)
  - Jina Reader / fetch (Web scraping)
  - Google Calendar API (Meeting creation, Meet links, push notifications)
  - UGC.gov.in (Indian university dataset proxy via `/api/sync-ugc`)
- **PDF:** `@react-pdf/renderer`
- **Testing:** Playwright (E2E) + tsx unit tests (`tests/unit/*.test.ts`)
- **Monitoring:** Sentry (`@sentry/nextjs`)

## 📂 Core Directory Structure

### `/app`

Next.js 15 App Router frontend.

- `/(auth)/`
  - `sign-in/page.tsx`: Sign-in page (Convex Auth Password)
  - `sign-up/page.tsx`: Sign-up page
- `/(dashboard)/`
  - `layout.tsx`: Dashboard shell with navigation, glassmorphism styling, theme support
  - `dashboard/page.tsx`: Universities list & detail view with filters, search, CSV upload
  - `dashboard/enrichment/page.tsx`: Signal enrichment & scoring overview
  - `dashboard/analytics/page.tsx`: Pipeline analytics & KPIs
  - `dashboard/outreach/page.tsx`: Sequence management, reply inbox, email thread viewer
  - `dashboard/outreach/demo/page.tsx`: Outreach demo/visualization page
  - `dashboard/approvals/page.tsx`: Pending email approvals queue
  - `dashboard/proposals/page.tsx`: Generated proposals, PDF viewer, Google Calendar integration
  - `dashboard/settings/page.tsx`: System configuration (API keys, toggles, enrichment controls)
  - `dashboard/settings/components.tsx`: Reusable settings UI components
- `/api/sync-ugc/route.ts`: Next.js proxy route for UGC.gov.in university data (rate-limited)
- `globals.css`: Global styles, Tailwind directives, glassmorphism CSS variables
- `layout.tsx`: Root layout with ConvexClientProvider, ThemeProvider, Sentry instrumentation
- `page.tsx`: Marketing / landing page
- `global-error.tsx`: Global error boundary

### `/convex`

The entire backend ecosystem (Queries, Mutations, Actions, HTTP routes, Crons).

- **Core Entities:**
  - `universities.ts`: CRUD, search, filtering, ingestion, UGC sync, discovery triggers
  - `stakeholders.ts`: Contact management, enrichment, deduplication, email/LinkedIn tracking
  - `signals.ts`: Signal ingestion, vector search, semantic retrieval
  - `proposals.ts`: Proposal CRUD, PDF storage, Calendar event linking
  - `sequences.ts`: Outreach sequence state machine (active/paused/completed/opted_out)
  - `emails.ts`: Email log CRUD, delivery status tracking, approval workflows
  - `replies.ts`: Reply log management, classification review
  - `priorityScores.ts`: Lead scoring storage (deterministic + AI + final composite)
  - `settings.ts`: System settings key-value store (API keys, toggles)
  - `rateLimits.ts`: Persistent rate-limiting for external APIs
  - `admin.ts`: Admin operations (e.g., `resetUniversityEnrichment`)
  - `dbReset.ts`: Database reset utilities
  - `removeDuplicates.ts`: Duplicate cleanup operations
  - `wipeEnrichment.ts`: Bulk enrichment data wiping
  - `test.ts` / `testDeep.ts`: Test endpoints

- **Infrastructure:**
  - `schema.ts`: Full database schema with auth tables, indexes, search indexes, vector index (768-dim)
  - `crons.ts`: Scheduled jobs — hourly outreach sequence processing, weekly proposal cleanup
  - `dispatcher.ts`: Staggered job scheduling for website validation/discovery
  - `http.ts`: Convex HTTP webhooks (SendGrid delivery, inbound replies, Google Calendar push, auth routes)
  - `auth.ts` / `auth.config.ts`: Convex Auth configuration (Password provider)

- `/actions/` (21 files)
  Heavy / side-effect serverless operations:
  - `deepEnrichment.ts`: AI-based signal enrichment (news, LinkedIn, images) with vector embeddings
  - `discovery.ts`: University website discovery & validation via Serper
  - `scraper.ts`: Web content extraction via Jina/fetch
  - `enrichment.ts`: Stakeholder enrichment pipeline
  - `outreach.ts`: Multi-stage email sequence dispatch & cadence logic
  - `orchestrator.ts`: Outreach orchestration & sequence progression
  - `personalize.ts`: AI email copy generation with prompt injection
  - `scoring.ts`: Lead potential scoring (hostelites, NAAC, agility, digital signals, etc.)
  - `proposals.ts`: AI-generated PDF proposals & module recommendations
  - `replyClassifier.ts`: Inbound reply classification (meeting_request, positive_interest, opt_out, etc.)
  - `autoReply.ts`: Automated response sending for positive replies & meeting requests
  - `email.ts`: SendGrid email dispatch with retry logic
  - `ingest.ts`: CSV/UGC data ingestion helpers
  - `ugcSeed.ts`: UGC dataset seeding
  - `ugcSync.ts`: UGC synchronization
  - `migrateEmbeddings.ts`: Embedding backfill for vector search
  - `realWorldVerify.ts`: Real-world pipeline verification
  - `testE2E.ts`, `testRetry.ts`, `testVerifyOptimizations.ts`, `testVerifyRequirements.ts`: Test helpers

- `/lib/` (12 files)
  Shared backend utilities:
  - `prompts.ts`: Centralized prompt library for unified AI governance
  - `llm.ts`: Gemini SDK wrappers (`callGemini`, `embed`) with model constants, temperature presets, thinking-budget controls
  - `emailTemplates.ts`: Typed email template functions (intro, follow-up, auto-reply, proposal)
  - `proposalPdf.tsx`: React-PDF components for proposal generation
  - `googleCalendar.ts`: Google Calendar API integration (events, Meet links, watch channels)
  - `moduleRecommender.ts`: AI-driven module recommendation logic
  - `scrapers.ts`: Shared scraping helpers
  - `scoring.ts`: Scoring algorithm utilities
  - `cadence.ts`: Outreach timing/cadence rules
  - `universityUtils.ts`: University data normalization helpers
  - `auth_utils.ts`: Convex Auth helper functions (`validateAuth`)
  - `utils.ts`: Shared utilities (`withRetry`, backoff, concurrency limits, sanitization)

### `/components`

Shared React UI components:
- `ApiKeyModal.tsx`: API key input modal
- `ConvexClientProvider.tsx`: Convex client context provider
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
- `unit/`: 15 unit test files covering cadence, email templates, Google Calendar, rate limits, reply classifier, sanitization, scoring, scrapers, stakeholders, university utils, webhook security, concurrency limits, etc.

### `/design-system`

- `onboardingai/MASTER.md`: Design system master file (Flat Design, Poppins + Open Sans, color palette, component specs, anti-patterns)

### `/docs`

- `AI_AUDIT_REPORT.md`, `COMPREHENSIVE_REVIEW.md`, `FIX_PLAN.md`, `PIPELINE_REPORT.md`, `PLAN.md`, `roadmap.md`

### Root Config & Scripts

- `middleware.ts`: Next.js middleware — auth protection with dev bypass support
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

### 2. Vector Search & RAG

`universitySignals` stores 768-dimensional embeddings (`text-embedding-005`) with a Convex `vectorIndex` (`by_embedding`). Enables semantic retrieval of news, LinkedIn, website, and image signals for personalized outreach and proposal generation.

### 3. Outreach Orchestrator

Sequences follow a deterministic state machine: Draft -> Scheduled -> Sent -> Replied/Bounced. Emails are dynamically generated via Gemini AI prompt injection using enrichment data. Auto-replies trigger for positive classifications with threaded `Message-ID` headers for conversation tracking.

### 4. Webhook Hardening (HTTP Layer)

`convex/http.ts` handles inbound webhooks securely:
- **SendGrid delivery events:** HMAC-SHA256 signature verification, normalized message ID mapping to `emailsSent` status updates via internal mutations.
- **Inbound email replies:** Shared-secret auth, multi-layer context resolution (thread Message-ID -> email lookup -> sender email -> stakeholder lookup), then schedules `replyClassifier`.
- **Google Calendar push notifications:** Channel token verification for sync notifications.
- **Auth routes:** Convex Auth HTTP routes (sign-in, sign-out, session).

### 5. Auth & Middleware

- `@convex-dev/auth` with Password provider (`convex/auth.ts`).
- `middleware.ts` protects all non-public routes. Development auth bypass is supported via `DEV_AUTH_BYPASS_SECRET` but **never** active in production.

### 6. Design System

Flat design with glassmorphism accents. Fonts: Poppins (headings) + Open Sans (body). Primary `#3B82F6`, CTA/Accent `#F97316`. See `design-system/onboardingai/MASTER.md` for full specs.

## 🔗 File Dependency Rules (CRITICAL FOR AGENTS)

- **Database Mod:** Mutating `convex/schema.ts` necessitates checking all `convex/actions/*` and entity files for type safety (especially `deepEnrichment.ts`, `scoring.ts`, `proposals.ts`).
- **Prompt Mod:** Modifying `convex/lib/prompts.ts` often requires updates to parsing logic in `convex/actions/personalize.ts`, `convex/actions/deepEnrichment.ts`, `convex/actions/proposals.ts`, `convex/actions/replyClassifier.ts`.
- **Template Mod:** Changes to `convex/lib/emailTemplates.ts` may require updates in `convex/actions/autoReply.ts` or `convex/actions/outreach.ts`.
- **PDF Mod:** Changes to `convex/lib/proposalPdf.tsx` affect proposal rendering in `convex/actions/proposals.ts`.
- **Frontend Mod:** When changing UI in `/app/(dashboard)/`, ensure Tailwind classes follow the glassmorphism system in `globals.css` and `tailwind.config.ts`. Check `design-system/onboardingai/MASTER.md` for constraints.
- **Package Mod:** When updating external SDKs, verify both Next.js frontend and Convex backend compatibility.

## 🛡 System Hardening Guidelines

1. **Exponential Backoff:** All external API hits in actions must use `withRetry` (`convex/lib/utils.ts`).
2. **Centralized Prompts:** Do not inline prompts inside actions; keep them in `convex/lib/prompts.ts`.
3. **Internal Mutations:** Webhook handlers in `convex/http.ts` must use internal mutations (not direct DB writes) to keep logic centralized and auditable.
4. **SendGrid ID Persistence:** Always store normalized `sendgrid_message_id` in `emailsSent` for delivery event correlation.
5. **Sentry Logging:** Ensure AI failures have structured payload logs.
6. **Environment Variables:** Must sync securely between Next.js frontend (`NEXT_PUBLIC_*` only when needed) and Convex backend.
7. **Rate Limiting:** Use `rateLimits` table + `withConcurrencyLimit` for external API call throttling.

## 🏃‍♂️ Useful Commands

- **Dev Console:** `npm run dev` starts both Convex and Next.js concurrently.
- **Dev Split:** `npm run dev:next` or `npm run dev:convex` for individual services.
- **Test (E2E):** `npm run test` — Playwright tests.
- **Test (Unit):** `npm run test:unit` — tsx unit tests.
- **Lint:** `npm run lint` — ESLint.
- **Build:** `npm run build` — Next.js production build.
- **Convex Dashboard:** `npx convex dev` opens the Convex dashboard for manual review of events, logs, and cron jobs.
