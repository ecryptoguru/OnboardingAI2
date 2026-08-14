# AGENTS.md — Fretbox Outreach AI v2

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Learned project info

### Tech stack

- Convex `^1.42.1` + Next.js 16.3.1 (Webpack-pinned) + React 19 + Tailwind CSS v3.4.1
- Auth: `@convex-dev/auth` `^0.0.95` + `@auth/core` `^0.41.3`
- AI: Google Gemini `@google/genai` `^1.43.0` — `gemini-3.7-flash` (complex / per-source / merge), `gemini-3.5-flash-lite` (scraper / scoring / personalization), `gemini-embedding-001` (768-dim). Constants in `convex/lib/models.ts`.
- PDF: `unpdf` `^1.8.1` (serverless-safe; replaces `pdfjs-dist`).
- Convex backend: queries, mutations, actions, crons, HTTP routes, vector search, scheduler, and a `systemSettings` key-value store for API keys
- Next.js 16 notes: `middleware.ts` renamed to `proxy.ts`; `dev`/`build` scripts pass `--webpack` to preserve the custom webpack config; the obsolete `eslint` config property was removed from `next.config.ts`.

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
- Unit tests: `npm run test:unit` (~496 tests, hermetic — no API keys required)
- E2E tests: `npm test` (Playwright; requires dev server on port 3000)
- Build: `npm run build` (`next build --webpack`)
- Security audit: `npm audit --audit-level=high`
- Convex codegen: `npx convex codegen` — **required** after adding any new Convex module/function to regenerate TypeScript bindings.

### Configuration findings

- Playwright `baseURL` is `http://localhost:3000`
- ZeptoMail webhooks live on `.convex.site`, not `.convex.cloud`
- Email sending requires all three of: ZeptoMail API key, From Email, and From Name
- Production Convex deployment: `energetic-raven-535` (URL `https://energetic-raven-535.convex.cloud`). Run production enrichment via `npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentInternal' '{"universityId":"<id>"}'` — do not await long chains inline (CLI ~5-min wait).
- Long-running enrichment is split across scheduled actions (`scheduleEnrichmentInternal` → `runEnrichmentChainInternal` → `finishEnrichmentChainInternal`); sequential batches chain via the scheduler.
- Provider quota/errors (Gemini / Firecrawl / Serper) are recorded in the `apiAlerts` table (6h dedup) and surfaced in the frontend via `components/ApiAlertModal.tsx`.
- Singleton-role deduplication normalizes `Offg.` / `I/c` / `Acting` suffixes (including punctuation inside parentheses and space-separated suffixes) while preserving the original role label.
- Gap-fill for missing VC/Registrar runs free passes first, Serper last, with `verifyNameRoleProximity` + URL/department guards to prevent false positives.
- PDF extraction uses `unpdf` (serverless-safe); do not reintroduce `pdfjs-dist`.
- Do not fabricate missing VC/Registrar/demographic data — preserve `null` and emit warnings when no official data exists.

## Documentation update reminders

When a feature, setting, or architecture boundary changes, update these project docs so they stay implementation-aligned:

- `README.md` — high-level overview, quick start, env vars, features
- `CODEBASE.md` — central navigation map, file structure, architecture patterns
- `convex/README.md` — Convex conventions, webhooks, backend env vars
- `user-guide.md` and `user-guide-lite.md` — end-user flows
- `docs/PLAN.md`, `docs/Requirement.md`, `docs/roadmap.md` — planning and requirements
- `design-system/onboardingai/MASTER.md` — design tokens and UI patterns
