import {
  convexAuth,
  EmailConfig,
  GenericActionCtxWithAuthConfig,
} from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { query } from "./_generated/server";
import { internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { v } from "convex/values";

type SendVerificationRequestParams = Parameters<
  NonNullable<EmailConfig["sendVerificationRequest"]>
>[0];

const resetEmail: EmailConfig = {
  id: "password-reset",
  type: "email",
  name: "Password Reset",
  maxAge: 60 * 60,
  async sendVerificationRequest(
    params: SendVerificationRequestParams,
    ctx?: GenericActionCtxWithAuthConfig<DataModel>,
  ) {
    const { identifier, token } = params;
    if (!ctx) {
      throw new Error("Missing Convex action context in sendVerificationRequest");
    }
    const result = await ctx.runAction(internal.actions.email.sendEmail, {
      to: identifier,
      subject: "Reset your Fretbox Outreach AI password",
      text: `You requested a password reset for your Fretbox Outreach AI account.\n\nReset code: ${token}\n\nThis code will expire in 1 hour.\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>You requested a password reset for your Fretbox Outreach AI account.</p><p>Reset code: <strong>${token}</strong></p><p>This code will expire in 1 hour.</p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    if (!result.success) {
      throw new Error(`Failed to send reset email: ${result.error ?? "Unknown error"}`);
    }
  },
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: resetEmail,
    }),
  ],
});

export const checkEmailExists = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return false;
    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", normalized))
      .first();
    return !!existing;
  },
});
