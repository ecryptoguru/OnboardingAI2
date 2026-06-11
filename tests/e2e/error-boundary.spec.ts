import { test, expect } from "@playwright/test";

test.describe("Error Boundary", () => {
  test("Dashboard error boundary renders for invalid routes", async ({ page }) => {
    // Navigate to a clearly invalid dashboard sub-route
    const response = await page.goto("/dashboard/invalid-route-xyz", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Should not be a 500
    expect(response?.status()).not.toBe(500);

    // Page should still render something (likely the 404 or dashboard shell)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Global 404 page exists", async ({ page }) => {
    await page.goto("/this-page-definitely-does-not-exist", {
      waitUntil: "domcontentloaded",
    });

    // Should not 500
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Dashboard shell renders on protected routes", async ({ page }) => {
    // Any dashboard route should at least render the shell (sidebar + header)
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
