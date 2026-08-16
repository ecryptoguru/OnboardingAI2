# Fretbox Outreach AI v2 — Operations Runbook

Production operations guide for the team operating the app (Fretbox) and the
client (megaplan). Keep this aligned with `README.md` and `docs/PRODUCTION_READINESS.md`.

---

## 1. Production topology

| Layer | Where it lives | URL |
| --- | --- | --- |
| Backend + DB + webhooks + crons | Convex Cloud (project `onboardingai`, team `ankit-das-3dab1`) | API `https://energetic-raven-535.convex.cloud` · Site `https://energetic-raven-535.convex.site` |
| Frontend | Vercel project `fusionwaveai/onboardingai2` (only host; Netlify retired 2026-08-16) | `https://onboardingai2.vercel.app` |
| Error tracking | Sentry (`fretbox/outreach-ai`) | dashboard.sentry.io |
| Email | ZeptoMail (sender `outreach@fretbox.in` / name configured in Settings) | app.zeptomail.in |

Deploy commands:

```bash
# Convex backend (all server functions + schema + webhooks)
npx convex deploy            # CONVEX_DEPLOYMENT=prod:energetic-raven-535 is in .env

# Vercel frontend (from repo root; requires vercel login)
npx vercel build --prod --yes --scope fusionwaveai
npx vercel deploy --prebuilt --prod --yes --scope fusionwaveai
```

> **Vercel note:** `vercel.json` must keep the `builds: [{ "src": "package.json", "use": "@vercel/next" }]` entry — the Vercel CLI's automatic framework detection is unreliable for Next.js 16 and falls back to a static build (only `public/` gets deployed). With `@vercel/next` the full app is built. The CSP in `vercel.json` **must** include `wss://*.convex.cloud` — without it, the Convex realtime connection is blocked by the browser and every action times out.

---

## 2. Environment variables (production)

### Convex backend env (`npx convex env set NAME value` / dashboard)

| Variable | Status in prod | Required for |
| --- | --- | --- |
| `JWT_PRIVATE_KEY` | ✅ set | Auth token signing |
| `JWKS` | ✅ set | Auth public keys |
| `SETTINGS_OBFUSCATION_SECRET` | ✅ set | XOR-obfuscation of API keys in `systemSettings` (≥32 chars) |
| `SITE_URL` | ✅ set | Password-reset callback URL |
| `SERPER_API_KEY` | ✅ set (legacy; key also in Settings) | Serper discovery |
| `ADMIN_EMAILS` | ⚠️ **NOT SET** | **Set it.** With it empty, ANY signed-up user passes `validateAdmin` and can wipe all data / read all users. Comma-separated admin emails. |
| `EMAIL_WEBHOOK_SECRET` | ⚠️ **NOT SET** | Inbound-reply webhook (`/webhooks/email-reply`). Without it, replies are rejected 401 — reply classification never fires. |
| `ZEPTOMAIL_WEBHOOK_SECRET` | ⚠️ **NOT SET** | Delivery/open/click tracking (`/webhooks/zeptomail`). |
| `GOOGLE_CALENDAR_WEBHOOK_TOKEN` | ⚠️ **NOT SET** | Calendar push verification. |
| `LLM_DAILY_BUDGET_USD` | ⚠️ NOT SET (code default $50/day) | Daily LLM spend soft cap. |
| `SENTRY_DSN` | ⚠️ NOT SET | Server-side error capture (backend actions). |
| `DISABLE_TEST_ENDPOINTS` | unset (default: test endpoints disabled) | Leave unset or `true` in prod. |
| `SKIP_RATE_LIMITS` | unset | Must stay unset in prod. |
| `ADMIN_EMAILS` after set | — | Restricts admin-only mutations to listed emails. |

### Frontend hosts (Vercel build-time env)

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `https://energetic-raven-535.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | `https://energetic-raven-535.convex.site` |
| `NEXT_PUBLIC_SENTRY_DSN` | optional; enables client error capture |

---

## 3. ZeptoMail webhook configuration (client task)

The app's webhook endpoints are **disabled until the matching secret is set on Convex** (they return 401). To enable delivery tracking and inbound replies:

1. Generate secrets: `openssl rand -hex 32` for `ZEPTOMAIL_WEBHOOK_SECRET` and `EMAIL_WEBHOOK_SECRET`.
2. Set them on Convex: `npx convex env set ZEPTOMAIL_WEBHOOK_SECRET <secret>` and `npx convex env set EMAIL_WEBHOOK_SECRET <secret>`.
3. In the **ZeptoMail dashboard** (app.zeptomail.in → Organization → Webhooks):
   - Delivery webhook URL: `https://energetic-raven-535.convex.site/webhooks/zeptomail`
   - Signature/secret: the same `ZEPTOMAIL_WEBHOOK_SECRET` value (ZeptoMail signs with `producer-signature`; the app verifies the HMAC).
   - Inbound Parse webhook: `https://energetic-raven-535.convex.site/webhooks/email-reply` with `Authorization: Bearer <EMAIL_WEBHOOK_SECRET>`.
4. Test: send a real email from the app, then check `emailsSent.status` transitions (`sent → delivered → opened`) and that replies create `replyLogs` rows.

---

## 4. Google Calendar (client task)

The proposals → "Confirm Meeting" flow requires a **Google Calendar Service Account**:

1. Create a service account in Google Cloud Console, enable the Calendar API, and share the target calendar with the service account email (Make changes to events).
2. In the app → Settings → API Keys, paste the service account JSON and set the Calendar ID (default `primary`).
3. Optionally set `GOOGLE_CALENDAR_WEBHOOK_TOKEN` on Convex to verify push notifications.

Until configured, `confirmMeeting` fails gracefully with "Google Calendar is not configured" and sets `calendar_event_status: "pending"` — the draft proposal flow still works.

---

## 5. Backups & disaster recovery

**Verified procedure (restore drill executed 2026-08-16 — passed):**

```bash
# 1. Take a snapshot (run this on a schedule — see below)
npx convex export --deployment prod --path backup-$(date +%F).zip

# 2. To restore into a throwaway preview (drill)
npx convex deployment create drill/restore-$(date +%F) --type preview
npx convex import backup-<date>.zip --deployment <preview-ref> --replace
# then compare table counts between prod and the preview

# 3. To restore to PROD (only in a real disaster; loses writes made after the snapshot)
npx convex import backup-<date>.zip --replace --prod
```

**Recommended schedule (RPO = 1 day):** a daily `npx convex export` in CI (GitHub Actions) or cron, stored in durable storage the team controls (S3/GCS/Backblaze), retention ≥ 30 days. Convex's platform backups (dashboard → Settings → Snapshot exports) are a second copy. **A backup that has never been restored is a hope, not a backup** — re-run the drill quarterly.

Hygiene: snapshot files contain real PII — never commit them to git; delete local copies after uploading to durable storage.

---

## 6. Cost guardrails

- **LLM spend**: `LLM_DAILY_BUDGET_USD` (default $50/day when unset). Spend is tracked in the `llmBudget` table. Raising the cap requires setting the env var.
- **Serper**: per-university budget enforced in code (`convex/lib/serperBudget.ts`, ≤14 queries/university). `maxSerperQueries: 0` disables Serper entirely.
- **Firecrawl**: ≤8 credits/university, with automatic Jina fallback when credits are exhausted.
- **Gemini model routing**: expensive `gemini-3.7-flash` only for complex tasks; `gemini-3.5-flash-lite` for scraper/scoring/personalization.
- Provider quota/errors are recorded in `apiAlerts` and surfaced in the dashboard via the alert modal (6h dedup).

---

## 7. Monitoring & incident response

| Signal | Where | Action |
| --- | --- | --- |
| Provider quota errors (Gemini/Firecrawl/Serper) | `apiAlerts` table → dashboard alert modal | Check provider console, raise limits or switch fallback |
| Backend action errors | Sentry (when `SENTRY_DSN` set) + Convex dashboard logs | Root-cause via logs: `npx convex logs --deployment prod --history 500` |
| Read-limit / OCC contention | Convex dashboard → Insights | Optimize queries/indexes; see `docs/PRODUCTION_READINESS.md` |
| Deployment failures | Vercel dashboard + `npx convex deploy` output | Roll back via previous deployment |
| Auth issues ("Can't parse refresh token" on sign-in/reset) | Convex logs | Stale sessions after a JWT key rotation. Fix: `npx convex run 'admin:clearAllAuthSessions'` then `npx convex run 'admin:clearAuthVerificationCodes'` (users re-sign-in) |
| Reply classification silently "other" | `replyLogs` rows without `classification` | Check Gemini key/quota; classifier now surfaces errors in the Simulate Reply UI |

**Rollback:** Convex — redeploy a previous commit (`git checkout <commit> && npx convex deploy`). Frontend — Vercel dashboard → Deployments → promote a previous deployment.

**On-call:** the deploying team (Fretbox) owns prod until handover; after handover, megaplan's designated operator + Fretbox escalation.

---

## 8. Long-running enrichment (reminder)

Never await long enrichment chains inline from the CLI (client waits ~5 min). Use the scheduler entrypoints:

```bash
npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentInternal' '{"universityId":"<id>"}'
npx convex run --deployment prod 'actions/orchestrator:scheduleEnrichmentBatch' '{"queue":["<id1>","<id2>"]}'
```

Chain: `scheduleEnrichmentInternal` → `runEnrichmentChainInternal` (phases 1–4) → `finishEnrichmentChainInternal` (phases 5–6). Batches run sequentially so Firecrawl/Serper are never hit concurrently.

---

## 9. Admin ops (CLI)

| Task | Command |
| --- | --- |
| Force-logout all users (after key rotation) | `npx convex run 'admin:clearAllAuthSessions'` |
| Clear stale reset codes | `npx convex run 'admin:clearAuthVerificationCodes'` |
| Reset one university's enrichment | `npx convex run 'admin:resetUniversityEnrichment' '{"nameKeyword":"..."}'` (admin-gated) |
| Check university state | `npx convex run 'universities:getInternal' '{"universityId":"<id>"}'` |

---

*Document end — keep in sync with `README.md`, `docs/PRODUCTION_READINESS.md`, and `docs/CLIENT_ONBOARDING.md`.*
