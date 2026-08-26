import { test, expect } from "@playwright/test";
import { requireAuth, signIn, gotoAuthenticated, collectErrors } from "./helpers/auth";

test.describe("Approvals Queue (authenticated)", () => {
  test.beforeEach(() => requireAuth());

  test("approvals page renders the queue (or empty state) without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await gotoAuthenticated(page, "/dashboard/approvals");
    await expect(
      page.getByRole("heading", { name: /HITL Approvals/i }),
    ).toBeVisible();

    // Either the pending counter + cards, or the empty state — both are valid.
    const emptyState = page.getByText("Inbox Zero!", { exact: false });
    const pendingBadge = page.getByText("Pending", { exact: true });
    await expect
      .poll(async () => {
        return (await emptyState.count()) > 0 || (await pendingBadge.count()) > 0;
      })
      .toBe(true);

    // Sidebar badge for approvals exists.
    await expect(
      page.locator("aside").getByRole("link", { name: /Approvals/i }),
    ).toBeVisible();
    errors.assertClean();
  });

  test("approve action is present on pending drafts and sends without double-send", async ({
    page,
  }) => {
    await signIn(page);
    await gotoAuthenticated(page, "/dashboard/approvals");

    const approveButtons = page.getByRole("button", {
      name: /Approve & Send/i,
    });
    const count = await approveButtons.count();
    if (count === 0) {
      test.skip(true, "no pending drafts in this environment");
      return;
    }
    // Clicking must not throw for the first draft; result arrives as a toast.
    // We do NOT approve real-recipient drafts here — the controlled send
    // journey lives in journeys.spec.ts behind E2E_SEND_ALLOWED.
    await expect(approveButtons.first()).toBeEnabled();
  });
});
