import { test, expect } from "@playwright/test";

test.describe("Outreach Page", () => {
  test("Outreach page loads without console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/dashboard/outreach", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(500);

    const criticalErrors = consoleErrors.filter(
      (e) =>
        e.includes("Hydration") || e.includes("500") || e.includes("TypeError"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("Outreach page renders content", async ({ page }) => {
    await page.goto("/dashboard/outreach", { waitUntil: "domcontentloaded", timeout: 60000 });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test("Outreach demo page loads", async ({ page }) => {
    await page.goto("/dashboard/outreach/demo", { waitUntil: "domcontentloaded", timeout: 60000 });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);
  });
});
