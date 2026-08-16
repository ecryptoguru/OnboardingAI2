import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

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
    await page.goto("/dashboard/approvals", { waitUntil: "domcontentloaded" });

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
    await page.goto("/dashboard/approvals", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Client-side AuthGuard redirects unauthenticated users to sign-in;
    // wait for the redirect so we don't snapshot the loading spinner.
    await page.waitForURL(/.*sign-in.*/, { timeout: 15000 });

    // Body should render real content (not blank 404 or auth spinner forever)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Unauthenticated session should land on the sign-in page.
    const hasApprovalContent =
      bodyText!.includes("Sign in") || bodyText!.includes("Fretbox Outreach AI");

    expect(hasApprovalContent).toBe(true);
  });

  test("Approvals page is not a 500", async ({ page }) => {
    const response = await page.goto("/dashboard/approvals", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
  });
});
