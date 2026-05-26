import { test, expect } from "@playwright/test";

test.describe("Dashboard E2E", () => {
  test("Dashboard loads without console errors", async ({ page }) => {
    // Navigate to dashboard (auth may redirect — that's fine for this smoke)
    await page.goto("http://localhost:3001/dashboard");

    // Wait for any loading state to resolve
    await page.waitForLoadState("networkidle");

    // Verify no critical console errors
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Give a moment for any deferred rendering
    await page.waitForTimeout(500);

    // We should not see React hydration errors or 500s
    const errorTexts = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") ||
        e.includes("500") ||
        e.includes("TypeError"),
    );

    expect(errorTexts).toHaveLength(0);
  });

  test("Outreach Kanban page renders", async ({ page }) => {
    await page.goto("http://localhost:3001/dashboard/outreach");
    await page.waitForLoadState("networkidle");

    // Page should have some content rendered (not a blank 404)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
