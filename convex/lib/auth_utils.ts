/**
 * Helper to check authentication with a debug bypass.
 * This file must NOT have "use node" as it is imported by mutations.
 */
export async function validateAuth(ctx: { auth: { getUserIdentity: () => Promise<any> } }) {
  if (process.env.SKIP_AUTH === "true") {
    console.warn("[Auth] ⚠️ Debug bypass enabled (SKIP_AUTH=true)");
    return { name: "Debug User", email: "debug@fretbox.in" };
  }
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}
