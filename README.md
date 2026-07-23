# Fretbox Outreach AI v2

AI-native outreach engine for university hostel management. Built on Convex + Next.js 15.

## 🚀 Quick Start

### 1. Project Initialization

```bash
# Install dependencies
npm install

# Generate Convex TypeScript bindings
npx convex codegen

# Start development environment
npx convex dev
npm run dev -- -p 3001
```

### 2. Environment Setup

Set these environment variables in your Convex dashboard (or via `npx convex env set`):

- `NEXT_PUBLIC_CONVEX_URL` — Convex deployment URL for the frontend
- `NEXT_PUBLIC_CONVEX_SITE_URL` — Convex site URL (HTTP actions)
- `SITE_URL` — Public frontend URL used by Convex Auth for password-reset callbacks (e.g., `https://your-app.netlify.app` or `https://your-app.vercel.app`)
- `SETTINGS_OBFUSCATION_SECRET` — XOR-obfuscate API keys stored in DB
- `GOOGLE_CALENDAR_WEBHOOK_TOKEN` — Verify Google Calendar push notifications
- `LLM_DAILY_BUDGET_USD` — Daily LLM spend soft cap (default $50)
- `DISABLE_TEST_ENDPOINTS` — Set `false` to enable HTTP test endpoints in `convex/http.ts`
- `TEST_WEBHOOK_SECRET` — Bearer token required for HTTP test endpoints
- `REQUIRE_WEBHOOK_AUTH` — Set `true` to require shared-secret on inbound webhooks
- `ADMIN_EMAILS` *(optional)* — Comma-separated admin emails for `validateAdmin` (leave empty to allow all authenticated users in dev)
- `SKIP_RATE_LIMITS` *(optional)* — Set `true` only for local testing; must be unset in production
- `SENTRY_DSN` *(optional)* — Sentry error tracking

### 3. Dashboard Settings

API keys and sender details are managed in **Settings → API Keys** in the app. Values are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`:

| Setting | What It Powers |
| ------- | ---------------- |
| **Google Gemini** | AI reasoning, reply classification, proposal generation |
| **Serper** | Web search, news, and image discovery |
| **Firecrawl** | Deep crawling, sitemap discovery, contact extraction |
| **ZeptoMail API Key** | Sending transactional and outreach emails, including password reset codes |
| **ZeptoMail From Email** | Verified sender address for all outbound emails (default: `outreach@fretbox.in`) |
| **ZeptoMail From Name** | Display name for outbound emails |
| **Google Calendar Service Account** | Creating calendar events and Meet links from proposals |

### 4. Authentication

- **Email / Password Auth**: Convex Auth Password provider (`convex/auth.ts`).
- **Forgot Password**: Users can request a reset code via `/forgot-password` and set a new password on `/reset-password`. Reset codes are sent through ZeptoMail and expire in 1 hour.

### 5. Core Features

- **University Ingestion**: Bulk CSV upload and UGC.gov.in sync.
- **Automated Discovery**: AI finds and validates university websites, then enriches signals.
- **Outreach Orchestrator**: Multi-step, personalized email sequences with Gemini 3.5 Flash.
- **Reply Classification**: Inbound replies are classified and auto-replies are sent only when confidence is high.
- **Proposal Automation**: Google Calendar bookings trigger AI-generated proposals with Google Meet links.
- **Real-time Monitoring**: Polished glassmorphism dashboard for tracking pipeline, analytics, and approvals.

## 🛠 Tech Stack

- **Backend/DB**: [Convex](https://convex.dev) (Queries, Mutations, Actions, Crons, HTTP, Vector Search)
- **Frontend**: [Next.js 15](https://nextjs.org) + React 19 + Tailwind CSS
- **AI**: Gemini 3.5 Flash (reasoning), Gemini 3.1 Flash-Lite (speed), `gemini-embedding-001` (768-dim)
- **Email**: ZeptoMail REST API
- **PDF**: `@react-pdf/renderer` for proposal PDFs
- **Scraping**: Firecrawl + Jina Reader + `fetch` fallback

## 🛡 Hardening

- **Authentication**: Public user-facing actions require `validateAuth()`; scheduler/webhook actions are internalized (`internalAction`).
- **HTTP Security**: Webhook endpoints verify HMAC signatures or bearer tokens; test endpoints are locked by default (`DISABLE_TEST_ENDPOINTS`).
- **API Key Hygiene**: `sanitizeApiKey()` enforces printable ASCII (33–126) before keys are stored in the database.
- **Monitoring**: Sentry error tracking and performance profiling integrated into background actions.
- **Resilience**: Exponential backoff with `withRetry` for all external API calls.
- **Intelligence**: Centralized prompt library in `convex/lib/prompts.ts` for unified AI governance.
- **Optimization**: Batch mutations for high-frequency signal ingestion; `getFunnelStats` uses full counts for accurate analytics.

## ✅ Verification

```bash
npx convex codegen
npx tsc --noEmit
npm run lint
npm run test:unit
npm run build
```

---
© 2026 Fretbox. Confidential.
