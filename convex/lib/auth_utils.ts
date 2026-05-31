/**
 * Helper to check authentication with a development-only bypass.
 * This file must NOT have "use node" as it is imported by mutations.
 */
export async function validateAuth(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity;
}
