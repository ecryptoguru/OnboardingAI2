# Fretbox Outreach AI v2 — Implementation & Delivery Plan

## Status

All v2.0 milestones are **delivered and operational**. The current focus is continuous improvement: data quality, pipeline refinements, monitoring, and audit-driven hardening. This document tracks what has been built and the ongoing guardrails that guide future changes.

## Scope

End-to-end outreach automation for university hostel management:

- University ingestion (CSV, UGC sync, curated INI seed)
- Website discovery and validation
- Stakeholder extraction and enrichment
- AI-driven signal discovery, demographics, and scoring
- Multi-step outreach sequences with human-in-the-loop (HITL) approval
- ZeptoMail email delivery, inbound reply handling, and auto-replies
- AI proposal generation (rich HTML) with Google Calendar / Meet integration
- Real-time dashboard (Universities, Enrichment, Outreach, Approvals, Proposals, Analytics, Settings)
- Authentication, including password reset
- Security, UX, and SEO hardening with audit scripts and test coverage

## Completed Milestones

| Milestone | Delivered | Key Outcome |
| ----------- | ----------- | ------------- |
| **M1 — Architecture** | Done | Convex + Next.js 15 backend/frontend, Convex Native Auth, reactive queries, serverless actions |
| **M2 — Data Ingestion** | Done | CSV upload, UGC.gov.in sync, curated INI seed, batched bulk writes |
| **M3 — AI Enrichment** | Done | Discovery, scraping, signals, government-data enrichment, demographics, contact inference, scoring |
| **M4 — Outreach Engine** | Done | Scheduled sequences, HITL approvals, ZeptoMail dispatch, reply classification, auto-replies |
| **M5 — Proposals** | Done | AI-generated rich HTML proposals, Google Calendar events, Meet links, confirmation/cancellation flows |
| **M6 — Dashboard** | Done | Universities, Enrichment, Outreach, Approvals, Proposals, Analytics, Settings pages |
| **M7 — Security & Hardening** | Done | Action internalization, API key sanitization, webhook auth, test-endpoint lockdown, audit scripts |
| **M8 — Testing** | Done | Unit tests (`tests/unit`), Playwright E2E (`tests/e2e`), master checklist runner |

## Audit Dimensions

These dimensions are kept in mind for every new feature or refactor:

| Dimension | Focus |
| ----------- | ------- |
| **Factual Grounding** | Hallucination risks in extraction, scoring, and proposals. Null-vs-0 handling. Source attribution. |
| **Structured Output Reliability** | JSON schema validation, parsing fallbacks, malformed response handling. |
| **Fallback Behavior** | Graceful degradation when Jina, Firecrawl, Serper, Gemini, or ZeptoMail fail. |
| **Cost & Latency** | Model routing, token budgets, daily LLM budget (`llmBudget`), 48h deterministic cache (`llmCache`). |
| **Privacy Exposure** | PII leakage in logs, prompts, or third-party APIs. Data retention boundaries. |
| **Prompt Injection** | `sanitizeLlmInput` and `sanitizeLlmOutput` boundaries. |
| **Instrumentation** | Sentry error tracking, `llmUsage` cost telemetry, rate-limiting. |
| **Security** | `validateAuth` on public actions, `internalAction` for crons/webhooks, `sanitizeApiKey`, HTTP endpoint lockdown. |

## Agent Responsibilities

| Agent | Responsibility |
| ------- | ---------------- |
| `ai-engineer` | Prompt quality, structured output reliability, model routing, hallucination guardrails |
| `security-auditor` | Prompt injection, PII leakage, API key handling, data exposure, auth/internalization |
| `backend-specialist` | Service resilience, retry logic, timeout handling, error propagation, internal actions |
| `test-engineer` | Evaluation gaps, regression tests, output validation coverage |
| `documentation-writer` | Keep `PLAN.md`, `Requirement.md`, `roadmap.md`, and `README.md` aligned with shipped behavior |

## Ongoing Work

- Pipeline data-quality improvements (source attribution, demographics accuracy)
- Additional unit/E2E coverage for new flows
- LLM cost and telemetry dashboards
- UX/SEO/accessibility refinements driven by `.devin/scripts/checklist.py`

---
> *Last updated: v2.0 delivery*
