# AI Audit Report — Outreach Enrichment Pipeline

## Scope
- `convex/actions/discovery.ts` — Website discovery
- `convex/actions/scraper.ts` — Stakeholder extraction (Jina + Gemini)
- `convex/actions/deepEnrichment.ts` — Deep enrichment (Firecrawl + Gemini)
- `convex/actions/enrichment.ts` — Social/media enrichment (Serper + Gemini Grounding)
- `convex/actions/scoring.ts` — AI scoring
- `convex/actions/orchestrator.ts` — Chain orchestration
- `convex/actions/personalize.ts` — Email opener generation
- `convex/actions/replyClassifier.ts` — Reply classification
- `convex/actions/proposals.ts` — Proposal generation
- `convex/lib/llm.ts`, `prompts.ts`, `scrapers.ts`, `scoring.ts`, `utils.ts`

---

## Findings

### 🔴 BLOCKERS

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| B1 | **No fetch timeouts on external APIs** — Jina Reader (`scraper.ts:61`), Firecrawl map/scrape (`scrapers.ts:32,67`), Serper (`enrichment.ts:61`, `discovery.ts:82`), and Gemini SDK (`llm.ts:78`) have no `AbortSignal.timeout`. | `scraper.ts`, `scrapers.ts`, `enrichment.ts`, `discovery.ts`, `llm.ts` | Hanging requests exhaust Convex action time limits (≤ 30s on most tiers), causing silent failures and retry storms. |
| B2 | **Non-idempotent retry on LLM generation** — `callGemini` wraps generation in `withRetry({ maxRetries: 1 })`. Retrying a non-idempotent call burns 2× tokens and can return a different (worse) structured result. | `llm.ts:64–104` | Cost doubling + output corruption risk on transient network blips. |
| B3 | **Naive context truncation mid-structure** — `deepEnrichment.ts:267` uses `substring(0, 90_000)` which can slice through a table row or sentence, causing Gemini to hallucinate incomplete data. | `deepEnrichment.ts:267` | Demographic numbers and stakeholder names may be fabricated where context was cut off. |

### 🟡 RISKS

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| R1 | **Prompt injection sanitization not applied to scraped content** — `sanitizeLlmInput` exists but is only used in `replyClassifier.ts`. Scraped university HTML/markdown goes straight into Gemini prompts without filtering. | `scraper.ts:97`, `deepEnrichment.ts:276` | Compromised university websites could inject instructions into the extraction pipeline. |
| R2 | **No deep output validation after JSON parse** — `JSON.parse` success is treated as valid. No runtime check that `ai_score` is 0–10, that stakeholder emails contain `@`, or that `nirf_total` sums correctly. | `scraper.ts:105`, `scoring.ts:97`, `deepEnrichment.ts:295`, `proposals.ts:78` | Malformed or hallucinated data is persisted to the database. |
| R3 | **Enrichment chain marks success despite partial failures** — `orchestrator.ts` catches each step error with `try/catch` and logs it, but never propagates failure. A university can reach "enriched" stage even if deep enrichment or scoring threw. | `orchestrator.ts:11–47` | Sales team sees "enriched" universities with missing stakeholders, no scores, or fabricated data. |
| R4 | **Zero cost/token telemetry** — No token counting, per-university spend tracking, or model-usage metrics. | All LLM calls | Cannot detect runaway spend, optimize model routing, or attribute costs to enrichment steps. |
| R5 | **`SCORING_FACTORS` map is dead code with mismatched values** — `lib/scoring.ts:1–19` defines `SCORING_FACTORS` (e.g., `A++` → 25) but `calculateDeterministicScore` uses inline conditionals (`A++` → 15). The map is never imported or used. | `lib/scoring.ts:1–19` | Maintenance hazard: future edits to the map will silently have no effect. |
| R6 | **Scraper uses expensive model by default** — `scraper.ts:94` calls `callGemini` without specifying a model, defaulting to `gemini-3.5-flash` ($1.50/$9.00 per 1M tokens). Flash-Lite ($0.25/$1.50) may be sufficient for deterministic extraction. | `scraper.ts:94`, `llm.ts:19` | 6× higher token cost for high-volume scraping than necessary. |
| R7 | **Image signals store raw URLs as content** — If the image host blocks hotlinking or the URL rots, the signal becomes a dead link with no descriptive fallback. | `enrichment.ts:210–216` | Degraded personalization quality over time; embeddings trained on synthetic snippets may drift from actual image content. |
| R8 | **Bulk stakeholder insertion without deduplication** — `scraper.ts:122` calls `bulkInsertInternal` with every extracted stakeholder, even if identical name+email pairs already exist from a prior scrape. | `scraper.ts:117–138` | Duplicate stakeholders inflate counts, corrupt scoring, and trigger redundant outreach. |
| R9 | **Serper LinkedIn search falls back to role-only queries** — When a stakeholder has no name, the query becomes `"${role}" "${uniName}" India`, which is extremely broad and likely returns wrong profiles. | `enrichment.ts:58` | LinkedIn URLs may be incorrectly attached to stakeholders, damaging outreach personalization. |
| R10 | **No evaluation dataset or regression tests for LLM outputs** — No golden-set tests for extraction quality, scoring accuracy, or proposal fidelity. Prompt changes ship without validation. | Entire pipeline | Quality regressions (e.g., after a Gemini model update) are only caught in production. |

### 🟢 RECOMMENDED FIXES

| # | Fix | Priority | Effort |
|---|-----|----------|--------|
| F1 | Wrap every external `fetch` and SDK call with `AbortSignal.timeout(15000)` (or environment-configurable). | High | 1–2 hrs |
| F2 | Remove `withRetry` from `callGemini` / `callFlash`. Only retry embedding calls (idempotent). For generation, fail fast and let the caller decide. | High | 30 min |
| F3 | Replace `substring(0, 90_000)` with newline-aware truncation: find the last newline before the limit and trim there; append `"[…truncated]"`. | High | 1 hr |
| F4 | Pipe all scraped / user-provided content through `sanitizeLlmInput` before constructing LLM prompts. | High | 1 hr |
| F5 | Add a lightweight runtime validator after `JSON.parse` (e.g., a 20-line helper that checks required fields, ranges, and email regex). Reject and log invalid outputs instead of persisting them. | Medium | 2 hrs |
| F6 | Return a composite status from `runEnrichmentChain`: include per-step success/failure flags so the UI can show "partial enrichment" instead of a blanket "enriched" badge. | Medium | 2 hrs |
| F7 | Add token-count estimation to `callGemini` (character-based heuristic: ~4 chars/token) and emit a structured log line: `{ model, estimatedInputTokens, estimatedOutputTokens, latencyMs, universityId }`. | Medium | 2 hrs |
| F8 | Either use `SCORING_FACTORS` inside `calculateDeterministicScore` or delete the dead code to prevent future maintenance bugs. | Low | 15 min |
| F9 | Benchmark `scraper.ts` with `gemini-3.1-flash-lite` on a sample of 10 universities. If extraction quality is equivalent, switch the default. | Low | 2 hrs |
| F10 | Store image `title` + `imageUrl` in signal content; if the URL is dead, the title still provides personalization context. | Low | 30 min |
| F11 | Add a deduplication gate before `bulkInsertInternal`: query existing stakeholders by `(name, email)` and only insert net-new records. | Low | 2 hrs |
| F12 | Build a 20-university golden evaluation set with expected stakeholder counts and demographic fields. Run it in CI on PRs that touch `prompts.ts` or `llm.ts`. | Low | 1 day |

---

## Guardrails

### Present
- **Native structured output**: Gemini `responseSchema` + `application/json` MIME type enforced across scraper, deep enrichment, scoring, reply classification, and proposals.
- **Temperature discipline**: `0.0` for classification, `0.05–0.1` for extraction, `0.3` for proposals, `0.6` for creative tasks.
- **Prompt injection filtering**: `sanitizeLlmInput` and `normalizeContent` both filter adversarial patterns; Unicode homoglyph coverage included.
- **Regex fallback**: Zero-cost contact extraction in deep enrichment guarantees emails/phones are not missed if LLM fails.
- **Concurrency limits**: `withConcurrencyLimit(5)` on Serper LinkedIn searches prevents rate-limit storms.
- **HITL gates**: Proposal generation and meeting booking require human confirmation (not auto-fired on classification).
- **Error telemetry**: Sentry integration on all action catch blocks.
- **Cost-aware routing**: Flash-Lite used for reply classification (cheapest viable model for the task).

### Missing
- **No timeout guardrails** on any external API call.
- **No retry logic differentiation** between transient network errors (safe to retry) and parse/content errors (unsafe to retry).
- **No runtime output schema enforcement** — JSON parse ≠ valid business object.
- **No cost or token accounting** — spend is invisible.
- **No evaluation framework** — quality is unmeasured.
- **No semantic truncation** — raw substring slicing risks hallucination.
- **No deduplication on stakeholder ingestion** — duplicates propagate downstream.

---

## Architecture Decision Notes

1. **Single-pass Gemini 3.5 Flash for deep enrichment** is the right call vs. the old 12× Flash + Pro pipeline. It reduces cost and latency while maintaining 1M context. Monitor extraction accuracy after this change.
2. **Jina Reader + Firecrawl hybrid** is pragmatic: Jina is free for the homepage scrape; Firecrawl is paid but discovers deep pages. Consider falling back to Jina for subpages if Firecrawl credits run low.
3. **Deterministic + AI hybrid scoring** (70/30 split) is defensible, but the deterministic formula should be versioned and A/B tested against sales outcomes.
4. **Role-aware persona selector** (`getStakeholderPersona`) in prompts is a strong personalization technique. Ensure it stays in sync with the actual Fretbox product positioning.
