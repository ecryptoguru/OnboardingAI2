# Fretbox Outreach AI v2

AI-native outreach engine for university hostel management. Built on **Convex**, **Next.js 16.3.1**, **React 19**, and **Tailwind CSS 3.4.1**.

## Quick Start

```bash
npm install

# Start local Convex sync and the Next.js dev server
npm run dev
```

The app runs at `http://localhost:3000` (Playwright `baseURL` is `http://localhost:3000`).

Run the frontend and backend separately if needed:

```bash
npm run dev:next   # next dev (Turbopack)
npm run dev:convex # npx convex dev
```

> Next.js 16 defaults to Turbopack. The production build pins **Webpack** (`next build --webpack`) to preserve the existing custom webpack config in `next.config.ts`; the dev server runs on Turbopack.

## Environment Setup

Set these in your Convex dashboard or with `npx convex env set <NAME> <VALUE>`:

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex API URL for the frontend (`https://<project>.convex.cloud`) |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | Convex **site** URL for HTTP actions and webhooks (`https://<project>.convex.site`) |
| `SITE_URL` | Yes | Public frontend URL for password-reset callbacks (e.g., `http://localhost:3000`) |
| `SETTINGS_OBFUSCATION_SECRET` | Yes | XOR-obfuscation secret for API keys stored in DB (≥ 32 characters) |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | Recommended | Verify Google Calendar push notification `x-goog-channel-token` |
| `LLM_DAILY_BUDGET_USD` | Recommended | Daily LLM spend soft cap (default `$50`) |
| `DISABLE_TEST_ENDPOINTS` | Recommended | Set to `false` to enable HTTP test endpoints |
| `TEST_WEBHOOK_SECRET` | Recommended | Bearer token required for HTTP test endpoints |
| `ZEPTOMAIL_WEBHOOK_SECRET` | Recommended | HMAC secret for `/webhooks/zeptomail` |
| `EMAIL_WEBHOOK_SECRET` | Recommended | Bearer token for `/webhooks/email-reply` |
| `ADMIN_EMAILS` | Optional | Comma-separated admin emails for `validateAdmin` (leave empty in dev to allow all authenticated users) |
| `SKIP_RATE_LIMITS` | Optional | Set `true` **only** for local testing; must be unset in production |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry server/client error tracking DSN |
| `CONVEX_DEPLOYMENT` | Optional | Deployment name used by `npx convex dev` (e.g., `dev:your-project`) |

## Dashboard Settings

API keys and sender details are managed in **Settings → API Keys**. Values are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`.

| Setting | What it Powers |
| --- | --- |
| **Google Gemini** | AI reasoning, reply classification, proposal generation |
| **Serper** | Web search, news, and image discovery |
| **Firecrawl** | Deep crawling, sitemap discovery, contact extraction |
| **ZeptoMail API Key** | Sending transactional and outreach emails, including password reset codes |
| **ZeptoMail From Email** | Verified sender address for outbound emails (default: `outreach@fretbox.in`) |
| **ZeptoMail From Name** | Display name for outbound emails (default: `Ashish Gupta (Fretbox)`) |
| **Google Calendar Service Account** | Creating calendar events and Meet links from proposals |
| **Google Calendar ID** | Target calendar for event creation (defaults to `primary`) |

## Authentication

- **Email / Password Auth**: Convex Auth Password provider (`convex/auth.ts` and `convex/auth.config.ts`).
- **Forgot Password**: Request a reset code at `/forgot-password` and set a new password on `/reset-password`. Reset codes are sent through ZeptoMail and expire in one hour.
- **Client-Side Auth Guard**: Dashboard routes are protected by `components/AuthGuard.tsx`, which uses `useConvexAuth` + `next/navigation` to redirect unauthenticated users to `/sign-in`. The landing page (`/`) renders instantly without a blocking loading spinner and redirects authenticated users via `RedirectIfAuthenticated`.
- **Admin gating**: Use `ADMIN_EMAILS` to restrict access to admin-only routes; leave empty in local dev to allow all authenticated users.

## Tech Stack

- **Backend / DB**: [Convex](https://convex.dev) `^1.42.1` (queries, mutations, actions, crons, HTTP, vector search, scheduler)
- **Frontend**: [Next.js 16.3.1](https://nextjs.org) (Webpack) + [React 19](https://react.dev) + [Tailwind CSS 3.4.1](https://tailwindcss.com)
- **Auth**: `@convex-dev/auth` `^0.0.95` with Password provider; `@auth/core` `^0.41.3`
- **AI**: Google Gemini via `@google/genai` `^1.43.0` — `gemini-3.7-flash` (complex / per-source extraction / merge), `gemini-3.5-flash-lite` (scraper / scoring / personalization), `gemini-embedding-001` (768-dim vectors). Constants in `convex/lib/models.ts`.
- **PDF extraction**: [`unpdf`](https://github.com/web-infra-dev/unpdf) `^1.8.1` — serverless-safe PDF.js build (replaces worker-dependent `pdfjs-dist`).
- **Email**: [ZeptoMail](https://www.zoho.com/zeptomail/) REST API
- **Scraping**: Firecrawl (≤8 credits/university, Jina fallback on exhaustion) + Jina Reader + `fetch` fallback
- **Discovery**: Serper (≤14 queries/university, budget-enforced)
- **Testing**: Playwright E2E (`tests/e2e`, baseURL `http://localhost:3000`) + tsx unit tests (`tests/unit/*.test.ts`, ~496 tests)
- **Monitoring**: Sentry (`@sentry/nextjs` frontend, `@sentry/node` backend)
- **Deployment**: Vercel (live: `https://onboardingai2.vercel.app`; `vercel.json` pins the `@vercel/next` builder and a CSP that includes `wss://*.convex.cloud` — both required). Netlify was retired 2026-08-16 — Vercel is the only frontend host.

## Core Features

- **University Ingestion**: CSV upload, UGC.gov.in sync, and 80 curated Institutes of National Importance (IIT/NIT/IIIT) seeded via `convex/actions/iniSeed.ts`.
- **INI Seed Protection**: Curated records are marked `data_source: "curated"` and are skipped by the UGC sync, preventing overwrites.
- **Automated Discovery**: AI finds and validates university websites, then enriches signals. Serper is used for controlled discovery (≤14 queries/university); aggregators and unrelated social/company pages are rejected unless explicitly relevant.
- **Deep Enrichment Pipeline**: Source-partitioned extraction (Firecrawl map ≤8 credits → Serper external search → bounded fetches → per-source Gemini 3.7 Flash extraction → Flash merge). Singleton-role enforcement preserves `Offg.` / `I/c` / `Acting` labels and deduplicates same-person acting variants. Gap-fill runs free passes first, Serper last, with name/role proximity verification and URL/department guards to prevent false-positive VCs/Registrars.
- **Government Data Enrichment**: NIRF/AISHE/NAAC source discovery with deterministic regex fallback, Round-2 NAAC/university-site search, and Gemini grounding as a last-resort fallback. PDF parsing uses `unpdf` (serverless-safe). No demographic values are fabricated when no official numeric data exists.
- **Scheduled Long-Running Enrichment**: Public enqueue action schedules internal orchestration via the Convex scheduler and returns immediately, avoiding the ~5-minute CLI client wait. Deep enrichment and finish phases run as separate scheduled actions; sequential batches chain via the scheduler so Firecrawl/Serper are never hit concurrently. See "Running enrichment in production" below.
- **API Provider Alert Modal**: When Gemini / Firecrawl / Serper hit quota exhaustion or an error during any background activity, the backend records an alert in the `apiAlerts` table (deduplicated for 6 hours). The frontend `<ApiAlertModal />` (mounted in `app/(dashboard)/layout.tsx`) surfaces these to the user with Dismiss / Got-it actions.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Gemini.
- **HITL Approval**: Outreach emails are drafted with `status: "pending_approval"`. A human must approve each draft via the dashboard before it is sent.
- **Document Mailer**: Upload a `.docx` on the Outreach page, extract its text as the email body, optionally attach the original and additional files, choose a stakeholder or enter a custom email per university, and send via the HITL approvals queue.
- **Reply Classification**: Inbound replies are classified and high-confidence auto-replies are sent via `actions/autoReply.ts`.
- **Proposal Automation**: Calendar bookings trigger AI-generated rich HTML proposals with Google Meet links. The `pdf_storage_id` schema field is legacy and unused.
- **Real-time Dashboard**: Dashboard for tracking pipeline, analytics, and approvals.

## Webhooks

HTTP actions live in `convex/http.ts` and are served from the **Convex site URL** (`NEXT_PUBLIC_CONVEX_SITE_URL`, e.g., `*.convex.site`), not the API URL (`*.convex.cloud`).

| Path | Purpose | Auth |
| --- | --- | --- |
| `/webhooks/zeptomail` | Delivery, open, click, bounce events from ZeptoMail | `producer-signature` HMAC via `ZEPTOMAIL_WEBHOOK_SECRET` |
| `/webhooks/email-reply` | Inbound reply payloads (JSON or form-data) | Bearer token via `EMAIL_WEBHOOK_SECRET` |
| `/webhooks/google-calendar` | Google Calendar push notifications | `x-goog-channel-token` via `GOOGLE_CALENDAR_WEBHOOK_TOKEN` |

Webhook endpoints are disabled until their specific secret is configured; unconfigured webhooks return `401 Unauthorized`.

## Security and Hardening

- **Authentication**: Public user-facing actions call `validateAuth(ctx)`; scheduler, webhook, and seed actions are `internalAction`s invoked via `internal.*`.
- **HTTP Security**: Webhook endpoints verify HMAC or bearer tokens; test endpoints are locked by default (`DISABLE_TEST_ENDPOINTS=true`).
- **API Key Hygiene**: `sanitizeApiKey()` enforces printable ASCII (`33–126`) before keys are stored; values are XOR-obfuscated at rest.
- **Rate Limits**: Per-destination rate limits (e.g., three emails per minute to a single address). Use `SKIP_RATE_LIMITS` only for local testing.
- **LLM Budget**: `LLM_DAILY_BUDGET_USD` acts as a daily soft cap for LLM spend.
- **Monitoring**: Sentry error tracking and performance profiling.
- **Resilience**: Exponential backoff with `withRetry` for external API calls. `ConvexClientProvider` falls back to the production Convex URL when `NEXT_PUBLIC_CONVEX_URL` is not set, so the app works on any host without extra env configuration.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion; `getFunnelStats` uses full counts for accurate analytics.

## Testing and Verification

```bash
npx tsc --noEmit          # Type check
npm run lint              # Lint
npm run test:unit         # Unit tests (~496 tests, hermetic — no API keys required)
npm test                  # E2E tests (Playwright, baseURL http://localhost:3000)
python3 .devin/scripts/checklist.py .  # Full master checklist
npm run build             # Production build (next build --webpack)
npm audit --audit-level=high  # Security audit
```

## Running enrichment in production

Long-running enrichment must not be awaited inline from `npx convex run` (the CLI client waits ~5 minutes). Use the scheduler-based entrypoints instead:

```bash
# Single university — enqueues and returns immediately
npx convex run --deployment prod \
  'actions/orchestrator:scheduleEnrichmentInternal' \
  '{"universityId":"<id>"}'

# Sequential batch — each university schedules the next on completion
npx convex run --deployment prod \
  'actions/orchestrator:scheduleEnrichmentBatch' \
  '{"queue":["<id1>","<id2>","<id3>"]}'

# Poll status (one-shot, no long wait)
npx convex run --deployment prod \
  'universities:getInternal' \
  '{"universityId":"<id>"}'
```

The chain runs as: `scheduleEnrichmentInternal` → `runEnrichmentChainInternal` (phases 1–4) → `finishEnrichmentChainInternal` (phases 5–6 + queue chaining). Each stage gets a full Convex action runtime budget.

## More Documentation

- [Architecture / Codebase map](./CODEBASE.md)
- [End-user guide](./user-guide.md) ([PDF](./user-guide.pdf))
- [Quick user guide](./user-guide-lite.md) ([PDF](./user-guide-lite.pdf))
- [Convex backend notes](./convex/README.md)
- [Implementation plan](./docs/PLAN.md)
- [Requirements](./docs/Requirement.md)
- [Roadmap / as-built record](./docs/roadmap.md)
- [Design system](./design-system/onboardingai/MASTER.md)
- [Production readiness report](./docs/PRODUCTION_READINESS.md)
- [Operations runbook](./docs/runbook.md)
- [Client onboarding guide](./docs/CLIENT_ONBOARDING.md)

## Admin ops (CLI)

```bash
# Force-logout all users after a JWT key rotation / auth upgrade
npx convex run 'admin:clearAllAuthSessions'
# Purge stale password-reset verification codes
npx convex run 'admin:clearAuthVerificationCodes'
```

Both are `internalMutation`s — safe to run anytime; users simply sign in again.

---

© 2026 Fretbox. Confidential.
