# AI Enrichment Pipeline Audit & Refactor Plan

## Status

The initial audit and the P0 security/maintainability refactor have been implemented. The remaining ongoing work is to keep the audit dimensions in mind while adding new features.

## Scope

Full audit of the Outreach AI enrichment pipeline for Fretbox, covering:

- `convex/actions/discovery.ts` — Website discovery via Serper
- `convex/actions/scraper.ts` — Stakeholder extraction (Jina + Gemini 3.5 Flash)
- `convex/actions/deepEnrichment.ts` — Deep enrichment (Firecrawl + Gemini 3.5 Flash)
- `convex/actions/enrichment.ts` — Social/media enrichment (Serper + Gemini Grounding)
- `convex/actions/scoring.ts` — AI scoring (Gemini Flash-Lite)
- `convex/actions/orchestrator.ts` — Enrichment chain orchestration
- `convex/actions/outreach.ts` — Sequence dispatch and cadence
- `convex/actions/replyClassifier.ts` — Inbound reply classification
- `convex/actions/proposals.ts` — Proposal generation and meeting management
- `convex/actions/email.ts` — Email dispatch
- `convex/lib/llm.ts` — LLM abstraction layer
- `convex/lib/prompts.ts` — System prompts and schemas
- `convex/lib/scrapers.ts` — Firecrawl client + regex fallback

## Audit Dimensions

| Dimension | Focus |
|-----------|-------|
| **Factual Grounding** | Hallucination risks in extraction, scoring, and proposal generation. Null-vs-0 handling. Source attribution. |
| **Structured Output Reliability** | JSON schema validation, parsing fallbacks, malformed response handling. |
| **Fallback Behavior** | Graceful degradation when APIs (Jina, Firecrawl, Serper, Gemini) fail. |
| **Cost & Latency** | Model routing appropriateness, token budgets, missing cost telemetry. |
| **Privacy Exposure** | PII leakage in logs, prompts, or third-party APIs. Data retention boundaries. |
| **Prompt Injection** | Content sanitization, user-input boundaries, filter robustness. |
| **Instrumentation** | Observability gaps, missing metrics, alert boundaries. |
| **Security** | Public action auth (`validateAuth`), internalization (`internalAction`), HTTP test endpoint lockdown (`DISABLE_TEST_ENDPOINTS` / `TEST_WEBHOOK_SECRET`), API key sanitization (`sanitizeApiKey`). |

## Agent Assignments (Phase 2)

| Agent | Responsibility |
|-------|---------------|
| `ai-engineer` | Prompt quality, structured output reliability, model routing, hallucination guardrails |
| `security-auditor` | Prompt injection, PII leakage, API key handling, data exposure, auth/internalization |
| `backend-specialist` | Service resilience, retry logic, timeout handling, error propagation, internal actions |
| `test-engineer` | Evaluation gaps, regression tests, output validation coverage |

## Completed Refactor Items

- Pipeline actions internalized (`internalAction`) and public actions wrapped with `validateAuth()`.
- `api.actions.*` references in internal code replaced with `internal.actions.*`.
- HTTP test endpoints disabled by default and gated by `DISABLE_TEST_ENDPOINTS` / `TEST_WEBHOOK_SECRET`.
- `sanitizeApiKey()` tightened to printable ASCII (33–126) and applied in `set*Key` mutations.
- Proposal statuses extended to include `meeting_confirmed` and `cancelled`.
- `confirmMeeting` made idempotent and `cancelMeeting` implemented.
- `getFunnelStats` uses `collect()` for accurate counts.
- Circular type inference in `email.ts` and `proposals.ts` resolved via `do*` helpers.

## Deliverable

`docs/AI_AUDIT_REPORT.md` with findings ranked: **blocker** / **risk** / **recommended fix** (create when the next audit cycle is run).
