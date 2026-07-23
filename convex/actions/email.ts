"use node";

import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { validateAuth } from "../lib/auth_utils";

type SendEmailArgs = {
  to: string | string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  messageIdHeader?: string;
  inReplyTo?: string;
  references?: string;
  clientReference?: string;
};

type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
  retryAfter?: number;
  details?: unknown;
};

/**
 * Sends an email via the ZeptoMail (Zoho) REST API.
 * Uses fetch() directly to avoid heavy dependencies in Convex actions.
 */
async function doSendEmail(ctx: ActionCtx, args: SendEmailArgs): Promise<SendEmailResult> {
  // ─── Rate limit guard (per destination, 3 per minute) ─────────────────
  const toList = Array.isArray(args.to) ? args.to : [args.to];
  const rateLimitKey = `send_email:${toList[0]}`;
  const rateLimit: { allowed: boolean; retryAfter?: number } =
    await ctx.runMutation(internal.rateLimits.checkRateLimitInternal, {
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

  // Fetch ZeptoMail key, from-email, and sender name from settings DB (Settings page only)
  const [dbKey, dbFromEmail, dbFromName] = await Promise.all([
    ctx.runQuery(internal.settings.getInternalZeptomailKey),
    ctx.runQuery(internal.settings.getInternalZeptomailFromEmail),
    ctx.runQuery(internal.settings.getInternalZeptomailFromName),
  ]);
  const apiKey = dbKey;
  const fromEmail = dbFromEmail || "outreach@fretbox.in";
  const fromName = dbFromName || "Ashish Gupta (Fretbox)";

  if (!apiKey) {
    console.error("[Email Action] ZEPTOMAIL_API_KEY is not configured");
    return { success: false, error: "ZEPTOMAIL_API_KEY_MISSING" };
  }

  const mimeHeaders: Record<string, string> = {};
  if (args.messageIdHeader) mimeHeaders["Message-ID"] = args.messageIdHeader;
  if (args.inReplyTo) mimeHeaders["In-Reply-To"] = args.inReplyTo;
  if (args.references) mimeHeaders["References"] = args.references;

  const response = await fetch("https://api.zeptomail.in/v1.1/email", {
    method: "POST",
    headers: {
      Authorization: `Zoho-enczapikey ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from: { address: fromEmail, name: fromName },
      to: (Array.isArray(args.to) ? args.to : [args.to]).map((e) => ({
        email_address: { address: e },
      })),
      ...(args.cc && args.cc.length > 0
        ? { cc: args.cc.map((e) => ({ email_address: { address: e } })) }
        : {}),
      subject: args.subject,
      textbody: args.text,
      ...(args.html ? { htmlbody: args.html } : {}),
      ...(Object.keys(mimeHeaders).length > 0 ? { mime_headers: mimeHeaders } : {}),
      ...(args.clientReference ? { client_reference: args.clientReference } : {}),
    }),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "Unknown error" }));
    console.error("[Email Action] ZeptoMail error:", errorData);
    return {
      success: false,
      error: "ZEPTOMAIL_API_ERROR",
      details: errorData,
    };
  }

  // ZeptoMail returns 200 OK with JSON { data: [...], message: "OK", request_id: "...", object: "email" }
  const responseData = await response.json().catch(() => ({}));
  const messageId = (responseData as { request_id?: string })?.request_id ?? undefined;
  return { success: true, messageId };
}

export const sendEmail = internalAction({
  args: {
    to: v.union(v.string(), v.array(v.string())),
    cc: v.optional(v.array(v.string())),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
    messageIdHeader: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.string()),
    clientReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await doSendEmail(ctx, args);
  },
});

/**
 * HITL: Approves a drafted email, sends it via ZeptoMail,
 * updates status to "sent", and resumes the sequence.
 */
export const approveAndSend = action({
  args: { emailId: v.id("emailsSent") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
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

    // 2. Send via ZeptoMail
    const customMessageId = `<fretbox-${email._id}@reply.fretbox.in>`;
    const sendResult = await doSendEmail(ctx, {
      to: st.email,
      subject: email.subject,
      text: email.body,
      html: email.html_body ?? undefined,
      messageIdHeader: customMessageId,
      clientReference: args.emailId,
    });

    if (!sendResult.success) {
      await ctx.runMutation(internal.emails.updateStatusInternal, {
        id: args.emailId,
        status: "failed",
      });
      throw new Error(`ZeptoMail failed: ${sendResult.error}`);
    }

    const now = Date.now();
    // Store the request_id returned by ZeptoMail; webhooks will match on email_reference or client_reference
    const zeptomailMessageId = sendResult.messageId;
    // 3. Update Email status
    await ctx.runMutation(internal.emails.updateStatusInternal, {
      id: args.emailId,
      status: "sent",
      zeptomail_message_id: zeptomailMessageId,
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
