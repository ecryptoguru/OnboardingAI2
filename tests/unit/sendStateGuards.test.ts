"use node";

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  canFinalizeEmailSend,
  canReleaseEmailSend,
  canFailEmailSend,
  canFinalizeProposalEmail,
  canReleaseProposalEmail,
  canReleaseMeetingClaim,
} from "../../convex/lib/sendState";

/**
 * Regression tests for the finalize/release guard predicates applied by the
 * Convex mutations in `convex/emails.ts` and `convex/proposals.ts`.
 *
 * The mutations only patch a document when the predicate allows it, so a
 * stale action finalizing after a newer state change (or a duplicate release
 * after a successful send) can never overwrite terminal state.
 */

describe("email finalize/release guards", () => {
  it("allows finalize/release/fail only while the draft is claimed (sending)", () => {
    assert.strictEqual(canFinalizeEmailSend("sending"), true);
    assert.strictEqual(canReleaseEmailSend("sending"), true);
    assert.strictEqual(canFailEmailSend("sending"), true);
  });

  it("blocks finalize/release/fail once the draft left the claimed state", () => {
    for (const status of [
      "sent",
      "delivered",
      "opened",
      "clicked",
      "bounced",
      "failed",
      "pending_approval",
      "queued",
      undefined,
    ]) {
      assert.strictEqual(canFinalizeEmailSend(status), false, `finalize status=${status}`);
      assert.strictEqual(canReleaseEmailSend(status), false, `release status=${status}`);
      assert.strictEqual(canFailEmailSend(status), false, `fail status=${status}`);
    }
  });

  it("a duplicate release after a successful send is a no-op", () => {
    // The exact regression this guards: action A sends + finalizes (sent);
    // action B's catch block then tries to release. The guard must refuse.
    assert.strictEqual(canReleaseEmailSend("sent"), false);
  });
});

describe("proposal email finalize/release guards", () => {
  it("allows finalize/release only while the proposal is claimed (sending)", () => {
    assert.strictEqual(canFinalizeProposalEmail("sending"), true);
    assert.strictEqual(canReleaseProposalEmail("sending"), true);
  });

  it("blocks finalize/release for any other state", () => {
    for (const state of ["sent", "failed", undefined]) {
      assert.strictEqual(canFinalizeProposalEmail(state), false, `finalize state=${state}`);
      assert.strictEqual(canReleaseProposalEmail(state), false, `release state=${state}`);
    }
  });

  it("a duplicate release after a successful proposal send is a no-op", () => {
    assert.strictEqual(canReleaseProposalEmail("sent"), false);
  });
});

describe("meeting release guard", () => {
  it("allows release only while the meeting claim is creating", () => {
    assert.strictEqual(canReleaseMeetingClaim("creating"), true);
  });

  it("never overwrites a confirmed or cancelled meeting", () => {
    assert.strictEqual(canReleaseMeetingClaim("confirmed"), false);
    assert.strictEqual(canReleaseMeetingClaim("cancelled"), false);
    assert.strictEqual(canReleaseMeetingClaim("pending"), false);
    assert.strictEqual(canReleaseMeetingClaim(undefined), false);
  });
});
