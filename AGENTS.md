# AGENTS.md — Fretbox Outreach AI v2

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

## Key patterns to preserve

- **Public actions** (user-facing buttons/forms) must call `await validateAuth(ctx)` at the top of the handler.
- **Internal actions** (scheduler, cron, webhook, test-only) should use `internalAction` and be called via `internal.actions.*` or `internal.<module>.*`.
- **Do not call `api.actions.*` from internal code or webhooks.** Use `internal.actions.*` instead.
- **Avoid circular `any` inference:** if a public wrapper and an `internalAction` in the same file reference each other, extract the shared logic into a `do*` helper with an explicit return type and have both wrappers call it.
- **API keys** are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`. The `set*Key` mutations use `sanitizeApiKey()` to reject control characters and non-ASCII bytes.
- **HTTP test endpoints** in `convex/http.ts` are disabled by default. Enable them with `DISABLE_TEST_ENDPOINTS=false` and pass `TEST_WEBHOOK_SECRET` as a bearer token.

<!-- convex-ai-end -->

## Learned project info

### Tech stack

- Convex + Next.js 15 + React 19 + Tailwind CSS v3.4.1
- Convex backend: queries, mutations, actions, crons, HTTP routes, vector search, and a `systemSettings` key-value store for API keys

### Data seeding

- 80 curated INIs (IIT/NIT/IIIT) are seeded via `convex/actions/iniSeed.ts` and protected from UGC sync overwrites in `convex/actions/ugcSync.ts`

### Email and webhooks

- ZeptoMail is the email service: `convex/actions/email.ts`, `convex/http.ts` webhooks, and settings in `convex/settings.ts`
- Webhook paths live on the Convex site origin: `https://<project>.convex.site/webhooks/zeptomail` and `https://<project>.convex.site/webhooks/email-reply`
- Emails are HITL-approved: `convex/actions/email.ts` `approveAndSend` only sends after a human approves a `pending_approval` draft
- Reply classification and auto-replies are in `convex/actions/replyClassifier.ts` and `convex/actions/autoReply.ts`
- Proposals use Google Calendar integration in `convex/actions/proposals.ts` and `convex/lib/googleCalendar.ts`

### Build, test, and verification commands

- Master checklist script: `python3 .devin/scripts/checklist.py .`
- Type check: `npx tsc --noEmit`
- Lint: `npm run lint`
- Unit tests: `npm run test:unit`
- E2E tests: `npm test` (Playwright; requires dev server on port 3000)

### Configuration findings

- Playwright `baseURL` is `http://localhost:3000`
- ZeptoMail webhooks live on `.convex.site`, not `.convex.cloud`
- Email sending requires all three of: ZeptoMail API key, From Email, and From Name

## Documentation update reminders

When a feature, setting, or architecture boundary changes, update these project docs so they stay implementation-aligned:

- `README.md` — high-level overview, quick start, env vars, features
- `CODEBASE.md` — central navigation map, file structure, architecture patterns
- `convex/README.md` — Convex conventions, webhooks, backend env vars
- `user-guide.md` and `user-guide-lite.md` — end-user flows
- `docs/PLAN.md`, `docs/Requirement.md`, `docs/roadmap.md` — planning and requirements
- `design-system/onboardingai/MASTER.md` — design tokens and UI patterns
