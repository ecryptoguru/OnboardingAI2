"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import mammoth from "mammoth";
import { validateAuth } from "../lib/auth_utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Extract plain text and HTML from an uploaded .docx file.
 * Returns the extracted text, an HTML rendering, and any parser messages.
 */
export const parseDocx = action({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await validateAuth(ctx);
    try {
      const fileUrl = await ctx.storage.getUrl(args.storageId);
      if (!fileUrl) throw new ConvexError("File not found");

      const response = await fetch(fileUrl, {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new ConvexError("Failed to fetch uploaded file");

      const buffer = Buffer.from(await response.arrayBuffer());

      const [raw, html] = await Promise.all([
        mammoth.extractRawText({ buffer }),
        mammoth.convertToHtml({ buffer }),
      ]);

      return {
        text: raw.value,
        html: html.value,
        messages: raw.messages.map((m) => m.message),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ConvexError(`Failed to parse .docx: ${message}`);
    }
  },
});

/**
 * Create one or more email drafts from a parsed document and a list of recipients.
 * Each recipient can be either an existing stakeholder or a custom email address.
 */
export const createDocumentDrafts = action({
  args: {
    subject: v.string(),
    body: v.string(),
    htmlBody: v.optional(v.string()),
    bodyStorageId: v.optional(v.id("_storage")),
    attachments: v.optional(
      v.array(
        v.object({
          storage_id: v.id("_storage"),
          filename: v.string(),
          mime_type: v.string(),
        }),
      ),
    ),
    recipients: v.array(
      v.object({
        university_id: v.id("universities"),
        stakeholder_id: v.optional(v.id("stakeholders")),
        custom_email: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await validateAuth(ctx);

    if (args.recipients.length === 0) {
      throw new ConvexError("At least one recipient is required");
    }

    if (args.bodyStorageId) {
      const bodyUrl = await ctx.storage.getUrl(args.bodyStorageId);
      if (!bodyUrl) throw new ConvexError("Body document not found in storage");
    }

    if (args.attachments) {
      for (const a of args.attachments) {
        const url = await ctx.storage.getUrl(a.storage_id);
        if (!url) {
          throw new ConvexError(`Attachment not found in storage: ${a.filename}`);
        }
      }
    }

    const now = Date.now();
    const createdIds: string[] = [];

    for (const r of args.recipients) {
      if (!r.stakeholder_id && !r.custom_email) {
        throw new ConvexError(
          "Each recipient must have a stakeholder or a custom email",
        );
      }

      const stakeholderId = r.stakeholder_id;
      let recipientEmail = r.custom_email;

      if (stakeholderId) {
        const st = await ctx.runQuery(internal.stakeholders.getByIdInternal, {
          id: stakeholderId,
        });
        if (!st) throw new ConvexError("Stakeholder not found");
        if (st.university_id !== r.university_id) {
          throw new ConvexError("Stakeholder does not belong to this university");
        }
        if (!st.email) {
          throw new ConvexError(
            `Stakeholder ${st.name || st.role || ""} has no email address`,
          );
        }
        recipientEmail = st.email;
      } else if (recipientEmail && !validateEmail(recipientEmail)) {
        throw new ConvexError(`Invalid custom email: ${recipientEmail}`);
      }

      // If a stakeholder is selected, clear the custom email so the DB is unambiguous.
      if (stakeholderId) {
        recipientEmail = undefined;
      }

      const emailId: string = await ctx.runMutation(internal.emails.insertInternal, {
        sequence_id: undefined,
        university_id: r.university_id,
        stakeholder_id: stakeholderId,
        recipient_email: recipientEmail,
        step_number: 0,
        subject: args.subject,
        body: args.body,
        html_body: args.htmlBody,
        document_storage_id: args.bodyStorageId,
        attachments: args.attachments,
        status: "pending_approval",
        drafted_at: now,
      });
      createdIds.push(emailId);
    }

    return { created: createdIds.length, ids: createdIds };
  },
});
