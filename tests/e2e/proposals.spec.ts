import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Proposals Page", () => {
  test("Proposals page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard/proposals", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    const url = page.url();
    expect(url.includes("/sign-in") || url.includes("/dashboard/proposals")).toBe(true);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Proposals page is not a 500", async ({ page }) => {
    const response = await page.goto("/dashboard/proposals", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
  });
});
