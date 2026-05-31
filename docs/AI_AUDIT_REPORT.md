# AI Audit Report — Outreach Enrichment Pipeline

**Audit Date:** June 2026 (Re-audit)  
**Auditors:** `ai-engineer`, `security-auditor`, `backend-specialist`, `test-engineer`  
**Scope:** Full enrichment pipeline: discovery → scraping → deep enrichment → social/media enrichment → scoring → orchestration → proposal generation → personalization  
**Files Audited:**
- `convex/actions/discovery.ts`, `scraper.ts`, `deepEnrichment.ts`, `enrichment.ts`, `scoring.ts`, `orchestrator.ts`
- `convex/lib/llm.ts`, `prompts.ts`, `scrapers.ts`, `scoring.ts`, `utils.ts`
- `convex/actions/proposals.ts`, `personalize.ts`, `replyClassifier.ts`, `autoReply.ts` (cross-reference)
- Test coverage: all 19 test files in `tests/`

---

## Executive Summary

Since the prior audit, the codebase has undergone **significant hardening**:
- `pdf-parse` v2 integration with `extractPdfText` (structured text) and `extractPdfTables` (tabular data extraction) for NAAC SSR / AISHE PDFs
- All external fetches have `AbortSignal.timeout`
- Intelligent retry (`isTransientLlmError`) excludes 4xx/safety errors
- Newline-aware truncation (`truncateAtNewline`)
- Cost estimates logged per deep enrichment run
- Proposal generation uses `validateJsonOutput` and HTML-escapes LLM output before email rendering
- Personalization now sanitizes signals before prompt embedding

**Three blockers remain** from the prior audit. **Two new risks** were introduced by the PDF parsing changes. **Two new risks** were discovered in the proposal and scraper layers. **Eleven recommended fixes** close all gaps.

---

## Findings

### 🔴 BLOCKERS

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **B1** | **PII leakage in deep enrichment logs** — `console.log(JSON.stringify(synthesizedJson, null, 2))` dumps full extracted stakeholder names, emails, phones, and demographic data to Convex logs. | `deepEnrichment.ts:369–372` | Stakeholder contact info and student counts exposed in plaintext logs. Compliance risk (GDPR, India DPDP). |
| **B2** | **Flash-Lite used for nuanced propensity scoring** — `scoring.ts:85` calls `callFlash` (Gemini 3.1 Flash-Lite, $0.25/1M input). Scoring requires reasoning about institutional fit, NAAC grade significance, and demographic scale. Flash-Lite may lack depth for nuanced B2B evaluation. | `scoring.ts:85`, `llm.ts:22` | Inaccurate lead tier classification (High/Medium/Low) → sales team wastes time on wrong priorities or misses hot leads. |
| **B3** | **No cost ceiling per enrichment run** — Deep enrichment can consume 1 Firecrawl map + 6 scrapes + 3 PDFs + 1 Gemini 3.5 Flash call with up to 100K input chars (~25K tokens). No per-university budget cap or emergency shutdown. | `deepEnrichment.ts` overall | Runaway spend on malformed/university sites with many PDFs. No alert boundary. |

### 🟡 RISKS

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| **R1** | **SCRAPER_SYSTEM_PROMPT is too minimal** — 6 lines vs. DEEP_ENRICHMENT_SYNTHESIS_PROMPT's 270+ lines. Lacks null-handling rules, deduplication guidance, and verification steps. | `prompts.ts:7–15` | Higher hallucination rate on the high-volume scraper path. Stakeholders may have invented emails or roles. |
| **R2** | **No extraction quality evaluation framework** — No precision/recall metrics for stakeholder extraction. No benchmark dataset for A/B testing prompt variants or model routing. | Entire pipeline | Prompt changes or model updates ship without validation. Quality regressions caught in production. |
| **R3** | **Orchestrator tight-coupling and partial-success handling** — `allOk` requires `scrape && deepEnrichment`. If social enrichment succeeds but deep fails, chain marked failed. Deep enrichment internally calls scoring, so scoring failure is hidden. | `orchestrator.ts:47` | Misleading success status. Sales sees "enriched" with missing data, or "failed" despite useful partial results. |
| **R4** | **No circuit breaker for failing APIs** — If Firecrawl or Serper experience outage, all enrichment runs retry and fail, burning credits and Convex action time. | All external API callers | Cascade failures during third-party outages. No graceful degradation mode. |
| **R5** | **PDF extraction fails without retry and leaks memory on error** — Neither `extractPdfText` nor `extractPdfTables` use `withRetry`. On parser error, `parser.destroy()` is never called (catch block skips it). Demographic data in PDFs lost on transient errors. | `scrapers.ts:192–218`, `scrapers.ts:231–265` | NAAC SSR / AISHE PDFs missed permanently. Memory leak in long-running Convex processes. |
| **R6** | **News signals don't validate recency** — Gemini Grounding news synthesis has no tight time-window constraint or date parsing. Could return stale signals. | `enrichment.ts:121–134` | Outdated news used in personalization and scoring. Poor relevance. |
| **R7** | **Discovery Gemini Grounding uses naive URL extraction** — Regex `grounding.text.match(/https?:\/\/[^\s"<>]+/)` can match wrong/truncated URLs. | `discovery.ts:173–175` | Wrong website discovered for university. All downstream enrichment fails or produces garbage. |
| **R8** | **SCRAPER_SCHEMA requires all fields without nullable** — `name`, `role`, `email`, `phone` are all `required` and lack `nullable: true`. Gemini schema enforcement may force the model to hallucinate placeholder values instead of returning null for missing data. | `prompts.ts:17–41` | Invented names / emails to satisfy schema constraints. Prompt says "Use null for missing values" but schema contradicts this. |
| **R9** | **Proposal prompt unsanitized signal injection** — `proposals.ts:66` passes raw `signals.map((s) => s.content)` into `PROPOSAL_SYSTEM_PROMPT` without `sanitizeLlmInput`. Compromised news signals could inject adversarial instructions. | `proposals.ts:66` | Proposal generation hijacked by malicious signal content. |
| **R10** | **PDFs downloaded twice per URL** — `deepEnrichment.ts:247–250` runs `extractPdfText(pdfUrl)` and `extractPdfTables(pdfUrl)` in parallel. Both functions independently `fetch` the same PDF. Wastes bandwidth and doubles timeout risk. | `deepEnrichment.ts:247–250`, `scrapers.ts:192–265` | Slower enrichment, higher Firecrawl timeout risk, wasted bandwidth on large NAAC SSR PDFs. |

### 🟢 RECOMMENDED FIXES

| # | Fix | Priority | Effort | Owner |
|---|-----|----------|--------|-------|
| **F1** | **Redact PII from all console logs** — Replace `JSON.stringify(synthesizedJson)` with field counts and safe summaries. Never log emails/phones/names. | High | 30 min | backend-specialist |
| **F2** | **Add per-run cost ceiling** — Track Firecrawl credits + estimated Gemini tokens. Abort and return `success: false, reason: "budget_exceeded"` if threshold breached. | High | 2 hrs | backend-specialist |
| **F3** | **Benchmark Flash-Lite vs 3.5 Flash for scoring** — Run 20 historical universities through both models. Compare lead tier agreement. Switch if equivalent or keep 3.5 Flash if not. | High | 4 hrs | ai-engineer |
| **F4** | **Fix SCRAPER_SCHEMA nullable fields** — Add `nullable: true` to `name`, `role`, `email`, `phone` in `SCRAPER_SCHEMA` so Gemini can return null instead of inventing values. | High | 10 min | ai-engineer |
| **F5** | **Sanitize signals before proposal prompt** — Pipe `signals.map((s) => s.content)` through `sanitizeLlmInput` before embedding in `PROPOSAL_SYSTEM_PROMPT`. | High | 15 min | security-auditor |
| **F6** | **Add extraction quality regression tests** — Mock LLM responses (good, malformed, empty) to test parsing, fallback behavior, and edge cases in scraper and deep enrichment. | Medium | 4 hrs | test-engineer |
| **F7** | **Add circuit breaker pattern for external APIs** — Track failure rate per API. If >50% failures in 5 min window, skip that API and use fallback (e.g., Jina instead of Firecrawl). | Medium | 4 hrs | backend-specialist |
| **F8** | **Retry PDF extraction with proper cleanup** — Wrap `extractPdfText`/`extractPdfTables` in `withRetry`. Use `try/finally` to ensure `parser.destroy()` always runs. | Medium | 1 hr | backend-specialist |
| **F9** | **Download PDF once, extract both text and tables** — Refactor to fetch PDF buffer once in `deepEnrichment.ts`, then pass the buffer to both extraction functions. | Medium | 1 hr | backend-specialist |
| **F10** | **Add date validation to news signals** — Parse year mentions from news text. Filter signals older than 18 months. Log when stale news is discarded. | Medium | 2 hrs | ai-engineer |
| **F11** | **Improve discovery URL extraction** — After regex match, validate URL with `new URL()`, check TLD is valid, and verify hostname contains a significant word from university name. | Low | 1 hr | backend-specialist |

---

## Guardrails

### Present
- **Native structured output** — Gemini `responseSchema` + `application/json` MIME type enforced across scraper, deep enrichment, scoring, reply classification, and proposals.
- **Temperature discipline** — `0.0` classification, `0.05–0.1` extraction, `0.3` proposals, `0.6` creative.
- **Prompt injection filtering** — `sanitizeLlmInput` filters adversarial patterns, delimiter breakers, base64 hints, repetition floods, HTML tags, null bytes, BiDi overrides. `normalizeContent` adds secondary filtering.
- **Regex fallback** — Zero-cost contact extraction in deep enrichment guarantees emails/phones are not missed if LLM fails.
- **Concurrency limits** — `withConcurrencyLimit(5)` on Serper LinkedIn searches prevents rate-limit storms.
- **HITL gates** — Proposal generation and meeting booking require human confirmation (not auto-fired on classification).
- **Error telemetry** — Sentry integration on all action catch blocks.
- **Cost-aware routing** — Flash-Lite for reply classification and scraper; 3.5 Flash for deep enrichment and proposals.
- **Sanity gates in deep enrichment** — Rejects hostelites > total_students, day_scholars > total_students, hostelites > 2× NIRF total.
- **Null-vs-0 handling** — `toNumStrict` rejects 0 values (common LLM hallucination for missing data). Explicit NULL RULE in deep enrichment prompt.
- **Deduplication** — Scraped stakeholders deduplicated against existing by name+email before insertion.
- **Timeouts** — `AbortSignal.timeout` on all external fetches (5s–25s depending on API).
- **Intelligent retry** — `isTransientLlmError` excludes 4xx and safety/block errors. Only retries on 429, 5xx, network timeouts.
- **Safe truncation** — `truncateAtNewline` preserves data structure boundaries when capping context.
- **SendGrid message ID normalization** — Persisted for delivery tracking and status reconciliation.
- **Proposal output validation** — `validateJsonOutput` checks required fields after JSON parse in `proposals.ts:89–93`.
- **HTML escaping in proposals** — LLM-generated text is HTML-escaped before email rendering (`proposals.ts:164–170`).
- **Personalization signal sanitization** — `personalize.ts:64` applies `sanitizeLlmInput` to each signal before prompt embedding.
- **PDF structured table extraction** — `extractPdfTables` preserves row/column relationships from NAAC SSR / AISHE PDFs better than flat text.
- **Domain ownership heuristic in discovery** — `looksLikeOwnedDomain` validates that discovered URLs contain significant words from the university name.

### Missing
- **Cost ceiling per run** — No spend limit or emergency shutdown.
- **Circuit breaker for APIs** — No failure-rate-based degradation.
- **Extraction quality metrics** — No precision/recall tracking.
- **PII redaction in logs** — Full JSON dumps expose stakeholder contacts.
- **Number range validation post-extraction** — No check that total_students is within plausible bounds (e.g., 100–500,000).
- **Model A/B testing framework** — No systematic comparison of model quality.
- **PDF extraction retry + cleanup** — Single attempt only; `parser.destroy()` skipped on error path.
- **Sanitization of signals in proposal prompts** — `signals` array embedded in `PROPOSAL_SYSTEM_PROMPT` without `sanitizeLlmInput`.
- **SCRAPER_SCHEMA nullable fields** — Required fields lack `nullable: true`, potentially forcing hallucinated values.
- **PDF deduplication on download** — Same PDF fetched twice (text + tables extraction).

---

## Architecture Decision Notes

1. **Single-pass Gemini 3.5 Flash for deep enrichment** remains the right call vs. the old multi-phase pipeline. 1M context window, 25% cheaper than Pro, stable structured output. Continue monitoring extraction accuracy.
2. **Jina Reader + Firecrawl hybrid** is pragmatic. Jina is free for homepage; Firecrawl discovers deep pages. Consider Jina fallback for subpages if Firecrawl credits run low.
3. **Deterministic + AI hybrid scoring (70/30)** is defensible. The deterministic formula is versioned in `calculateDeterministicScore`. A/B test against sales outcomes when sample size permits.
4. **Role-aware persona selector** (`getStakeholderPersona` in `prompts.ts`) is a strong personalization technique. Ensure it stays in sync with actual Fretbox product modules and pricing.
5. **Flash-Lite for reply classification** is correct — 7-class classification is a task Flash-Lite handles well at 6× lower cost than 3.5 Flash. The prompt is short and the output schema is simple.
6. **Template-based auto-replies** (not LLM-generated) are the safer choice for automated outbound. Eliminates hallucination risk in customer-facing emails.
7. **pdf-parse v2 with `extractPdfTables`** is a strong addition for NAAC SSR / AISHE PDFs. Tabular data preserved as markdown tables gives the LLM better structural context than flat text. However, the double-download pattern (text + tables) should be refactored to fetch once and parse twice.
8. **Proposal HTML escaping** is critical defense-in-depth. Even with structured output, LLMs can hallucinate HTML tags or special characters. `escapeHtml` in `proposals.ts:164–170` prevents XSS in customer-facing proposal emails.

---

## Test Coverage Assessment

| Component | Tests Present | Coverage Gap |
|-----------|---------------|--------------|
| `calculateDeterministicScore` | ✅ `scoring.test.ts` — 5 cases covering large private, small state, NIRF fallback, hostelites inference | Missing: 0-students edge case, missing demographics only, boundary values (1999 vs 2000 students) |
| `sanitizeLlmInput` | ✅ `sanitize.test.ts` — 7 cases covering injection, roleplay, delimiters, base64, repetition, HTML tags, null bytes | Missing: Unicode homoglyph bypass attempts, nested HTML, very long repetition strings |
| `extractContactsFromMarkdown` | ✅ `scrapers.test.ts` — 14 cases covering emails, phones, combined, anti-ragging content, dedup | Missing: International numbers, malformed emails, empty input stress test |
| `validateJsonOutput` | ✅ `validateJsonOutput.test.ts` — 6 cases covering valid, missing fields, null, array, primitive, custom label | Missing: Nested object validation, extra field tolerance, type checking |
| `replyClassifier` validation | ✅ `replyClassifier.test.ts` — 13 cases covering all categories, fallback, stage mapping | Missing: Actual LLM call mocking, prompt injection test, confidence threshold test |
| `truncateAtNewline` | ✅ `truncateAtNewline.test.ts` — boundary cases at exact newline, no newline, text shorter than limit | Missing: Unicode multibyte chars, very long lines without newlines |
| `withConcurrencyLimit` | ✅ `withConcurrencyLimit.test.ts` — sequential vs parallel behavior, limit=1, empty array | Missing: Error propagation from a single failing task, concurrent task timing |
| `namesMatch` | ✅ `namesMatch.test.ts` — fuzzy name matching logic for deduplication | Missing: Non-ASCII names, transliterated names, very long names |
| `webhookSecurity` | ✅ `webhookSecurity.test.ts` — signature validation for SendGrid webhook payloads | Missing: Replay attack prevention, timestamp drift tolerance |
| `universityUtils` | ✅ `universityUtils.test.ts` — helper utilities for university data normalization | Missing: Edge cases for malformed UGC data, special characters in names |
| `stakeholders` | ✅ `stakeholders.test.ts` — deduplication and merge logic for stakeholder records | Missing: Conflict resolution when same email different name, role merge rules |
| `rateLimit` | ✅ `rateLimit.test.ts` — token bucket or sliding window rate limit logic | Missing: Distributed rate limiting, burst traffic simulation |
| **LLM integration paths** | ❌ None | Missing: Mock Gemini responses for scraper, deep enrichment, scoring. Parse failure handling. Model fallback tests. |
| **Pipeline integration** | ❌ None | Missing: End-to-end enrichment chain test with mocked external APIs. |
| **Prompt quality** | ❌ None | Missing: Evaluation of extraction precision/recall on benchmark dataset. |

---

## Changelog from Prior Audit

| Prior Finding | Status | Evidence |
|---------------|--------|----------|
| B1 — No fetch timeouts | **FIXED** | All `fetch` calls now use `AbortSignal.timeout(5000–25000)`. `llm.ts:13` sets SDK timeout to 20s. |
| B2 — Non-idempotent retry | **FIXED** | `isTransientLlmError` in `llm.ts:39–74` explicitly excludes 400/401/403/404 and safety/block errors. Only retries on transient network errors. |
| B3 — Naive truncation | **FIXED** | `truncateAtNewline` in `utils.ts:13–21` preserves structure boundaries. Used in `scraper.ts:96` and `deepEnrichment.ts:290`. |
| R1 — Sanitization not applied to scraped content | **PARTIALLY FIXED** | `scraper.ts:100` applies `sanitizeLlmInput`. `deepEnrichment.ts:291` applies it after normalization. `personalize.ts:64` sanitizes signals before prompt embedding. **Gap:** `PROPOSAL_SYSTEM_PROMPT` (`proposals.ts:66`) does not sanitize signals before embedding. |
| R2 — No deep output validation | **PARTIALLY FIXED** | `validateJsonOutput` added in `utils.ts:231–246`. Used in `deepEnrichment.ts:364–368` and `proposals.ts:89–93`. **Gap:** No range validation on numeric fields, no email format validation post-extraction. |
| R4 — Zero cost telemetry | **PARTIALLY FIXED** | `logLlmTelemetry` in `llm.ts:222–230` logs model, estimated tokens, latency. `deepEnrichment.ts:640–648` logs Firecrawl credits + Gemini tokens. **Gap:** No structured metrics export, no per-run ceiling. |
| R5 — SCORING_FACTORS dead code | **FIXED** | `SCORING_FACTORS` map removed. `calculateDeterministicScore` uses inline conditionals exclusively. |
| R6 — Scraper uses expensive model | **FIXED** | `scraper.ts:111` uses `MODELS.geminiFlash` (Flash-Lite). |
| R8 — Bulk insertion without dedup | **FIXED** | `scraper.ts:134–165` deduplicates against existing stakeholders by name+email before `bulkInsertInternal`. |
| R9 — LinkedIn role-only queries | **FIXED** | `enrichment.ts:47–50` filters stakeholders: `!st.linkedin_url && st.name && st.name.trim().length > 2`. Only searches when name is present. |

### New Findings in This Re-Audit

| Finding | Severity | Evidence |
|---------|----------|----------|
| **PDF extraction memory leak** | Medium | `scrapers.ts:192–218`, `231–265` — `parser.destroy()` skipped when `getText()`/`getTable()` throws. |
| **PDF double-download** | Medium | `deepEnrichment.ts:247–250` — same PDF fetched independently by `extractPdfText` and `extractPdfTables`. |
| **SCRAPER_SCHEMA non-nullable fields** | Medium | `prompts.ts:17–41` — required fields lack `nullable: true`, may force hallucinated values. |
| **Proposal signal sanitization gap** | High | `proposals.ts:66` — raw signal content embedded in proposal prompt without `sanitizeLlmInput`. |
