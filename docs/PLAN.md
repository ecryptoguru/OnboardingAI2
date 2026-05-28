# AI Enrichment Pipeline Audit Plan

## Scope
Full audit of the Outreach AI enrichment pipeline for Fretbox, covering:
- `convex/actions/discovery.ts` — Website discovery via Serper
- `convex/actions/scraper.ts` — Stakeholder extraction (Jina + Gemini 3.5 Flash)
- `convex/actions/deepEnrichment.ts` — Deep enrichment (Firecrawl + Gemini 3.5 Flash)
- `convex/actions/enrichment.ts` — Social/media enrichment (Serper + Gemini Grounding)
- `convex/actions/scoring.ts` — AI scoring (Gemini Flash-Lite)
- `convex/actions/orchestrator.ts` — Enrichment chain orchestration
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

## Agent Assignments (Phase 2)

| Agent | Responsibility |
|-------|---------------|
| `ai-engineer` | Prompt quality, structured output reliability, model routing, hallucination guardrails |
| `security-auditor` | Prompt injection, PII leakage, API key handling, data exposure |
| `backend-specialist` | Service resilience, retry logic, timeout handling, error propagation |
| `test-engineer` | Evaluation gaps, regression tests, output validation coverage |

## Deliverable
`docs/AI_AUDIT_REPORT.md` with findings ranked: **blocker** / **risk** / **recommended fix**

## Estimated Effort
1 planning session + 1 implementation pass + 1 review consolidation.
