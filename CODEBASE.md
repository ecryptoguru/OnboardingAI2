# CODEBASE MAP

This document serves as the central reference point for AI coding agents to navigate the `fretbox-outreach-v2` repository.

## 🎯 Project Overview
**Fretbox Outreach AI v2** is an AI-native outreach engine designed for university hostel management. It manages ingestion, discovery, deep data enrichment, multi-step personalized sequences, proposal automation, and monitoring.

## 🏗 Tech Stack
- **Framework:** Next.js 15 (React 19, App Router)
- **Backend & Database:** Convex (Serverless functions, Real-time DB, Crons)
- **Styling:** Tailwind CSS, Glassmorphism design system
- **AI Models:** Anthropic Claude 3.7 Sonnet (Reasoning), Google Gemini 2.5 Flash (Vision/Speed)
- **External Services:** 
  - SendGrid (Email dispatch)
  - Calendly Webhooks (Booking triggers)
  - Serper (Website discovery)
  - Jina Reader (Web scraping)
- **Testing:** Playwright for E2E
- **Monitoring:** Sentry

## 📂 Core Directory Structure

### `/app`
Next.js 15 App Router frontend.
- `/(auth)/`: Authentication pages.
- `/(dashboard)/`: Main glassmorphism dashboard UI (`/dashboard`).
- `/api/`: Standard Next.js serverless external integrations (e.g., webhook catchers).

### `/convex`
The entire backend ecosystem (Queries, Mutations, Actions).
- **Core Entities:** `universities.ts`, `stakeholders.ts`, `signals.ts`, `proposals.ts`, `sequences.ts`, `emails.ts`, `replies.ts`.
- **Infrastructure:** `schema.ts` (DB Models), `crons.ts` (Scheduled Jobs), `dispatcher.ts`, `http.ts` (Convex HTTP Webhooks).
- `/actions/`
  Houses expensive / side-effect heavier serverless operations (mostly AI and HTTP fetch limits):
  - `deepEnrichment.ts`: Heavy AI-based signal enrichment using Gemini/Claude.
  - `discovery.ts`: Finding university endpoints.
  - `scraper.ts`: Using Jina to fetch page contents.
  - `outreach.ts` / `orchestrator.ts`: Multi-stage email sequences.
  - `personalize.ts`: Claude generating bespoke text.
  - `scoring.ts`: Evaluating lead potential.
  - `proposals.ts`: AI PDF generation via Calendly webhooks.
  - `replyClassifier.ts`: Handling inbox routing.
- `/lib/`
  Contains centralized `prompts.ts` for unified AI governance.

### `/components`
Shared generic and specialized UI React components.

### `/tests` & `/test-results`
Playwright E2E tests focusing on application flows and reliability.

## ⚙️ Core Architectures & Patterns

### 1. Data Flow & AI Governance
Convex is the single source of truth. Features like Discovery, Scraping, and Scoring utilize batching and retry logic (`withRetry` on API calls) heavily inside `convex/actions/` before hydrating standard Convex database rows. `signals` represent dynamic data points about a `university` or `stakeholder` that influence `scoring`.

### 2. Outreach Orchestrator
The outreach system builds sequences in a deterministic state machine logic (Draft -> Scheduled -> Sent -> Replied/Bounced). Sequences use data from stakeholder enrichment to dynamically render prompt injected emails via Anthropic AI.

### 3. File Dependency Rules (CRITICAL FOR AGENTS)
When modifying code in this repository, always be aware of the following tight-coupling lines:
- **Database Mod:** Mutating `convex/schema.ts` necessitates checking `convex/actions/*` for type safety (especially deepEnrichment). 
- **Prompt Mod:** Modifying prompts in `convex/lib/prompts.ts` often requires updates to parsing logic inside `convex/actions/personalize.ts` or `convex/actions/deepEnrichment.ts`.
- **Frontend Mod:** When changing UI structures in `/app/(dashboard)/`, ensure Tailwind classes follow the established Glassmorphism design system in `globals.css` and `tailwind.config.ts`.
- **Package Mod:** When updating external SDKs, Next.js and Convex integrations must both be verified.

## 🛡 System Hardening Guidelines
1. **Exponential Backoff:** All API hits in actions must use backoff/retry.
2. **Centralized Prompts:** Do not inline prompts inside actions; keep them in `convex/lib/prompts.ts`.
3. **Sentry Logging:** Ensure AI failures have structured payload logs.
4. **Environment Variables:** Must sync between Next.js frontend requirements and Convex backend securely.

## 🏃‍♂️ Useful Commands
- **Dev Console:** `npm run dev` starts all processes (Convex + Next.js).
- **Test:** `npm run test` executes Playwright. 
- **Convex Dashboard:** Use `npx convex dev` dashboard UI to manually review `events`, `logs`, and `cron` jobs.
