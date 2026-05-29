# Comprehensive Multi-Domain Review — Fretbox Outreach AI v2

**Date:** 2026-05-29
**Scope:** Security, Backend/API, Database, Frontend/UI, Testing, AI Pipeline
**Previous Audit:** docs/AI_AUDIT_REPORT.md (reviewed for staleness against current code)

---

## 🟢 Already Fixed (Since AI Audit Report)

Many AI audit findings have already been addressed in recent commits:

| Issue | Status | Evidence |
|-------|--------|----------|
| **B1 — No fetch timeouts** | ✅ FIXED | All external fetches now have `AbortSignal.timeout()` (Jina 15s, Serper 15s, Firecrawl 20-25s, validateWebsite 5s). Google SDK has `httpOptions: { timeout: 20000 }`. |
| **B3 — Naive context truncation** | ✅ PARTIALLY FIXED | `deepEnrichment.ts` uses `truncateAtNewline()` (newline-aware). `scraper.ts` still uses naive `substring` — see **NEW-1** below. |
| **R1 — Prompt injection sanitization** | ✅ FIXED | `sanitizeLlmInput` is used in `scraper.ts`, `deepEnrichment.ts`, and `replyClassifier.ts`. `normalizeContent` in deep enrichment also filters adversarial patterns. |
| **R3 — Enrichment chain partial failure** | ✅ FIXED | `orchestrator.ts` returns `{ success: allOk, steps: results }` where `allOk` requires ALL steps to succeed. |
| **R5 — SCORING_FACTORS dead code** | ✅ FIXED | `SCORING_FACTORS` map no longer exists in `lib/scoring.ts`. `calculateDeterministicScore` uses inline conditionals consistently. |
| **R6 — Scraper uses expensive model** | ✅ FIXED | `scraper.ts` calls `MODELS.geminiFlash` (`gemini-3.1-flash-lite-preview`) — the cheapest viable model. |
| **R7 — Image signals store raw URLs** | ✅ FIXED | `enrichment.ts:218` stores `"${imgTitle} | ${imgUrl}"` so title provides fallback context if URL rots. |
| **R8 — Stakeholder deduplication** | ✅ FIXED | `scraper.ts:122-147` queries existing stakeholders and filters by email+name before inserting. `deepEnrichment.ts:534` uses `upsertBulkInternal`. |
| **R9 — LinkedIn role-only queries** | ✅ FIXED | `enrichment.ts:47-49` filters to stakeholders with `name && name.trim().length > 2`. No nameless stakeholders trigger searches. |

---

## 🔴 BLOCKERS (Still Valid)

### B2 — Non-Idempotent Retry on LLM Generation
- **Location:** `convex/lib/llm.ts:75`, `llm.ts:134`, `llm.ts:192`, `llm.ts:209`
- **Issue:** `callGemini`, `callGeminiWithGrounding`, and `embed` all wrap generation in `withRetry({ maxRetries: 2 })`. LLM generation is **not idempotent** — retrying on a transient network blip re-burns tokens and may return a different (worse) structured result.
- **Impact:** 2× token cost on retry, output corruption risk.
- **Fix:** Remove `withRetry` from generation calls. Only retry embedding calls (idempotent). For generation, fail fast and let the caller decide.

---

## 🟡 RISKS (Still Valid or Partially Valid)

### R2 — Incomplete Output Validation After JSON Parse
- **Location:** `convex/actions/scoring.ts:97-104`, `convex/actions/scraper.ts:110-113`
- **Issue:** `scoring.ts` checks `typeof parsed.ai_score === "number"` but does not validate the 0–10 range. `scraper.ts` checks `Array.isArray(extracted.stakeholders)` but does not validate individual fields (e.g., email contains `@`). `replyClassifier.ts` has good whitelist validation.
- **Impact:** Malformed or out-of-range data can propagate to the DB.
- **Fix:** Add `validateRange()` and `validateEmail()` helpers; apply them after JSON parse.

### R4 — Incomplete Cost/Token Telemetry
- **Location:** `convex/lib/llm.ts`
- **Issue:** `callGemini` logs telemetry (model, estimated tokens, latency) but `callFlash`, `callGeminiWithGrounding`, and `embed` do not log anything. `deepEnrichment.ts` logs its own cost estimate but no central telemetry exists.
- **Impact:** Runaway spend is hard to detect; cannot attribute costs to specific enrichment steps.
- **Fix:** Extract telemetry into a shared helper used by all LLM wrappers.

### R10 — No Golden Evaluation Set for LLM Outputs
- **Location:** Entire pipeline
- **Issue:** Unit tests exist for utilities (`scoring.ts`, `scrapers.ts`, `sanitize.ts`, etc.) but no end-to-end evaluation of LLM extraction quality, scoring accuracy, or proposal fidelity. Prompt changes ship without validation.
- **Impact:** Quality regressions (e.g., after a Gemini model update) are only caught in production.
- **Fix:** Build a 20-university golden evaluation set. Run in CI on PRs touching `prompts.ts` or `llm.ts`. *(Lower priority — 1 day effort.)*

---

## 🔵 NEW FINDINGS (Not in AI Audit Report)

### NEW-1 — Naive Truncation in Scraper
- **Location:** `convex/actions/scraper.ts:84-86`
- **Issue:** `content.substring(0, MAX_CONTENT_CHARS)` slices mid-structure without newline awareness, unlike `deepEnrichment.ts` which uses `truncateAtNewline()`.
- **Impact:** Can cut through stakeholder names or table rows, causing hallucination.
- **Fix:** Import and use `truncateAtNewline` from `deepEnrichment.ts` (or move it to `utils.ts`).

### NEW-2 — `withRetry` Retries ALL Errors Including Parse Failures
- **Location:** `convex/lib/llm.ts:75`, `llm.ts:134`, `llm.ts:192`
- **Issue:** `withRetry` default `retryOn` checks for 429/5xx HTTP errors. Gemini SDK throws generic `Error` objects on parse failures, content policy violations, or malformed requests — none of which should be retried. However, the default retry logic may still retry some of these depending on error shape.
- **Impact:** Burning tokens on fundamentally unrecoverable errors.
- **Fix:** Pass an explicit `retryOn` to `withRetry` inside `callGemini` that only retries network/timeout errors (look for `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`, or status 429/5xx).

### NEW-3 — No Email Format Validation on Scraped Stakeholders
- **Location:** `convex/actions/scraper.ts:152-168`, `convex/actions/deepEnrichment.ts:534-546`
- **Issue:** Extracted emails are inserted without regex validation. A malformed email like `"vc@example"` or an injected string could be persisted.
- **Impact:** Invalid emails in outreach sequences cause bounces and damage sender reputation.
- **Fix:** Add a lightweight email regex validation before insertion; discard or flag invalid entries.

### NEW-4 — Missing Compound Index for Stakeholder Deduplication
- **Location:** `convex/schema.ts:99-102`
- **Issue:** `stakeholders` table has `by_email` and `by_university` indexes, but no compound `by_university_email` index. The dedup query in `scraper.ts:123-124` fetches ALL stakeholders for a university then filters in JS.
- **Impact:** O(n) client-side filtering grows with stakeholder count.
- **Fix:** Add `.index("by_university_email", ["university_id", "email"])` to the schema.

### NEW-5 — Playwright Tests Are Minimal
- **Location:** `tests/smoke.spec.ts`, `tests/thorough.spec.ts`
- **Issue:** Only 3 Playwright tests: home page loads, sign-in accessible, dashboard pages exist. No E2E coverage of CSV upload → enrichment → outreach flows.
- **Impact:** Critical user journeys untested in CI.
- **Fix:** Add Playwright tests for CSV upload, UGC sync, and enrichment trigger. *(Lower priority.)*

---

## 🟢 SECURITY ASSESSMENT

### Present
- **HMAC-SHA256** verification for SendGrid delivery webhooks (`http.ts:35-64`).
- **Bearer token** auth for inbound email replies (`http.ts:141-148`).
- **Channel token** verification for Google Calendar push notifications (`http.ts:254-260`).
- **Prompt injection filtering** via `sanitizeLlmInput` (Unicode homoglyphs, adversarial patterns, HTML/script stripping).
- **Convex Native Auth** with OIDC token issuer = `CONVEX_SITE_URL`.
- **API keys** fetched from DB settings table, not hardcoded.
- **Internal mutations** used by webhooks for centralized, auditable writes.
- **Dev auth bypass** guarded by `DEV_AUTH_BYPASS_SECRET` + `NODE_ENV === "development"` check.

### Missing / Gaps
- No rate limiting on webhook endpoints ( SendGrid / inbound / calendar ). An attacker with a leaked secret could spam webhook handlers.
- `validateWebsite` in `discovery.ts` follows HTTP redirects from arbitrary domains without validation — SSRF risk is minimal since it's HEAD-only and short timeout, but a strict URL whitelist would be safer.

---

## 🟢 DATABASE ASSESSMENT

### Present
- Well-typed schema with `v.union` literals for enums (`website_status`, `outreach_stage`, `lead_tier`).
- Vector index on `universitySignals.embedding` (768-dim) with `filterFields: ["university_id"]`.
- Search index on `universities.university_name`.
- Timestamps (`created_at`, `updated_at`) on all mutable tables.
- `rateLimits` table for custom rate-limiting.

### Gaps
- No compound index on `stakeholders(university_id, email)` for fast dedup lookups (see NEW-4).
- No index on `emailsSent(stakeholder_id)` for querying a stakeholder's email history.
- `proposals.meeting_date` is `v.optional(v.number())` — no validation that it's in the future.

---

## 🟢 TESTING ASSESSMENT

### Present (13 unit test files)
- `emailTemplates.test.ts` — Template rendering
- `googleCalendar.test.ts` — Calendar API helpers
- `namesMatch.test.ts` — Name deduplication
- `rateLimit.test.ts` — Rate-limit logic
- `sanitize.test.ts` — Prompt injection filtering
- `scoring.test.ts` — Deterministic scoring algorithm
- `scrapers.test.ts` — Regex contact extraction, URL scoring
- `stakeholders.test.ts` — Stakeholder deduplication logic
- `truncateAtNewline.test.ts` — Smart truncation
- `universityUtils.test.ts` — Data normalization
- `validateJsonOutput.test.ts` — JSON validation helper
- `webhookSecurity.test.ts` — HMAC, email extraction, thread ID resolution
- `withConcurrencyLimit.test.ts` — Concurrency control

### Gaps
- No unit tests for Convex actions (requires Convex test runtime or mocking).
- No evaluation dataset for LLM output quality (see R10).
- Playwright E2E tests are minimal smoke tests only (see NEW-5).
- No tests for `callGemini` retry behavior or telemetry.

---

## Summary Matrix

| Domain | Blockers | Risks | New Findings | Fixed Since Audit |
|--------|----------|-------|--------------|-------------------|
| **AI Pipeline** | 1 (B2) | 2 (R2, R4) | 3 (NEW-1, NEW-2, NEW-3) | 7 |
| **Security** | 0 | 0 | 1 (rate-limit gap) | 0 |
| **Backend/API** | 0 | 0 | 1 (NEW-2 retry logic) | 0 |
| **Database** | 0 | 0 | 1 (NEW-4 index gap) | 0 |
| **Testing** | 0 | 1 (R10) | 1 (NEW-5 E2E gaps) | 0 |
| **Total** | **1** | **3** | **7** | **7** |

