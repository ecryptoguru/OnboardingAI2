# Fretbox Outreach AI v2

AI-native outreach engine for university hostel management. Built on **Convex** + **Next.js 15** + **React 19** + **Tailwind CSS 3.4.1**.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Generate Convex TypeScript bindings
npx convex codegen

# Start the Next.js dev server and Convex local sync
npm run dev
```

The Next.js app runs at `http://localhost:3000` (Playwright's `baseURL` is `http://localhost:3000`).

You can also run them separately:

```bash
npm run dev:convex   # npx convex dev
npm run dev:next     # next dev
```

## 🔧 Environment Setup

Set these in your Convex dashboard or with `npx convex env set <NAME> <VALUE>`:

| Variable | Required | Description |
| ---------- | ---------- | ------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex API URL for the frontend: `https://<project>.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Yes | Convex **site** URL for HTTP actions and webhooks: `https://<project>.convex.site` |
| `SITE_URL` | Yes | Public frontend URL used for password-reset callbacks (e.g., `https://your-app.vercel.app` or `http://localhost:3000`) |
| `SETTINGS_OBFUSCATION_SECRET` | Yes | XOR-obfuscation secret for API keys stored in DB (≥ 32 characters) |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | Recommended | Verify Google Calendar push notification `x-goog-channel-token` |
| `LLM_DAILY_BUDGET_USD` | Recommended | Daily LLM spend soft cap (default $50) |
| `DISABLE_TEST_ENDPOINTS` | Yes for tests | Set `false` to enable HTTP test endpoints in `convex/http.ts` |
| `TEST_WEBHOOK_SECRET` | Recommended | Bearer token required for HTTP test endpoints |
| `REQUIRE_WEBHOOK_AUTH` | Recommended | Set `true` to require shared-secret auth on inbound webhooks |
| `ADMIN_EMAILS` | Optional | Comma-separated admin emails for `validateAdmin` (leave empty in dev to allow all authenticated users) |
| `SKIP_RATE_LIMITS` | Optional | Set `true` **only** for local testing; must be unset in production |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional | Sentry server/client error tracking DSN |
| `ZEPTOMAIL_WEBHOOK_SECRET` | Recommended | HMAC secret for `/webhooks/zeptomail` delivery events |
| `EMAIL_WEBHOOK_SECRET` | Recommended | Bearer token for `/webhooks/email-reply` inbound replies |

## ⚙️ Dashboard Settings

API keys and sender details are managed in **Settings → API Keys**. Values are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`:

| Setting | What It Powers |
| ------- | ---------------- |
| **Google Gemini** | AI reasoning, reply classification, proposal generation |
| **Serper** | Web search, news, and image discovery |
| **Firecrawl** | Deep crawling, sitemap discovery, contact extraction |
| **ZeptoMail API Key** | Sending transactional and outreach emails, including password reset codes |
| **ZeptoMail From Email** | Verified sender address for outbound emails (default: `outreach@fretbox.in`) |
| **ZeptoMail From Name** | Display name for outbound emails (default: `Ashish Gupta (Fretbox)`) |
| **Google Calendar Service Account** | Creating calendar events and Meet links from proposals |
| **Google Calendar ID** | Target calendar for event creation (defaults to `primary`) |

## 🔐 Authentication

- **Email / Password Auth**: Convex Auth Password provider (`convex/auth.ts`).
- **Forgot Password**: Request a reset code at `/forgot-password` and set a new password on `/reset-password`. Reset codes are sent through ZeptoMail via `actions/email.ts:sendEmail` and expire in 1 hour.
- **Admin gating**: Use `ADMIN_EMAILS` to restrict access to admin-only routes; leave empty in local dev to allow all authenticated users.

## 🛠 Tech Stack

- **Backend / DB**: [Convex](https://convex.dev) (Queries, Mutations, Actions, Crons, HTTP, Vector Search)
- **Frontend**: [Next.js 15](https://nextjs.org) + [React 19](https://react.dev) + [Tailwind CSS 3.4.1](https://tailwindcss.com)
- **AI**: Google Gemini 3.5 Flash (reasoning), Gemini 3.1 Flash-Lite (speed), `gemini-embedding-001` (768-dim)
- **Email**: [ZeptoMail](https://www.zoho.com/zeptomail/) REST API
- **Proposal rendering**: Rich HTML emails (legacy `pdf_storage_id` field remains in schema but is not used)
- **Scraping**: Firecrawl + Jina Reader + `fetch` fallback

## ✨ Core Features

- **University Ingestion**: Bulk CSV upload, UGC.gov.in sync, and 80 curated Institutes of National Importance (IIT / NIT / IIIT) seeded via `convex/actions/iniSeed.ts`.
- **INI Seed Protection**: Curated INI records are marked `data_source: "curated"` and are skipped by the UGC sync, preventing overwrites. Use the **Sync IITs / NITs / IIITs** button on the Universities dashboard to (re)seed them.
- **Automated Discovery**: AI finds and validates university websites, then enriches signals.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Gemini.
- **HITL Approval**: Outreach emails are drafted with `status: "pending_approval"`. A human must approve each draft via the dashboard; `actions/email.ts:approveAndSend` then dispatches it through ZeptoMail and resumes the sequence.
- **Reply Classification**: Inbound replies are classified and high-confidence auto-replies are sent via `actions/autoReply.ts:sendAutoReply`.
- **Proposal Automation**: Calendar bookings trigger AI-generated proposals with Google Meet links; `actions/proposals.ts:emailProposal` sends the proposal to stakeholders.
- **Real-time Monitoring**: Polished glassmorphism dashboard for tracking pipeline, analytics, and approvals.

## Webhooks

HTTP actions live in `convex/http.ts` and are served from the **Convex site URL** (`NEXT_PUBLIC_CONVEX_SITE_URL`, e.g., `*.convex.site`), not the API URL (`*.convex.cloud`). Configure the following webhooks in ZeptoMail / Google Calendar:

| Path | Purpose | Auth |
| ------ | --------- | ------ |
| `/webhooks/zeptomail` | Delivery, open, click, bounce events from ZeptoMail | HMAC via `ZEPTOMAIL_WEBHOOK_SECRET` |
| `/webhooks/email-reply` | Inbound reply payloads (JSON or form-data) | Bearer token via `EMAIL_WEBHOOK_SECRET` |
| `/webhooks/google-calendar` | Google Calendar push notifications | `x-goog-channel-token` via `GOOGLE_CALENDAR_WEBHOOK_TOKEN` |

When `REQUIRE_WEBHOOK_AUTH` is unset or `false`, missing secrets are bypassed with console warnings for local dev only.

## 🛡 Hardening

- **Authentication**: Public user-facing actions call `validateAuth(ctx)`; scheduler, webhook, and seed actions are `internalAction`s invoked via `internal.*`.
- **HTTP Security**: Webhook endpoints verify HMAC or bearer tokens; test endpoints are locked by default (`DISABLE_TEST_ENDPOINTS=true`).
- **API Key Hygiene**: `sanitizeApiKey()` enforces printable ASCII (33–126) before keys are stored; values are XOR-obfuscated at rest.
- **Rate Limits**: Per-destination rate limits (e.g., 3 emails/minute to a single address). Use `SKIP_RATE_LIMITS` only for local testing.
- **LLM Budget**: `LLM_DAILY_BUDGET_USD` acts as a daily soft cap for LLM spend.
- **Monitoring**: Sentry error tracking and performance profiling integrated into background actions.
- **Resilience**: Exponential backoff with `withRetry` for external API calls.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion; `getFunnelStats` uses full counts for accurate analytics.

## ✅ Testing & Verification

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Unit tests (tsx / node test runner, ~440 tests)
npm run test:unit

# E2E tests (Playwright, 59 tests, baseURL http://localhost:3000)
npm run test

# Full master checklist
python3 .devin/scripts/checklist.py .

# Production build
npm run build
```

## 📝 Recent Updates

- 80 curated IITs / NITs / IIITs seeded and protected from UGC overwrites; new unit tests added in `tests/unit/iniSeed.test.ts`.
- Human-in-the-loop (HITL) approval flow: outreach emails are drafted as `pending_approval` before sending.
- ZeptoMail integration expanded with from-email, from-name, delivery webhooks, and inbound reply handling.
- UI color audit: banned violet color removed.
- UX/SEO audit script false positives fixed.

---

© 2026 Fretbox. Confidential.
