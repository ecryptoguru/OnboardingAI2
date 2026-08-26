/**
 * Shared operational limits for uploads, batches, and paid operations.
 *
 * Pure constants and validators so both the client (validation before
 * upload) and the server (enforcement before buffering/fan-out) agree on
 * the same numbers, and so the logic is unit-testable hermetically.
 * All limits sit comfortably below Convex document/storage and ZeptoMail
 * message constraints.
 */

/** Maximum raw bytes for the .docx body document. */
export const MAX_BODY_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Maximum raw bytes per attachment (and in total across attachments). */
export const MAX_ATTACHMENT_BYTES_TOTAL = 10 * 1024 * 1024; // 10 MB

/** Maximum number of attachments per email draft. */
export const MAX_ATTACHMENT_COUNT = 5;

/** Maximum number of recipients per Document Mailer batch. */
export const MAX_RECIPIENTS_PER_BATCH = 200;

/** Maximum email subject length (chars). */
export const MAX_SUBJECT_LENGTH = 200;

/** Maximum email body length (chars). */
export const MAX_BODY_LENGTH = 50_000;

/** Maximum CSV rows accepted per ingestion. */
export const MAX_CSV_ROWS = 10_000;

/** Maximum CSV payload bytes accepted per ingestion. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

/** Maximum rows a single bulk insert mutation accepts. */
export const MAX_BULK_INSERT_ROWS = 10_000;

/** Maximum result count for vector search. */
export const MAX_VECTOR_SEARCH_LIMIT = 50;

/** Maximum rows returned by an unbounded "all" internal list query. */
export const BULK_LIST_LIMIT = 5_000;

/** Maximum recipients for proposal emails (per TO/CC list). */
export const MAX_PROPOSAL_RECIPIENTS = 50;

/** Human-readable labels for UI copy. */
export const LIMIT_LABELS = {
  bodyDocumentMB: MAX_BODY_DOCUMENT_BYTES / (1024 * 1024),
  attachmentTotalMB: MAX_ATTACHMENT_BYTES_TOTAL / (1024 * 1024),
  attachmentCount: MAX_ATTACHMENT_COUNT,
  recipientsPerBatch: MAX_RECIPIENTS_PER_BATCH,
  subjectLength: MAX_SUBJECT_LENGTH,
  bodyLength: MAX_BODY_LENGTH,
  csvRows: MAX_CSV_ROWS,
} as const;

/** Returns an error message, or null when the subject is acceptable. */
export function validateSubjectLength(subject: string): string | null {
  if (!subject.trim()) return "Subject is required";
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Subject is too long (max ${MAX_SUBJECT_LENGTH} characters)`;
  }
  return null;
}

/** Returns an error message, or null when the body is acceptable. */
export function validateBodyLength(body: string): string | null {
  if (!body.trim()) return "Email body is required";
  if (body.length > MAX_BODY_LENGTH) {
    return `Email body is too long (max ${MAX_BODY_LENGTH.toLocaleString()} characters)`;
  }
  return null;
}

/** Returns an error message, or null when the recipient count is acceptable. */
export function validateRecipientCount(count: number): string | null {
  if (count <= 0) return "At least one recipient is required";
  if (count > MAX_RECIPIENTS_PER_BATCH) {
    return `Too many recipients (max ${MAX_RECIPIENTS_PER_BATCH} per batch)`;
  }
  return null;
}

/** Returns an error message, or null when the attachment set is acceptable. */
export function validateAttachmentLimits(
  count: number,
  totalBytes: number,
): string | null {
  if (count > MAX_ATTACHMENT_COUNT) {
    return `Too many attachments (max ${MAX_ATTACHMENT_COUNT} per email)`;
  }
  if (totalBytes > MAX_ATTACHMENT_BYTES_TOTAL) {
    return `Attachments exceed the ${Math.floor(MAX_ATTACHMENT_BYTES_TOTAL / (1024 * 1024))} MB total size limit`;
  }
  return null;
}

/** Clamps a requested vector-search limit into the allowed range. */
export function clampVectorSearchLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.floor(limit ?? 10), 1), MAX_VECTOR_SEARCH_LIMIT);
}
