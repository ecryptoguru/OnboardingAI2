# CODEBASE MAP

This document serves as the central reference point for AI coding agents to navigate the `fretbox-outreach-v2` repository.

## 🎯 Project Overview

**Fretbox Outreach AI v2** is an AI-native outreach engine designed for university hostel management. It manages ingestion, discovery, deep data enrichment, multi-step personalized sequences, auto-reply handling, proposal automation with Google Calendar/Meet integration, and monitoring.

## 🏗 Tech Stack

- **Framework:** Next.js 15 (React 19, App Router)
- **Backend & Database:** Convex (Serverless functions, Real-time DB, Crons, Vector search)
- **Styling:** Tailwind CSS, Glassmorphism design system
- **AI Models:** Google Gemini 3.1 Pro Preview (Reasoning), Gemini 3.5 Flash (Complex tasks), Gemini 3.1 Flash-Lite (High-volume tasks). Routed via OpenRouter or direct `@google/genai` SDK.
- **External Services:**
  - SendGrid (Email dispatch & delivery tracking)
  - Calendly Webhooks (Booking triggers)
  - Serper (Website discovery)
  - Jina Reader (Web scraping)
  - Google Calendar API (Meeting creation & push notifications)
- **Testing:** Playwright for E2E
- **Monitoring:** Sentry

## 📂 Core Directory Structure

### `/app`

Next.js 15 App Router frontend.

- `/(auth)/`: Authentication pages (Convex Auth).
- `/(dashboard)/`: Main glassmorphism dashboard UI.
  - `dashboard/`: Universities list & detail view.
  - `dashboard/enrichment/`: Signal enrichment & scoring overview.
  - `dashboard/analytics/`: Pipeline analytics.
  - `dashboard/outreach/`: Sequence management & reply inbox.
  - `dashboard/approvals/`: Pending email approvals queue.
  - `dashboard/proposals/`: Generated proposals & PDFs.
  - `dashboard/settings/`: System configuration (API keys, toggles).
- `/api/`: Standard Next.js serverless external integrations.

### `/convex`

The entire backend ecosystem (Queries, Mutations, Actions).

- **Core Entities:** `universities.ts`, `stakeholders.ts`, `signals.ts`, `proposals.ts`, `sequences.ts`, `emails.ts`, `replies.ts`, `priorityScores.ts`, `settings.ts`, `rateLimits.ts`.
- **Infrastructure:** `schema.ts` (DB Models), `crons.ts` (Scheduled Jobs), `dispatcher.ts` (Staggered job scheduling), `http.ts` (Convex HTTP Webhooks), `auth.ts` / `auth.config.ts`.
- `/actions/`
  Houses expensive / side-effect heavier serverless operations (mostly AI and HTTP fetch limits):
  - `deepEnrichment.ts`: Heavy AI-based signal enrichment (news, LinkedIn, images) using Gemini with vector embeddings.
  - `discovery.ts`: Finding and validating university websites via Serper.
  - `scraper.ts`: Using Jina/fetch to extract page contents.
  - `enrichment.ts`: Stakeholder enrichment pipeline.
  - `outreach.ts` / `orchestrator.ts`: Multi-stage email sequence dispatch & cadence.
  - `personalize.ts`: AI generating bespoke email copy.
  - `scoring.ts`: Evaluating lead potential with Fretbox-specific factors (hostelites, NAAC, agility, etc.).
  - `proposals.ts`: AI-generated PDF proposals & module recommendation.
  - `replyClassifier.ts`: Inbound reply classification (meeting_request, positive_interest, opt_out, etc.).
  - `autoReply.ts`: Automated response sending for positive replies & meeting requests.
  - `email.ts`: SendGrid email dispatch with retry logic.
  - `ingest.ts`: CSV/UGC data ingestion helpers.
  - `ugcSeed.ts` / `ugcSync.ts`: UGC university dataset seeding and synchronization.
  - `migrateEmbeddings.ts`: Embedding backfill for vector search.
  - `testE2E.ts`, `testRetry.ts`, `testVerifyOptimizations.ts`, `testVerifyRequirements.ts`: Action-based test helpers.
- `/lib/`
  Shared backend utilities & governance:
  - `prompts.ts`: Centralized prompt library for unified AI governance.
  - `llm.ts`: Gemini SDK wrappers (`callGemini`, `callFlash`, `embed`) with model constants, temperature presets, and thinking-budget controls.
  - `emailTemplates.ts`: Typed email template functions (intro, follow-up, auto-reply, proposal).
  - `proposalPdf.tsx`: React-PDF components for proposal generation.
  - `googleCalendar.ts`: Google Calendar API integration (event creation, Meet links, watch channels).
  - `moduleRecommender.ts`: AI-driven module recommendation logic.
  - `scrapers.ts`: Shared scraping helpers.
  - `scoring.ts`: Scoring algorithm utilities.
  - `cadence.ts`: Outreach timing/cadence rules.
  - `universityUtils.ts`: University data normalization helpers.
  - `auth_utils.ts`: Convex Auth helper functions.
  - `utils.ts`: Shared utilities (`withRetry`, backoff, etc.).

### `/components`

Shared generic and specialized UI React components (ErrorBoundary, ThemeToggle, SyncUgcButton, UploadCsvButton, etc.).

### `/tests` & `/test-results`

Playwright E2E tests focusing on application flows and reliability.

## ⚙️ Core Architectures & Patterns

### 1. Data Flow & AI Governance

Convex is the single source of truth. Features like Discovery, Scraping, and Scoring utilize batching and retry logic (`withRetry` on API calls) heavily inside `convex/actions/` before hydrating standard Convex database rows. `signals` represent dynamic data points about a `university` or `stakeholder` that influence `scoring`.

### 2. Vector Search & RAG

`universitySignals` stores 768-dimensional embeddings (`text-embedding-005`) with a Convex `vectorIndex`. This enables semantic retrieval of news, LinkedIn, website, and image signals for personalized outreach and proposal generation.

### 3. Outreach Orchestrator

The outreach system builds sequences in a deterministic state machine logic (Draft -> Scheduled -> Sent -> Replied/Bounced). Sequences use data from stakeholder enrichment to dynamically render prompt-injected emails via Gemini AI. Auto-replies are triggered for positive classifications with threaded Message-ID headers for proper conversation tracking.

### 4. Webhook Hardening (HTTP Layer)

`convex/http.ts` handles inbound webhooks securely:

- **SendGrid delivery events:** HMAC-SHA256 signature verification, normalized message ID mapping to `emailsSent` status updates via internal mutations.
- **Inbound email replies:** Shared-secret auth, multi-layer context resolution (thread Message-ID -> email lookup -> sender email -> stakeholder lookup), then schedules `replyClassifier`.
- **Google Calendar push notifications:** Channel token verification for sync notifications.

### 5. File Dependency Rules (CRITICAL FOR AGENTS)

When modifying code in this repository, always be aware of the following tight-coupling lines:

- **Database Mod:** Mutating `convex/schema.ts` necessitates checking `convex/actions/*` for type safety (especially `deepEnrichment.ts`, `scoring.ts`, and `proposals.ts`).
- **Prompt Mod:** Modifying prompts in `convex/lib/prompts.ts` often requires updates to parsing logic inside `convex/actions/personalize.ts`, `convex/actions/deepEnrichment.ts`, or `convex/actions/proposals.ts`.
- **Template Mod:** Changes to `convex/lib/emailTemplates.ts` may require updates in `convex/actions/autoReply.ts` or `convex/actions/outreach.ts`.
- **PDF Mod:** Changes to `convex/lib/proposalPdf.tsx` affect proposal rendering in `convex/actions/proposals.ts`.
- **Frontend Mod:** When changing UI structures in `/app/(dashboard)/`, ensure Tailwind classes follow the established Glassmorphism design system in `globals.css` and `tailwind.config.ts`.
- **Package Mod:** When updating external SDKs, Next.js and Convex integrations must both be verified.

## 🛡 System Hardening Guidelines

1. **Exponential Backoff:** All API hits in actions must use backoff/retry (`withRetry` in `convex/lib/utils.ts`).
2. **Centralized Prompts:** Do not inline prompts inside actions; keep them in `convex/lib/prompts.ts`.
3. **Internal Mutations:** Webhook handlers in `convex/http.ts` must use internal mutations (not direct DB writes) to keep logic centralized and auditable.
4. **SendGrid ID Persistence:** Always store normalized `sendgrid_message_id` in `emailsSent` for delivery event correlation.
5. **Sentry Logging:** Ensure AI failures have structured payload logs.
6. **Environment Variables:** Must sync between Next.js frontend requirements and Convex backend securely.

## 🏃‍♂️ Useful Commands

- **Dev Console:** `npm run dev` starts all processes (Convex + Next.js).
- **Dev Split:** `npm run dev:next` or `npm run dev:convex` for individual services.
- **Test:** `npm run test` executes Playwright.
- **Convex Dashboard:** Use `npx convex dev` dashboard UI to manually review `events`, `logs`, and `cron` jobs.
