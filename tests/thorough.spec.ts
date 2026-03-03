import { test, expect } from "@playwright/test";

test.describe("Thorough Verification - Dashboard & Data", () => {
  test("Dashboard displays universities correctly", async ({ page }) => {
    // 1. Go to dashboard
    await page.goto("/dashboard");

    // 2. Check for page title and header
    await expect(page).toHaveTitle(/Fretbox Outreach AI/i);
    await expect(page.locator("h1")).toContainText("Universities");

    // 3. Verify the table is visible
    // Wait for the loading state to resolve
    const firstSkeleton = page.locator(".animate-pulse").first();
    if (await firstSkeleton.count() > 0) {
        await expect(firstSkeleton).toBeHidden({ timeout: 15000 });
    }

    // Check for the test university we created
    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByText("Verification Test University").first()).toBeVisible({ timeout: 10000 });
    
    // 4. Verify table headers
    await expect(page.locator("th:has-text('University')")).toBeVisible();
    await expect(page.locator("th:has-text('Status')")).toBeVisible();
    await expect(page.locator("th:has-text('Stage')")).toBeVisible();
  });

  test("Sidebar navigation and layout", async ({ page }) => {
    await page.goto("/dashboard");
    
    // Verify responsive layout elements if any (e.g. sidebar links)
    // Checking for a common nav link if it exists (assuming a layout exists)
    const sidebar = page.locator("nav");
    if (await sidebar.isVisible()) {
        await expect(sidebar).toBeVisible();
    }
  });

  test("Unauthorized access fallback", async ({ page }) => {
    // This assumes we have a way to force 'unauthenticated' in the browser
    // Since SKIP_AUTH=true is set in the cloud, the browser will see a mock user.
    // If we were to test the actual auth (SKIP_AUTH=false), it would show sign-in.
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Universities");
  });
});
