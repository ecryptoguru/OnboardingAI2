"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  claimEmailStatus,
  claimMeetingStatus,
  claimProposalEmailState,
  isTerminalEmailStatus,
  isTransientSendError,
} from "../../convex/lib/sendState";

describe("claimEmailStatus — HITL draft claim state machine", () => {
  it("claims a pending_approval draft", () => {
    assert.deepStrictEqual(claimEmailStatus("pending_approval"), {
      allowed: true,
      reason: "ok",
    });
  });

  it("rejects a draft already claimed (in flight)", () => {
    assert.deepStrictEqual(claimEmailStatus("sending"), {
      allowed: false,
      reason: "in_flight",
    });
  });

  it("never re-sends terminal statuses", () => {
    for (const status of ["sent", "delivered", "opened", "clicked", "bounced"]) {
      assert.deepStrictEqual(claimEmailStatus(status), {
        allowed: false,
        reason: "already_sent",
      });
    }
  });

  it("rejects queued and failed drafts", () => {
    assert.deepStrictEqual(claimEmailStatus("queued"), {
      allowed: false,
      reason: "not_pending",
    });
    assert.deepStrictEqual(claimEmailStatus("failed"), {
      allowed: false,
      reason: "not_pending",
    });
  });
});

describe("isTerminalEmailStatus", () => {
  it("classifies dispatched statuses as terminal", () => {
    for (const status of ["sent", "delivered", "opened", "clicked", "bounced"]) {
      assert.strictEqual(isTerminalEmailStatus(status), true);
    }
  });

  it("classifies queue statuses as non-terminal", () => {
    for (const status of ["pending_approval", "sending", "queued", "failed"]) {
      assert.strictEqual(isTerminalEmailStatus(status), false);
    }
  });
});

describe("claimProposalEmailState — proposal email send claim", () => {
  it("claims when no send is in flight", () => {
    assert.strictEqual(claimProposalEmailState(undefined, undefined, Date.now()).allowed, true);
    assert.strictEqual(claimProposalEmailState("sent", undefined, Date.now()).allowed, true);
  });

  it("blocks a concurrent send", () => {
    assert.deepStrictEqual(claimProposalEmailState("sending", Date.now(), Date.now()), {
      allowed: false,
      reason: "in_flight",
    });
  });

  it("releases stale claims after the timeout", () => {
    const now = Date.now();
    assert.strictEqual(
      claimProposalEmailState("sending", now - 6 * 60 * 1000, now).allowed,
      true,
    );
  });
});

describe("claimMeetingStatus — calendar event creation claim", () => {
  it("claims when no event exists", () => {
    assert.strictEqual(claimMeetingStatus(undefined, undefined, Date.now()).allowed, true);
    assert.strictEqual(claimMeetingStatus("pending", undefined, Date.now()).allowed, true);
  });

  it("never re-creates a confirmed meeting", () => {
    assert.deepStrictEqual(claimMeetingStatus("confirmed", undefined, Date.now()), {
      allowed: false,
      reason: "already_sent",
    });
  });

  it("blocks a concurrent creation", () => {
    assert.deepStrictEqual(claimMeetingStatus("creating", Date.now(), Date.now()), {
      allowed: false,
      reason: "in_flight",
    });
  });

  it("releases stale creation claims after the timeout", () => {
    const now = Date.now();
    assert.strictEqual(
      claimMeetingStatus("creating", now - 6 * 60 * 1000, now).allowed,
      true,
    );
  });

  it("rejects cancelled proposals", () => {
    assert.deepStrictEqual(claimMeetingStatus("cancelled", undefined, Date.now()), {
      allowed: false,
      reason: "not_pending",
    });
  });
});

describe("isTransientSendError — retry classification", () => {
  it("treats rate limiting as transient", () => {
    assert.strictEqual(isTransientSendError("RATE_LIMITED"), true);
  });

  it("treats network/timeout errors as transient", () => {
    for (const error of [
      "fetch failed",
      "ETIMEDOUT",
      "socket hang up",
      "ECONNREFUSED",
      "Aborted",
    ]) {
      assert.strictEqual(isTransientSendError(error), true, error);
    }
  });

  it("treats 5xx/429 upstream statuses as transient via details", () => {
    assert.strictEqual(
      isTransientSendError("ZEPTOMAIL_API_ERROR", { status: 429 }),
      true,
    );
    assert.strictEqual(
      isTransientSendError("ZEPTOMAIL_API_ERROR", { status: 503 }),
      true,
    );
  });

  it("treats 4xx upstream statuses and unknown errors as permanent", () => {
    assert.strictEqual(
      isTransientSendError("ZEPTOMAIL_API_ERROR", { status: 400 }),
      false,
    );
    assert.strictEqual(isTransientSendError("ZEPTOMAIL_API_ERROR"), false);
    assert.strictEqual(isTransientSendError(""), false);
    assert.strictEqual(isTransientSendError(undefined), false);
  });
});
