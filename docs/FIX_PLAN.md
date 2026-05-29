# Fix Plan — Post-Review Implementation

**Based on:** docs/COMPREHENSIVE_REVIEW.md + docs/AI_AUDIT_REPORT.md
**Goal:** Address all remaining blockers, risks, and new findings.

---

## Phase 1: Blockers (Must Fix)

### FIX-1: Remove Non-Idempotent Retry from LLM Generation
**File:** `convex/lib/llm.ts`
- Remove `withRetry` wrapper from `callGemini` generation.
- Keep `withRetry` on `embed` only (idempotent).
- Add telemetry to `callFlash` and `callGeminiWithGrounding` (opportunistic — addresses R4 too).
- Add explicit `retryOn` that only retries network/timeout errors.

**Verification:** Unit test that `callGemini` does NOT retry on parse errors.

---

## Phase 2: High-Risk Fixes (Should Fix)

### FIX-2: Smart Truncation in Scraper
**File:** `convex/actions/scraper.ts`
- Replace `content.substring(0, MAX_CONTENT_CHARS)` with `truncateAtNewline()`.
- Move `truncateAtNewline` from `deepEnrichment.ts` to `convex/lib/utils.ts` for shared use.

**Verification:** Existing `truncateAtNewline.test.ts` covers logic.

### FIX-3: Email Validation on Scraped Stakeholders
**Files:** `convex/actions/scraper.ts`, `convex/actions/deepEnrichment.ts`
- Add `isValidEmail(email: string): boolean` helper in `utils.ts`.
- Filter extracted stakeholders to discard entries with malformed emails.
- Still allow `name-only` entries (email is optional per schema).

**Verification:** Unit test for `isValidEmail`.

### FIX-4: Deeper Output Validation
**Files:** `convex/actions/scoring.ts`, `convex/actions/scraper.ts`
- `scoring.ts`: Clamp `ai_score` to [0, 10] after parse; validate `ai_reasoning` is a non-empty string.
- `scraper.ts`: Validate each stakeholder has at least a name or a valid email; discard empty entries.

**Verification:** Update unit tests for scoring and validateJsonOutput.

### FIX-5: Uniform Telemetry Across All LLM Calls
**File:** `convex/lib/llm.ts`
- Extract telemetry logging into a `logLlmTelemetry()` helper.
- Call it from `callGemini`, `callFlash`, `callGeminiWithGrounding`, and `embed`.
- Include: model, estimatedInputTokens, estimatedOutputTokens, latencyMs, function name.

**Verification:** Console output verification in dev.

---

## Phase 3: Schema & Performance (Nice to Fix)

### FIX-6: Add Compound Index for Stakeholder Deduplication
**File:** `convex/schema.ts`
- Add `.index("by_university_email", ["university_id", "email"])` to `stakeholders` table.
- Optionally add `.index("by_stakeholder_email", ["stakeholder_id"])` to `emailsSent` table for history lookups.

**Verification:** Convex dashboard shows new indexes after `npx convex dev`.

---

## Phase 4: Testing (Deferred — Lower Priority)

### FIX-7: Expand Playwright E2E Coverage
- Add test: CSV upload → university appears in list.
- Add test: UGC sync button triggers without 500.

### FIX-8: LLM Evaluation Dataset
- Create `tests/evaluation/golden-set.json` with 10 universities and expected extraction fields.
- Run evaluation script in CI on PRs touching `prompts.ts` or `llm.ts`.

---

## Estimated Effort

| Fix | Effort | Priority |
|-----|--------|----------|
| FIX-1 (LLM retry) | 30 min | BLOCKER |
| FIX-2 (scraper truncation) | 15 min | High |
| FIX-3 (email validation) | 20 min | High |
| FIX-4 (output validation) | 30 min | High |
| FIX-5 (telemetry) | 20 min | Medium |
| FIX-6 (schema index) | 10 min | Medium |
| FIX-7 (E2E tests) | 1 hr | Low |
| FIX-8 (evaluation set) | 1 day | Low |

**Total Critical Path:** ~2.5 hours for Blockers + High-Risk fixes.

---

## Verification Checklist

After fixes, run:
```bash
npm run test        # Unit tests
npm run test:e2e    # Playwright smoke tests
npx convex dev      # Verify schema compiles
```

