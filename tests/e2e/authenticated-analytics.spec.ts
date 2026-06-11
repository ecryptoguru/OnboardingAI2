import { test, expect } from "@playwright/test";

test.describe("Analytics Page", () => {
  test("Analytics page loads without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(500);

    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") || e.includes("500") || e.includes("TypeError"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("Analytics page is not a 500", async ({ page }) => {
    const response = await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
  });

  test("Analytics page renders content", async ({ page }) => {
    await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded", timeout: 60000 });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
