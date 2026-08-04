# Fretbox Outreach AI v2

AI-native outreach engine for university hostel management. Built on **Convex**, **Next.js 15**, **React 19**, and **Tailwind CSS 3.4.1**.

## Quick Start

```bash
npm install

# Start local Convex sync and the Next.js dev server
npm run dev
```

The app runs at `http://localhost:3000` (Playwright `baseURL` is `http://localhost:3000`).

Run the frontend and backend separately if needed:

```bash
npm run dev:next   # next dev
npm run dev:convex # npx convex dev
```

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
- **Admin gating**: Use `ADMIN_EMAILS` to restrict access to admin-only routes; leave empty in local dev to allow all authenticated users.

## Tech Stack

- **Backend / DB**: [Convex](https://convex.dev) (queries, mutations, actions, crons, HTTP, vector search)
- **Frontend**: [Next.js 15](https://nextjs.org) + [React 19](https://react.dev) + [Tailwind CSS 3.4.1](https://tailwindcss.com)
- **Auth**: `@convex-dev/auth` with Password provider
- **AI**: Google Gemini (`gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-embedding-001`)
- **Email**: [ZeptoMail](https://www.zoho.com/zeptomail/) REST API
- **Scraping**: Firecrawl + Jina Reader + `fetch` fallback
- **Testing**: Playwright E2E (`tests/e2e`, baseURL `http://localhost:3000`) + tsx unit tests (`tests/unit/*.test.ts`)
- **Monitoring**: Sentry (`@sentry/nextjs` frontend, `@sentry/node` backend)

## Core Features

- **University Ingestion**: CSV upload, UGC.gov.in sync, and 80 curated Institutes of National Importance (IIT/NIT/IIIT) seeded via `convex/actions/iniSeed.ts`.
- **INI Seed Protection**: Curated records are marked `data_source: "curated"` and are skipped by the UGC sync, preventing overwrites.
- **Automated Discovery**: AI finds and validates university websites, then enriches signals.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Gemini.
- **HITL Approval**: Outreach emails are drafted with `status: "pending_approval"`. A human must approve each draft via the dashboard before it is sent.
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
- **Resilience**: Exponential backoff with `withRetry` for external API calls.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion; `getFunnelStats` uses full counts for accurate analytics.

## Testing and Verification

```bash
npx tsc --noEmit          # Type check
npm run lint              # Lint
npm run test:unit         # Unit tests (~440 tests)
npm test                  # E2E tests (Playwright, baseURL http://localhost:3000)
python3 .devin/scripts/checklist.py .  # Full master checklist
npm run build             # Production build
```

## More Documentation

- [Architecture / Codebase map](./CODEBASE.md)
- [End-user guide](./user-guide.md)
- [Quick user guide](./user-guide-lite.md)
- [Convex backend notes](./convex/README.md)
- [Implementation plan](./docs/PLAN.md)
- [Requirements](./docs/Requirement.md)
- [Roadmap / as-built record](./docs/roadmap.md)
- [Design system](./design-system/onboardingai/MASTER.md)

---

© 2026 Fretbox. Confidential.
