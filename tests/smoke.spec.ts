import { test, expect } from "@playwright/test";

test.describe("Smoke Test - Core Flows", () => {
  test("Home page loads without 500 errors", async ({ page }) => {
    await page.goto("http://localhost:3001/");
    await page.waitForLoadState("networkidle");

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.waitForTimeout(500);

    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") || e.includes("500") || e.includes("TypeError"),
    );

    expect(criticalErrors).toHaveLength(0);
    expect(await page.title()).toBeTruthy();
  });

  test("Sign-in page is accessible", async ({ page }) => {
    const response = await page.goto("http://localhost:3001/sign-in");
    expect(response?.status()).not.toBe(500);
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
  });
});
