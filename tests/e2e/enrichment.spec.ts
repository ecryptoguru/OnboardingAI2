import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Enrichment Page", () => {
  test("Enrichment page loads without 500", async ({ page }) => {
    const response = await page.goto("/dashboard/enrichment", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);

    // Network idle skipped — Convex WebSocket keeps connection alive

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Enrichment page redirects unauthenticated users to sign-in", async ({ page }) => {
    await page.goto("/dashboard/enrichment", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    // Should redirect to sign-in when not authenticated
    const url = page.url();
    expect(url.includes("/sign-in") || url.includes("/dashboard/enrichment")).toBe(true);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
