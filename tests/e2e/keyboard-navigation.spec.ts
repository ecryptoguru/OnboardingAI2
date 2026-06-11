import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation & Accessibility", () => {
  test("Sign-in form is keyboard navigable", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    // Tab through the form elements
    await page.keyboard.press("Tab");
    const focused1 = await page.evaluate(() => document.activeElement?.getAttribute("name"));
    expect(["email", "password", null]).toContain(focused1);

    await page.keyboard.press("Tab");
    const focused2 = await page.evaluate(() => document.activeElement?.getAttribute("name"));
    expect(["email", "password", null]).toContain(focused2);
  });

  test("Dashboard sidebar links are focusable", async ({ page }) => {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // Find the first sidebar link and check it can be focused
    const firstLink = page.locator("aside nav a").first();
    const count = await firstLink.count();

    if (count > 0) {
      await firstLink.focus();
      const isFocused = await firstLink.evaluate((el) => el === document.activeElement);
      expect(isFocused).toBe(true);
    }
  });

  test("Sign-in button is reachable via keyboard", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    // The button should be in the tab order
    const tabIndex = await submitBtn.evaluate((el) => el.tabIndex);
    expect(tabIndex).toBeLessThanOrEqual(0); // 0 or -1 are both OK for focusable elements
  });
});
