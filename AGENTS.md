<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

## Key patterns to preserve

- **Public actions** (user-facing buttons/forms) must call `await validateAuth(ctx)` at the top of the handler.
- **Internal actions** (scheduler, cron, webhook, test-only) should use `internalAction` and be called via `internal.actions.*` or `internal.<module>.*`.
- **Do not call `api.actions.*` from internal code or webhooks.** Use `internal.actions.*` instead.
- **Avoid circular `any` inference:** if a public wrapper and an `internalAction` in the same file reference each other, extract the shared logic into a `do*` helper with an explicit return type and have both wrappers call it.
- **API keys** are stored in the `systemSettings` table and XOR-obfuscated with `SETTINGS_OBFUSCATION_SECRET`. The `set*Key` mutations use `sanitizeApiKey()` to reject control characters and non-ASCII bytes.
- **HTTP test endpoints** in `convex/http.ts` are disabled by default. Enable them with `DISABLE_TEST_ENDPOINTS=false` and pass `TEST_WEBHOOK_SECRET` as a bearer token.

<!-- convex-ai-end -->
