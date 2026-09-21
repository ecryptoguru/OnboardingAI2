import { getOptionalEnv } from "./env";
import { Id } from "../_generated/dataModel";

interface UserIdentityLike {
  subject?: string;
  email?: string;
  tokenIdentifier?: string;
}

function identityEmail(identity: UserIdentityLike): string {
  const raw = String(identity.email || identity.tokenIdentifier || "")
    .toLowerCase()
    .trim();
  return raw.includes("|") ? raw.split("|").pop()?.trim() || "" : raw;
}

function allowedEmails(): string[] {
  return (getOptionalEnv("ADMIN_EMAILS") || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Helper to check authentication with a development-only bypass.
 * This file must NOT have "use node" as it is imported by mutations.
 */
export async function validateAuth(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const typedIdentity = identity as UserIdentityLike;
  const allowed = allowedEmails();
  if (allowed.length === 0 || !allowed.includes(identityEmail(typedIdentity))) {
    throw new Error("Forbidden: Account access is not configured");
  }
  return typedIdentity;
}

/**
 * Extract the current user's `users._id` from their identity subject.
 * Throws if the client is not authenticated.
 */
export async function getCurrentUserId(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}): Promise<Id<"users">> {
  const identity = await validateAuth(ctx);
  const subject = identity.subject;
  if (!subject) throw new Error("Unauthenticated");
  const [userId] = subject.split("|");
  if (!userId) throw new Error("Unauthenticated");
  return userId as Id<"users">;
}

/**
 * Returns true if the current user is an admin.
 * Reuses validateAdmin, which fails closed when ADMIN_EMAILS is not configured.
 */
export async function isAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}): Promise<boolean> {
  try {
    await validateAdmin(ctx);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that the current user is an admin.
 * Admin emails are configured via the ADMIN_EMAILS environment variable
 * (comma-separated). Missing configuration fails closed.
 */
export async function validateAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<unknown> };
}) {
  return validateAuth(ctx);
}
