/**
 * Pure state-machine helpers for outbound email / calendar side effects.
 *
 * These functions are intentionally side-effect free so the claim/finalize/
 * release transitions can be unit-tested hermetically. The Convex mutations
 * in `convex/emails.ts` / `convex/proposals.ts` apply them atomically inside
 * transactions; the actions in `convex/actions/*` call them only for
 * classification decisions (transient vs permanent failure).
 */

export type ClaimDecision = {
  allowed: boolean;
  /** Human/UI-readable reason when `allowed` is false. */
  reason: "ok" | "already_sent" | "in_flight" | "not_pending";
};

/** Statuses that mean an email has irrevocably left the queue. */
export function isTerminalEmailStatus(status: string): boolean {
  return (
    status === "sent" ||
    status === "delivered" ||
    status === "opened" ||
    status === "clicked" ||
    status === "bounced"
  );
}

/**
 * Decide whether a HITL draft may be claimed for sending.
 * Only `pending_approval` drafts can be claimed; `sending` means another
 * request already claimed it; terminal statuses must not be re-sent.
 */
export function claimEmailStatus(status: string): ClaimDecision {
  if (status === "pending_approval") return { allowed: true, reason: "ok" };
  if (isTerminalEmailStatus(status)) {
    return { allowed: false, reason: "already_sent" };
  }
  if (status === "sending") return { allowed: false, reason: "in_flight" };
  return { allowed: false, reason: "not_pending" };
}

/**
 * Decide whether a proposal may claim an email send.
 * `sending` blocks concurrent sends; `sent` does NOT block a deliberate
 * resend (the UI offers "Preview & Resend"). Stale claims older than
 * `staleAfterMs` are released so a crashed action cannot wedge the proposal.
 */
export function claimProposalEmailState(
  state: string | undefined,
  claimedAt: number | undefined,
  now: number,
  staleAfterMs = 5 * 60 * 1000,
): ClaimDecision {
  if (state === "sending") {
    if (claimedAt !== undefined && now - claimedAt >= staleAfterMs) {
      return { allowed: true, reason: "ok" };
    }
    return { allowed: false, reason: "in_flight" };
  }
  return { allowed: true, reason: "ok" };
}

/**
 * Decide whether a proposal may claim a calendar event creation.
 * `confirmed` meetings are never re-created; `creating` blocks concurrent
 * creation unless the claim is stale (crashed action).
 */
export function claimMeetingStatus(
  status: string | undefined,
  claimedAt: number | undefined,
  now: number,
  staleAfterMs = 5 * 60 * 1000,
): ClaimDecision {
  if (status === "confirmed") return { allowed: false, reason: "already_sent" };
  if (status === "creating") {
    if (claimedAt !== undefined && now - claimedAt >= staleAfterMs) {
      return { allowed: true, reason: "ok" };
    }
    return { allowed: false, reason: "in_flight" };
  }
  if (status === "cancelled") return { allowed: false, reason: "not_pending" };
  return { allowed: true, reason: "ok" };
}

// ─── Finalize / release guards ───────────────────────────────────────────────
//
// The Convex mutations in `emails.ts` / `proposals.ts` apply these predicates
// before patching, so a stale action finalizing after a newer state change
// (or a duplicate release after a successful send) can never overwrite
// terminal state.

/** A claimed draft may be finalized as sent only while still `sending`. */
export function canFinalizeEmailSend(status: string | undefined): boolean {
  return status === "sending";
}

/** A claimed draft may be released back to the queue only while `sending`. */
export function canReleaseEmailSend(status: string | undefined): boolean {
  return status === "sending";
}

/** A claimed draft may be marked permanently failed only while `sending`. */
export function canFailEmailSend(status: string | undefined): boolean {
  return status === "sending";
}

/** A proposal email claim may be finalized only while still `sending`. */
export function canFinalizeProposalEmail(state: string | undefined): boolean {
  return state === "sending";
}

/** A proposal email claim may be released only while still `sending`. */
export function canReleaseProposalEmail(state: string | undefined): boolean {
  return state === "sending";
}

/** A meeting claim may be released only while still `creating`. */
export function canReleaseMeetingClaim(status: string | undefined): boolean {
  return status === "creating";
}

const TRANSIENT_PATTERN =
  /\b(rate_limit|429|timeout|etimedout|econnrefused|econnreset|socket hang up|fetch failed|network error|aborted|50[0-3])\b/i;

/**
 * Classify a send failure as retryable (transient) or permanent.
 * RATE_LIMITED and network/timeout errors are retryable; everything else
 * (including ZeptoMail API 4xx rejections) is treated as permanent so the
 * draft does not stay in the queue forever.
 */
export function isTransientSendError(
  error: string | undefined,
  details?: unknown,
): boolean {
  if (!error) return false;
  if (error === "RATE_LIMITED") return true;
  if (TRANSIENT_PATTERN.test(error)) return true;
  // ZeptoMail returns the upstream status inside `details` for API errors.
  if (details && typeof details === "object") {
    const status = (details as { status?: unknown }).status;
    if (typeof status === "number" && (status === 429 || status >= 500)) {
      return true;
    }
  }
  return false;
}
