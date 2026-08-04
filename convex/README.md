# Convex functions directory

This directory contains the `fretbox-outreach-v2` Convex backend: queries, mutations, actions, HTTP routes, crons, and shared libraries.

See [Convex function docs](https://docs.convex.dev/functions) for general Convex function docs.

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
| ------- | -------- | --------- | ------ |
| `/webhooks/zeptomail` | POST | ZeptoMail delivery, open, click, and bounce events | `producer-signature` HMAC, `ZEPTOMAIL_WEBHOOK_SECRET` |
| `/webhooks/email-reply` | POST | Inbound email reply payloads (JSON or form-data) | `Authorization: Bearer`, `EMAIL_WEBHOOK_SECRET` |
| `/webhooks/google-calendar` | POST | Google Calendar push/sync notifications | `x-goog-channel-token`, `GOOGLE_CALENDAR_WEBHOOK_TOKEN` |
| `/test/ping` | GET | Health check | None |
| `/test/run-pipeline` | POST | Real-world integration test trigger | Bearer token, `TEST_WEBHOOK_SECRET` |

Webhook endpoints are disabled until their specific secret is configured; unconfigured webhooks return `401 Unauthorized`.

## Email pipeline

All outbound email flows through `convex/actions/email.ts` and the ZeptoMail REST API (`https://api.zeptomail.in/v1.1/email`).

| Action | File | Purpose |
| -------- | ------ | --------- |
| `sendEmail` | `actions/email.ts` | Generic internal action for transactional/outbound email; used for password reset (`convex/auth.ts`) and by other actions. |
| `approveAndSend` | `actions/email.ts` | HITL gate: sends a drafted `pending_approval` email, records the ZeptoMail `request_id`, and resumes the sequence. |
| `emailProposal` | `actions/proposals.ts` | Sends the generated partnership proposal as rich HTML/text to the stakeholder and CC list. |
| `sendAutoReply` | `actions/autoReply.ts` | Sends threaded auto-replies (meeting request, positive interest, request info) via ZeptoMail with `Message-ID`, `In-Reply-To`, and `References` headers. |

From email and from name are read from `systemSettings` (`zeptomailFromEmail`, `zeptomailFromName`) and fall back to `outreach@fretbox.in` / `Ashish Gupta (Fretbox)`.

## Human-in-the-loop (HITL) outreach

Outreach sequence emails are inserted into `emailsSent` with `status: "pending_approval"`. A user must approve a draft in the dashboard before `approveAndSend` dispatches it. After sending, the email status is updated to `"sent"` and the parent `outreachSequences` is resumed with the next cadence step calculated by `convex/lib/cadence.ts`.

## Institutes of National Importance (INI) seed

- `convex/lib/institutesOfNationalImportance.ts` holds the curated list of **80 IITs, NITs, and IIITs**.
- `convex/actions/iniSeed.ts` exposes `syncInstitutesOfNationalImportance` (public UI button) and `syncInstitutesOfNationalImportanceInternal` (for crons/tests).
- Matching logic uses normalized names and website domains; records with `data_source: "curated"` are skipped by the UGC sync in `convex/actions/ugcSync.ts`, preventing curated data from being overwritten.
- Use the **Sync IITs / NITs / IIITs** button on the Universities dashboard to seed or refresh these records.

## Backend environment variables

These environment variables are read inside `convex/` functions:

| Variable | Used by | Purpose |
| ---------- | --------- | --------- |
| `NEXT_PUBLIC_CONVEX_URL` | Auth, client actions | Convex API URL |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Webhooks | Site URL for HTTP actions |
| `SITE_URL` | `convex/auth.config.ts` | Password-reset callback URL |
| `SETTINGS_OBFUSCATION_SECRET` | `settings.ts` | XOR-obfuscation of stored API keys (≥ 32 chars) |
| `LLM_DAILY_BUDGET_USD` | `llmBudget.ts`, `lib/llm.ts` | Daily LLM spend soft cap |
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

## Example: a query

```ts
// convex/myFunctions.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

export const myQueryFunction = query({
  args: {
    first: v.number(),
    second: v.string(),
  },
  handler: async (ctx, args) => {
    const documents = await ctx.db.query("tablename").collect();
    console.log(args.first, args.second);
    return documents;
  },
});
```

Use it from React:

```ts
const data = useQuery(api.myFunctions.myQueryFunction, {
  first: 10,
  second: "hello",
});
```

## Example: a mutation

```ts
// convex/myFunctions.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const myMutationFunction = mutation({
  args: {
    first: v.string(),
    second: v.string(),
  },
  handler: async (ctx, args) => {
    const message = { body: args.first, author: args.second };
    const id = await ctx.db.insert("messages", message);
    return await ctx.db.get(id);
  },
});
```

Use it from React:

```ts
const mutation = useMutation(api.myFunctions.myMutationFunction);
mutation({ first: "Hello!", second: "me" });
```

---

© 2026 Fretbox. Confidential.
