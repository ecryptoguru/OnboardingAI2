"use node";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { v, ConvexError } from "convex/values";
import mammoth from "mammoth";
import { validateAuth, getCurrentUserId } from "../lib/auth_utils";
import {
  MAX_ATTACHMENT_BYTES_TOTAL,
  MAX_BODY_DOCUMENT_BYTES,
  validateAttachmentLimits,
  validateBodyLength,
  validateRecipientCount,
  validateSubjectLength,
} from "../lib/limits";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/** Fetch a storage object with a byte cap. Rejects oversized/missing files. */
async function fetchStorageObject(
  ctx: { storage: { getUrl: (id: unknown) => Promise<string | null> } },
  storageId: unknown,
  maxBytes: number,
): Promise<ArrayBuffer> {
  const url = await ctx.storage.getUrl(storageId as never);
  if (!url) throw new ConvexError("Uploaded file not found in storage");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ConvexError("Failed to fetch uploaded file");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new ConvexError(
      `File exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB size limit`,
    );
  }
  return buffer;
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
      const buffer = Buffer.from(
        await fetchStorageObject(ctx, args.storageId, MAX_BODY_DOCUMENT_BYTES),
      );

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
    const owner_id = await getCurrentUserId(ctx);

    const recipientError = validateRecipientCount(args.recipients.length);
    if (recipientError) throw new ConvexError(recipientError);
    const subjectError = validateSubjectLength(args.subject);
    if (subjectError) throw new ConvexError(subjectError);
    const bodyError = validateBodyLength(args.body);
    if (bodyError) throw new ConvexError(bodyError);

    // Deduplicate attachment storage ids so the same file is never attached twice.
    const seenStorage = new Set<string>();
    const attachments = (args.attachments ?? []).filter((a) => {
      const key = a.storage_id;
      if (seenStorage.has(key)) return false;
      seenStorage.add(key);
      return true;
    });
    const attachmentError = validateAttachmentLimits(
      attachments.length,
      0,
    );
    if (attachmentError) throw new ConvexError(attachmentError);
    if (attachments.length > 0) {
      let totalBytes = 0;
      for (const a of attachments) {
        const buffer = await fetchStorageObject(
          ctx,
          a.storage_id,
          MAX_ATTACHMENT_BYTES_TOTAL,
        );
        totalBytes += buffer.byteLength;
        if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
          throw new ConvexError(
            `Attachments exceed the ${Math.floor(MAX_ATTACHMENT_BYTES_TOTAL / (1024 * 1024))} MB total size limit`,
          );
        }
      }
    }

    if (args.bodyStorageId) {
      await fetchStorageObject(ctx, args.bodyStorageId, MAX_BODY_DOCUMENT_BYTES);
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
        attachments: attachments.length > 0 ? attachments : undefined,
        status: "pending_approval",
        owner_id,
        drafted_at: now,
      });
      createdIds.push(emailId);
    }

    return { created: createdIds.length, ids: createdIds };
  },
});
