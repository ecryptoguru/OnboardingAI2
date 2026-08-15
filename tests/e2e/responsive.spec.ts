import { test, expect } from "@playwright/test";

test.describe("Responsive Viewports", () => {
  test("Landing page renders on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Sign-in page renders on tablet viewport", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });

  test("Landing page renders on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Auth pages render on desktop and mobile viewports", async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });

    const mobileBody = await page.locator("body").textContent();
    expect(mobileBody).toBeTruthy();
    expect(mobileBody!.length).toBeGreaterThan(50);
  });
});
