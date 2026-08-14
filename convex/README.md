# Convex functions directory

This directory contains the `fretbox-outreach-v2` Convex backend: queries, mutations, actions, HTTP routes, crons, and shared libraries.

See [Convex function docs](https://docs.convex.dev/functions) for general Convex docs.

## Quick start

```bash
# Start local dev sync and run the dev deployment
npx convex dev

# Regenerate TypeScript bindings after schema or action changes
npx convex codegen

# Set a backend environment variable
npx convex env set SETTINGS_OBFUSCATION_SECRET <at-least-32-char-secret>

# Deploy to a production Convex project
npx convex deploy
```

Run `npx convex -h` for the full CLI. Launch the docs with `npx convex docs`.

## Important conventions

- **Public actions** exposed to the frontend must call `await validateAuth(ctx)` at the start.
- **Internal actions** (called by crons, webhooks, or other server code) use `internalAction` and are invoked via `internal.actions.*` or `internal.<module>.*`.
- **Do not call `api.actions.*` from internal code.** Use `internal.actions.*` instead.
- **API keys** are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`. The minimum secret length is 32 characters.
- **Sanitization**: `set*Key` mutations use `sanitizeApiKey()` to reject control characters and non-ASCII bytes (printable ASCII 33–126 only).
- **HTTP test endpoints** in `convex/http.ts` are disabled by default; enable them with `DISABLE_TEST_ENDPOINTS=false` and `TEST_WEBHOOK_SECRET`.
- **Run `npx convex codegen`** after schema or action changes to regenerate TypeScript bindings.

## HTTP actions and webhooks

HTTP actions are defined in `convex/http.ts`. They are served from the **Convex site URL** (`*.convex.site`, set as `NEXT_PUBLIC_CONVEX_SITE_URL` in the frontend), not the API URL (`*.convex.cloud`).

| Route | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/webhooks/zeptomail` | POST | ZeptoMail delivery, open, click, and bounce events | `producer-signature` HMAC, `ZEPTOMAIL_WEBHOOK_SECRET` |
| `/webhooks/email-reply` | POST | Inbound email reply payloads (JSON or form-data) | `Authorization: Bearer`, `EMAIL_WEBHOOK_SECRET` |
| `/webhooks/google-calendar` | POST | Google Calendar push/sync notifications | `x-goog-channel-token`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN` |
| `/test/ping` | GET | Health check | None |
| `/test/run-pipeline` | POST | Real-world integration test trigger | Bearer token, `TEST_WEBHOOK_SECRET` |

Webhook endpoints are disabled until their specific secret is configured; unconfigured webhooks return `401 Unauthorized`.

## Email pipeline

All outbound email flows through `convex/actions/email.ts` and the ZeptoMail REST API (`https://api.zeptomail.in/v1.1/email`).

| Action | File | Purpose |
| --- | --- | --- |
| `sendEmail` | `actions/email.ts` | Generic internal action for transactional/outbound email; used by password reset and other actions. Now supports base64 `attachments`. |
| `approveAndSend` | `actions/email.ts` | HITL gate: sends a drafted `pending_approval` email, records the ZeptoMail `request_id`, resumes the sequence, and fetches/encodes any stored attachments. |
| `parseDocx` | `actions/document.ts` | Parses an uploaded `.docx` into plain text and HTML. |
| `createDocumentDrafts` | `actions/document.ts` | Creates one `pending_approval` email draft per recipient from a parsed `.docx`; recipients can be stakeholders or custom emails. |
| `emailProposal` | `actions/proposals.ts` | Sends the generated partnership proposal as rich HTML to the stakeholder and CC list. |
| `sendAutoReply` | `actions/autoReply.ts` | Sends threaded auto-replies via ZeptoMail with `Message-ID`, `In-Reply-To`, and `References` headers. |

From email and from name are read from `systemSettings` (`zeptomailFromEmail`, `zeptomailFromName`) and fall back to `outreach@fretbox.in` / `Ashish Gupta (Fretbox)`.

## Human-in-the-loop (HITL) outreach

Outreach sequence emails are inserted into `emailsSent` with `status: "pending_approval"`. A user must approve a draft in the dashboard before `approveAndSend` dispatches it. After sending, the email status becomes `"sent"` and the parent `outreachSequences` resumes with the next cadence step from `convex/lib/cadence.ts`.

## Institutes of National Importance (INI) seed

- `convex/lib/institutesOfNationalImportance.ts` holds the curated list of **80 IITs, NITs, and IIITs**.
- `convex/actions/iniSeed.ts` exposes `syncInstitutesOfNationalImportance` (public UI button) and `syncInstitutesOfNationalImportanceInternal` (for crons/tests).
- Matching logic uses normalized names and website domains; records with `data_source: "curated"` are skipped by the UGC sync in `convex/actions/ugcSync.ts`.
- Use the **Sync IITs / NITs / IIITs** button on the Universities dashboard to seed or refresh these records.

## Backend environment variables

These environment variables are read inside `convex/` functions:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Auth, client actions | Convex API URL |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Webhooks | Site URL for HTTP actions |
| `SITE_URL` | `convex/auth.config.ts` | Password-reset callback URL |
| `SETTINGS_OBFUSCATION_SECRET` | `settings.ts` | XOR obfuscation of stored API keys (≥ 32 chars) |
| `LLM_DAILY_BUDGET_USD` | `llmBudget.ts`, `lib/llm.ts` | Daily LLM spend soft cap (default `$50`) |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | `http.ts` | Google Calendar channel token verification |
| `ZEPTOMAIL_WEBHOOK_SECRET` | `http.ts` | ZeptoMail webhook HMAC secret |
| `EMAIL_WEBHOOK_SECRET` | `http.ts` | Inbound reply webhook bearer token |
| `DISABLE_TEST_ENDPOINTS` | `http.ts` | Set `false` to enable `/test/*` HTTP actions |
| `TEST_WEBHOOK_SECRET` | `http.ts` | Bearer token for `/test/run-pipeline` |
| `ADMIN_EMAILS` | `lib/auth_utils.ts` | Comma-separated admin emails |
| `SKIP_RATE_LIMITS` | `lib/utils.ts` | Bypass rate limits in local dev only |
| `SENTRY_DSN` | `instrumentation.ts` | Server-side Sentry DSN |

## Verification

```bash
npx convex codegen
npx tsc --noEmit
npm run lint
npm run test:unit
python3 .devin/scripts/checklist.py .
```

## More information

- `convex/_generated/ai/guidelines.md` — Convex API and pattern guidelines
- [Project README](../README.md) — full stack overview
- [CODEBASE map](../CODEBASE.md) — central navigation reference

## Deep enrichment pipeline

`convex/actions/deepEnrichment.ts` runs a source-partitioned extraction flow:

1. **Firecrawl map** (≤8 credits/university) discovers high-yield pages, scored by URL and page title. Switches to Jina after insufficient-credit detection.
2. **External search** (Serper, ≤14 queries/university, budget-enforced) finds leadership/LinkedIn/contact pages (government data is intentionally handled by `enrichGovernmentData.ts`).
3. **Bounded fetches** with retries and concurrency limits populate page content.
4. **Per-source LLM extraction** (`gemini-3.7-flash`, fallback to `gemini-3.5-flash-lite`) extracts stakeholders and demographics for each top source.
5. **Merge LLM** (`gemini-3.7-flash`, fallback to `gemini-3.5-flash-lite`) deduplicates partials and resolves conflicts.
6. **Runtime validation** (`lib/validateDeepEnrichment.ts`) sanitizes output before persistence, including acting-suffix normalization (`Offg.` / `I/c` / `Acting`).
7. **Singleton-role enforcement** (`stakeholders.dedupeSingletonRoleContactsInternal`) collapses same-person acting duplicates while preserving the original role label.
8. **Gap-fill** (`lib/gapFill.ts`) runs when VC/Registrar is missing: free passes first (officers-table, NIRF officer, thin-site snippet), Serper last. `verifyNameRoleProximity` plus URL/department guards prevent false positives.
9. **Provenance** is attached: stakeholder `source_url`/`sources` and demographics `source_urls`/`data_quality`. `phone_source` / `linkedin_source` are set to `"none"` when values are stripped.
10. **Dry-run mode** on `runDeepEnrichment` returns extracted data without writing to the DB.

Key shared helpers:

- `convex/lib/roleRegistry.ts` — canonical role names, aliases, decision/singleton flags.
- `convex/lib/scrapers.ts` — URL scoring, contact extraction, phone-to-stakeholder matching, `unpdf`-based `extractPdfText` / `extractPdfTables`.
- `convex/lib/perSourceExtraction.ts` — map-reduce per-source extraction.
- `convex/lib/validateDeepEnrichment.ts` — structured output validation, provenance helpers, acting-suffix normalization.
- `convex/lib/gapFill.ts` — gap-fill for missing VC/Registrar with proximity verification.
- `convex/actions/stakeholderCleanup.ts` — stale/scraper-only record cleanup and provenance self-consistency.

Government PDFs and official demographic data are intentionally owned by `convex/actions/enrichGovernmentData.ts` (which uses `unpdf` `extractPdfText` / `extractPdfTables`) so `deepEnrichment` focuses on website stakeholders and contacts.

## Scheduled long-running enrichment

Long enrichment chains must not be awaited inline from `npx convex run` (the CLI client waits ~5 minutes). Use the scheduler-based entrypoints in `convex/actions/orchestrator.ts`:

- `scheduleEnrichmentInternal` (single university) — marks `outreach_stage: "enriching"`, schedules `runEnrichmentChainInternal`, returns immediately.
- `scheduleEnrichmentBatch` (sequential queue) — schedules the first university with the rest of the queue; each chain schedules the next on completion so Firecrawl/Serper are never hit concurrently.
- `runEnrichmentChainInternal` — phases 1–4 (discovery, scrape/anti-ragging/social, contact inference, government data, deep enrichment), then schedules `finishEnrichmentChainInternal`.
- `finishEnrichmentChainInternal` — phases 5–6 (social refresh, scoring), credit telemetry, progress completion, and sequential queue chaining.

Production commands:

```bash
npx convex run --deployment prod \
  'actions/orchestrator:scheduleEnrichmentInternal' \
  '{"universityId":"<id>"}'

npx convex run --deployment prod \
  'actions/orchestrator:scheduleEnrichmentBatch' \
  '{"queue":["<id1>","<id2>","<id3>"]}'

npx convex run --deployment prod \
  'universities:getInternal' \
  '{"universityId":"<id>"}'
```

## API provider alerts

When Gemini / Firecrawl / Serper hit quota exhaustion or an error during any background activity, the backend records an alert via `apiAlerts.recordInternal` (internalMutation, 6h dedup on identical unacknowledged alerts). The frontend `components/ApiAlertModal.tsx` (mounted in `app/(dashboard)/layout.tsx`) surfaces unacknowledged alerts with Dismiss (session-only) / Got-it (persists `acknowledged_at`) actions.

- `apiAlerts.list` (query, `validateAuth`-gated) — latest 50 alerts, newest first.
- `apiAlerts.acknowledge` / `apiAlerts.acknowledgeAll` (mutations, `validateAuth`-gated) — mark alerts acknowledged.
- `apiAlerts.recordInternal` (internalMutation) — deduplicated insert.
- `apiAlerts.removeInternal` (internalMutation) — delete.

Provider error handling:

- Gemini quota/rate-limit errors are caught centrally in `convex/lib/llm.ts`.
- Firecrawl 429/insufficient-credit errors are recorded in `deepEnrichment.ts`; Firecrawl switches to Jina after insufficient credits instead of retrying.
- Serper quota exhaustion is detected in `deepEnrichment.ts`, `enrichGovernmentData.ts`, `scraper.ts`, `enrichment.ts`, and `lib/gapFill.ts`.

## PDF extraction (unpdf)

PDF extraction uses [`unpdf`](https://github.com/web-infra-dev/unpdf) `^1.8.1` (serverless-safe PDF.js build) instead of the worker-dependent `pdfjs-dist`. The legacy `convex/lib/pdfPolyfills.ts` has been removed.

- `extractPdfText(buffer)` — plain-text extraction.
- `extractPdfTables(buffer)` — table-like extraction.

Both are in `convex/lib/scrapers.ts` and used by `convex/actions/enrichGovernmentData.ts` for NIRF/AISHE/NAAC PDFs. Distinguish parser success from data availability — a parsed PDF with no numeric enrollment values is not a demographic success.

## Model allocation

`convex/lib/models.ts` defines the model constants. Current allocation:

| Pipeline path | Model |
| --- | --- |
| Per-source extraction, partial-merge, complex reasoning, proposals | `gemini-3.7-flash` (thinking `LOW`) |
| Scraper extraction, government-data extraction, scoring, personalization | `gemini-3.5-flash-lite` |
| Embeddings (768-dim) | `gemini-embedding-001` |

Gemini 3.7 Flash pricing: `$0.75/$3.75` per million (input/output) through 2026-12-31, then `$1.50/$7.50`. Thinking tokens are counted in `thoughtsTokenCount` and billed at the output rate. `MINIMAL` thinking is rejected by 3.7; use `LOW` / `MEDIUM` / `HIGH`.

---

© 2026 Fretbox. Confidential.
