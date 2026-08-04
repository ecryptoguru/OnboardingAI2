import { getOptionalEnv } from "./env";

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

/**
 * Validates that the current user is an admin.
 * Admin emails are configured via the ADMIN_EMAILS environment variable
 * (comma-separated). If no admins are configured, any authenticated user
 * is allowed (dev mode).
 */
export async function validateAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  const identity = await validateAuth(ctx);

  // Extract email from identity. For password provider this is often in
  // tokenIdentifier as "password|email@example.com" or directly as email.
  const rawEmail =
    (identity as Record<string, unknown>).email ||
    (identity as Record<string, unknown>).tokenIdentifier ||
    "";

  const email = String(rawEmail).toLowerCase().trim();
  // Handle tokenIdentifier format like "password|user@example.com"
  const cleanEmail = email.includes("|") ? email.split("|").pop()?.trim() || "" : email;

  const adminEmails = (getOptionalEnv("ADMIN_EMAILS") || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length > 0 && !adminEmails.includes(cleanEmail)) {
    throw new Error("Forbidden: Admin access required");
  }
}
