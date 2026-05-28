"use node";

import { action } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";

/**
 * Sends an email via the SendGrid REST API.
 * Uses fetch() directly to avoid heavy dependencies in Convex actions.
 */
export const sendEmail = action({
  args: {
    to: v.union(v.string(), v.array(v.string())),
    cc: v.optional(v.array(v.string())),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    messageIdHeader: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    retryAfter?: number;
    details?: unknown;
  }> => {
    // ─── Rate limit guard (per destination, 3 per minute) ─────────────────
    const toList = Array.isArray(args.to) ? args.to : [args.to];
    const rateLimitKey = `send_email:${toList[0]}`;
    const rateLimit: { allowed: boolean; retryAfter?: number } =
      await ctx.runAction(api.rateLimits.checkRateLimit, {
        key: rateLimitKey,
        windowMs: 60_000,
        maxRequests: 3,
      });
    if (!rateLimit.allowed) {
      console.warn(`[Email Action] Rate limited for ${toList[0]}`);
      return {
        success: false,
        error: "RATE_LIMITED",
        retryAfter: rateLimit.retryAfter,
      };
    }

    // Fetch SendGrid key from settings DB first, fall back to env for backward compatibility
    const dbKey = await ctx.runQuery(internal.settings.getInternalSendgridKey);
    const apiKey = dbKey || process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || "outreach@fretbox.in";

    if (!apiKey) {
      console.error("[Email Action] SENDGRID_API_KEY is not configured");
      return { success: false, error: "SENDGRID_API_KEY_MISSING" };
    }

    const headers: Record<string, string> = {};
    if (args.messageIdHeader) headers["Message-ID"] = args.messageIdHeader;
    if (args.inReplyTo) headers["In-Reply-To"] = args.inReplyTo;
    if (args.references) headers["References"] = args.references;

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        personalizations: [
          {
            to: (Array.isArray(args.to) ? args.to : [args.to]).map((e) => ({
              email: e,
            })),
            ...(args.cc && args.cc.length > 0
              ? { cc: args.cc.map((e) => ({ email: e })) }
              : {}),
          },
        ],
        from: { email: fromEmail, name: "Ashish Gupta (Fretbox)" },
        subject: args.subject,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        content: [
          {
            type: "text/plain",
            value: args.text,
          },
          ...(args.html ? [{ type: "text/html", value: args.html }] : []),
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Unknown error" }));
      console.error("[Email Action] SendGrid error:", errorData);
      return {
        success: false,
        error: "SENDGRID_API_ERROR",
        details: errorData,
      };
    }

    // SendGrid returns 202 Accepted on success
    const messageId = response.headers.get("x-message-id") ?? undefined;
    return { success: true, messageId };
  },
});

/**
 * HITL: Approves a drafted email, sends it via SendGrid,
 * updates status to "sent", and resumes the sequence.
 */
export const approveAndSend = action({
  args: { emailId: v.id("emailsSent") },
  handler: async (ctx, args) => {
    // 1. Fetch the drafted email
    const email = await ctx.runQuery(internal.emails.getInternal, {
      id: args.emailId,
    });
    if (!email) throw new Error("Email not found");
    if (email.status !== "pending_approval")
      throw new Error("Email is not pending approval");

    // Fetch stakeholder to get email address
    const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
      id: email.stakeholder_id,
    });
    if (!st || !st.email) throw new Error("Stakeholder missing email");

    // 2. Send via SendGrid
    const customMessageId = `<fretbox-${email._id}@reply.fretbox.in>`;
    const sendResult = await ctx.runAction(api.actions.email.sendEmail, {
      to: st.email,
      subject: email.subject,
      text: email.body,
      html: email.html_body ?? undefined,
      messageIdHeader: customMessageId,
    });

    if (!sendResult.success) {
      await ctx.runMutation(internal.emails.updateStatusInternal, {
        id: args.emailId,
        status: "failed",
      });
      throw new Error(`SendGrid failed: ${sendResult.error}`);
    }

    const now = Date.now();
    const normalizedSendgridMessageId = sendResult.messageId?.split(".")[0];
    // 3. Update Email status
    await ctx.runMutation(internal.emails.updateStatusInternal, {
      id: args.emailId,
      status: "sent",
      sendgrid_message_id: normalizedSendgridMessageId,
      sent_at: now,
    });

    // 4. Resume Sequence (if it's part of one)
    if (email.sequence_id) {
      // Auto-replies are step_number 99, we don't advance sequence current_step for them,
      // but we do want to calculate next_send_at based on the actual current_step of the sequence.
      const seq = await ctx.runQuery(internal.sequences.getInternal, {
        id: email.sequence_id,
      });
      if (seq && email.step_number !== 99) {
        // It's a standard outreach step email. Calculate next send date based on this step.
        const { getNextSendAt } = await import("../lib/cadence.js");
        const nextSendAt = getNextSendAt(email.step_number);

        await ctx.runMutation(internal.sequences.resumeInternal, {
          id: email.sequence_id,
          next_send_at: nextSendAt || undefined,
          status: nextSendAt ? "active" : "completed",
        });
      } else if (seq && email.step_number === 99) {
        // Auto-reply inside an active sequence. Just ensure it's active.
        await ctx.runMutation(internal.sequences.resumeInternal, {
          id: email.sequence_id,
          status: "active",
        });
      }
    }

    return { success: true };
  },
});
