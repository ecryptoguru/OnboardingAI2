/**
 * Helper to check authentication with a development-only bypass.
 * This file must NOT have "use node" as it is imported by mutations.
 */
export async function validateAuth(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  // NOTE: This bypass logic must stay in sync with middleware.ts
  if (process.env.NODE_ENV === "production") {
    // Never bypass in production regardless of env vars
  } else {
    const isDev = process.env.NODE_ENV === "development";
    const bypassSecret = process.env.DEV_AUTH_BYPASS_SECRET;
    const bypassEnabled = isDev && !!bypassSecret;
    if (bypassEnabled) {
      console.warn("[Auth] ⚠️ Development auth bypass is active");
      return { name: "Debug User", email: "debug@fretbox.in" };
    }
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}
