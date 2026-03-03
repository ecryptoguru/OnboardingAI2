"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Sends an email via the SendGrid REST API.
 * Uses fetch() directly to avoid heavy dependencies in Convex actions.
 */
export const sendEmail = action({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    html: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL || "outreach@fretbox.in";

    if (!apiKey) {
      console.error("[Email Action] SENDGRID_API_KEY is not set");
      return { success: false, error: "SENDGRID_API_KEY_MISSING" };
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: args.to }],
          },
        ],
        from: { email: fromEmail, name: "Ashish Gupta (Fretbox)" },
        subject: args.subject,
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
      const errorData = await response.json();
      console.error("[Email Action] SendGrid error:", errorData);
      return { success: false, error: "SENDGRID_API_ERROR", details: errorData };
    }

    // SendGrid returns 202 Accepted on success
    return { success: true };
  },
});
