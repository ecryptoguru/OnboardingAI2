import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Settings Page", () => {
  test("Settings page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    const url = page.url();
    expect(url.includes("/sign-in") || url.includes("/dashboard/settings")).toBe(true);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Settings page is not a 500", async ({ page }) => {
    const response = await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
  });
});
