import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Dashboard E2E", () => {
  test("Universities dashboard loads without console errors", async ({ page }) => {
    // Navigate to dashboard (auth may redirect — that's fine for this smoke)
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for any loading state to resolve
    // Network idle skipped — Convex WebSocket keeps connection alive

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

  test("Outreach page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard/outreach", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    // Unauthenticated users should be redirected to sign-in
    await expect(page).toHaveURL(/.*sign-in.*/);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Analytics page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    // Unauthenticated users should be redirected to sign-in
    await expect(page).toHaveURL(/.*sign-in.*/);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
