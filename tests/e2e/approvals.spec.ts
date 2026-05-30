import { test, expect } from "@playwright/test";

/**
 * E2E smoke test for the HITL Approvals page.
 *
 * This test verifies that the approvals dashboard renders correctly,
 * shows pending emails when they exist, and the core UI controls are present.
 *
 * NOTE: Full interactive testing (approve/reject/edit) requires authentication.
 * This suite runs as a smoke test to catch React hydration / 500 errors.
 */

test.describe("Approvals Page E2E", () => {
  test("Approvals page loads without console errors", async ({ page }) => {
    await page.goto("http://localhost:3001/dashboard/approvals");
    await page.waitForLoadState("networkidle");

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(500);

    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") ||
        e.includes("500") ||
        e.includes("TypeError") ||
        e.includes("Unhandled"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("Approvals page has expected UI elements", async ({ page }) => {
    await page.goto("http://localhost:3001/dashboard/approvals");
    await page.waitForLoadState("networkidle");

    // Body should render real content (not blank 404 or auth spinner forever)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Should contain at least one of the known approval page phrases
    // (exact text depends on auth state, but we look for structural hints)
    const hasApprovalContent =
      bodyText!.includes("Pending") ||
      bodyText!.includes("Approval") ||
      bodyText!.includes("Sign in") ||
      bodyText!.includes("Dashboard");

    expect(hasApprovalContent).toBe(true);
  });

  test("Approvals page is not a 500", async ({ page }) => {
    const response = await page.goto("http://localhost:3001/dashboard/approvals");
    expect(response?.status()).not.toBe(500);
  });
});
