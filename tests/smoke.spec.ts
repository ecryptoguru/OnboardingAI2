import { test, expect } from "@playwright/test";

test.describe("Smoke Test - Core Flows", () => {
  test("Home page renders correctly", async ({ page }) => {
    await page.goto("/");
    // Basic check for title or key element
    await expect(page).toHaveTitle(/Fretbox Outreach AI/i);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("Dashboard page accessibility", async ({ page }) => {
    await page.goto("/dashboard");
    // Should redirect to login if not authenticated, or show dashboard
    // For now, just check it loads without a crash
    const heading = page.locator("h1");
    await expect(page).not.toHaveTitle(/404/i);
  });
});
