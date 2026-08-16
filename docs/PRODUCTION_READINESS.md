# Fretbox Outreach AI v2 — Production Readiness Report

**Date:** 2026-08-16
**Scope:** Full verification, end-to-end flow execution, security audit, deployment, backups — preparation for client (megaplan) handover.
**Deployments:** Convex prod `energetic-raven-535` · Vercel `https://onboardingai2.vercel.app` (only frontend host — Netlify retired 2026-08-16)

---

## 1. Verification results

| Check | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | ✅ PASS | clean |
| `npm run lint` | ✅ PASS | clean |
| `npm run test:unit` | ✅ 527 pass / 1 skip | 99 suites, hermetic |
| `npm run build` | ✅ PASS | 16 routes (static + `/api/sync-ugc` dynamic) |
| `npm audit --audit-level=high` | ✅ 0 vulnerabilities | |
| E2E Playwright (`npm test`) | ✅ **59/59 pass** | against local dev server + prod Convex |
| Master checklist (`python3 .devin/scripts/checklist.py .`) | ✅ 6/6 pass | security scan, lint, schema, tests, UX, SEO |
| Security scan (secrets/patterns/config) | ✅ pass | no hardcoded secrets, no dangerous patterns |
| TODO/FIXME/HACK markers | ✅ none | |

## 2. Convex launch-readiness audit (2026-08-16)

**Authz scan (deterministic, 4 shapes):**
- Identity-from-arg: **0 hits**
- PII-leaking public query: **0 hits** (all stakeholder/reply/email queries auth-gated)
- Missing-ownership / parent-ref-write: N/A — single-tenant app with no per-user ownership model; all reads/writes are auth-gated
- 🔴 **Critical (fixed):** `convex/priorityScores.ts` `upsert` was a public mutation with **no auth** — any unauthenticated caller could write priority scores. → Added `validateAuth`.
- 🟠 **High (fixed):** `convex/rateLimits.ts` `checkRateLimit` public action (unused) with **no auth** — unauthenticated callers could manipulate the rate-limits table. → Added `validateAuth`.

**Reviewer pass (security/performance/code-quality):** clean — all FK fields indexed, no `.filter()` on DB queries, no `Date.now()` in query handlers, crons target `internal.*`, args/returns validators present.

**Live evidence (prod, 72h):** `convex insights` — 3 OCC warnings: `llmBudget.incrementBudgetInternal` (11 conflicts, known soft-cap race documented in code, **Low**), `dispatcherInternal` (1), `universities.updateInternal` (1). No recent function failures, `apiAlerts` empty.

**Env-var audit (prod Convex):** see §4 — 2 Critical, 2 High, 2 Low gaps.

## 3. Bugs found & fixed during verification

| # | Severity | Bug | Fix | Verified |
| --- | --- | --- | --- | --- |
| 1 | 🔴 Critical | Stale `authSessions` (JWT key rotation) → existing users hit `Can't parse refresh token` on sign-in **and password reset** | Purged 44 sessions + 1 stale reset code; added `admin:clearAllAuthSessions` / `admin:clearAuthVerificationCodes` ops | ✅ reset flow works end-to-end with real email code |
| 2 | 🔴 Critical | **Reply classifier broken** — `JSON.parse(response)` crashed on Gemini output (`Expected double-quoted property name`), so every reply failed classification and the UI silently fell back to `other` | Added `parseJsonResponse` (fence-strip + extraction) in `convex/lib/utils.ts`; classifier now uses it + `maxOutputTokens` 64; Simulate Reply UI now surfaces real failures | ✅ classified `meeting_request` → stage `meeting_booked` → HITL draft proposal |
| 3 | 🟠 High | Forgot-password showed "Something went wrong" for non-existent accounts (Convex masks `InvalidAccountId`) — breaks the privacy-preserving intent | Treat masked server errors as "code sent" | ✅ |
| 4 | 🟠 High | Vercel CSP `connect-src` lacked `wss://*.convex.cloud` → **Convex realtime blocked → every action timed out on Vercel** | Added `wss://` entries in `vercel.json` CSP | ✅ 4/4 auth flows pass on Vercel |
| 5 | 🟠 High | Vercel CLI framework detection fell back to static build (only `public/` deployed → all routes 404) | `vercel.json` now pins `builds: [{ "src": "package.json", "use": "@vercel/next" }]`; project framework set to `nextjs` | ✅ routes 200 |

## 4. Production env gaps (action required by owner)

| Env var | Gap | Why it matters | Action |
| --- | --- | --- | --- |
| `ADMIN_EMAILS` | 🔴 **unset** | **Any signed-up user passes `validateAdmin`** → can call `wipeEverything`, `listUsers` (PII), reset enrichment | `npx convex env set ADMIN_EMAILS <comma-separated>` |
| `EMAIL_WEBHOOK_SECRET` | 🔴 **unset** | Inbound-reply webhook 401s → reply classification never runs in real inbound flow | Generate + set + configure ZeptoMail Inbound Parse |
| `ZEPTOMAIL_WEBHOOK_SECRET` | 🟠 **unset** | Delivery/open/click tracking disabled (webhook 401) | Generate + set + configure ZeptoMail webhook |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | 🟠 **unset** | Calendar push verification disabled | Generate + set when enabling calendar |
| `LLM_DAILY_BUDGET_USD` | 🟡 unset | Code default $50/day applies | Set explicitly for control |
| `SENTRY_DSN` | 🟡 unset | Backend error capture off (frontend also off — no `NEXT_PUBLIC_SENTRY_DSN`) | Set DSN on Convex + frontend hosts |
| Google Calendar service account + Calendar ID | 🟠 not in `systemSettings` | `confirmMeeting` fails gracefully ("Google Calendar is not configured"); proposals still work | Add via Settings → API Keys |
| `SKIP_RATE_LIMITS` | ✅ correctly unset | — | keep unset |

Full setup steps: `docs/runbook.md` §2–§4.

## 5. End-to-end flow evidence (production, 2026-08-16)

All flows exercised against **prod Convex** (emails sent only to the approved test inbox `ankit@fusionwaveai.com`).

| Flow | Result | Evidence |
| --- | --- | --- |
| Sign-up / sign-in / guard redirect / wrong-password | ✅ | Playwright 4/4 (localhost) + 4/4 (Vercel) |
| Forgot + reset password (real ZeptoMail code) | ✅ | code delivered; reset-verification returned new session tokens |
| INI seed + university data | ✅ | 100 universities in prod (80 curated INIs + 20) |
| **Enrichment batch (3 universities)** | ✅ | IIIT Ranchi (992 students, 20+ stakeholders), IIIT Manipur (registrar email found), IIIT Pune (1080 students, registrar + 9 emails). Demographics with source attribution; honest nulls preserved |
| Outreach: Begin Sequence → Gemini personalization → HITL draft | ✅ | IIIT Ranchi personalized draft "Dear Registrar…" (pending_approval) |
| HITL reject (real-recipient drafts) | ✅ | drafts targeting real registrar/committee rejected |
| Document Mailer: .docx upload → parse → custom recipient → approve → **send with attachment** | ✅ | ZeptoMail message id `2518b.6ec72afd6de49d6a.m1.b78276f0…`; `status: sent` |
| Reply classify (simulated inbound) | ✅ | `meeting_request` (conf 1) → stage `meeting_booked` → HITL draft proposal created |
| Proposals: AI generation → rich HTML email → meeting confirm | ✅ | Proposal "ready" with Gemini content; email sent (ZeptoMail id `2518b.…9cdfcf90…`); confirm meeting → graceful "Google Calendar is not configured", `calendar_event_status: pending` |
| Webhooks | ✅ | `/test/ping` 200; zeptomail/email-reply/google-calendar correctly 401 until configured |
| Settings / Analytics / Universities UI | ✅ | render with real data, 0 console errors |
| API provider alerts | ✅ | none recorded during runs |

## 6. Cost & resource evidence

- LLM spend (prod `llmBudget`): 2026-08-16 **$0.20** (272K tokens) · 08-15 $0.15 · 08-14 $1.79 · 08-13 $0.71 — well within the $50/day default cap.
- No `apiAlerts` (Gemini/Firecrawl/Serper quota) during verification.
- Firecrawl/Serper budgets enforced in code (≤8 credits / ≤14 queries per university).

## 7. Backups — restore drill PASSED

- Snapshot: `npx convex export` → zip (1.1 MB, 3372 docs) — deleted after drill (PII hygiene).
- Drill: imported into throwaway preview `tough-chipmunk-479`; **table counts match prod exactly** (universities 100/100, stakeholders 100/100, emailsSent 15/15, outreachSequences 3/3, replyLogs 2/2, proposals 5/5, priorityScores 36/36, users 21/21, systemSettings 6/6); spot-checked IIIT Ranchi + the sent test email — intact.
- **Action:** schedule daily `npx convex export` (CI/cron) to durable storage; retention ≥ 30 days; re-run drill quarterly. Procedure: `docs/runbook.md` §5.

## 8. Deployment status

| Platform | Status | Notes |
| --- | --- | --- |
| Convex prod | ✅ live, current | `energetic-raven-535` — all fixes deployed |
| Vercel | ✅ **live** `https://onboardingai2.vercel.app` | project `fusionwaveai/onboardingai2`; env vars set; security headers + CSP verified; auth 4/4 |
| Netlify | 🗑️ **retired 2026-08-16** | `netlify.toml` removed; Vercel is the only frontend host. The old Netlify site should be deleted from the Netlify dashboard (owner action) |

## 9. Readiness score

Audit score (code + live evidence): **95/100** — deducted: LLM-budget OCC soft-cap race (−1, documented), env-var gaps (−4, §4 — actions required by owner). Score will move to 100 once `ADMIN_EMAILS` + webhook secrets + calendar + Sentry are configured (steps in `docs/runbook.md`).

**Blockers before handover:** set `ADMIN_EMAILS` (Critical). **Should-fix:** webhook secrets + ZeptoMail config, Google Calendar service account. **Nice-to-have:** Sentry DSNs, explicit LLM budget, daily backup cron.

---

*Generated 2026-08-16 by the production-readiness verification run. Companion docs: `docs/runbook.md` (ops), `docs/CLIENT_ONBOARDING.md` (client setup), `README.md` (overview).*
