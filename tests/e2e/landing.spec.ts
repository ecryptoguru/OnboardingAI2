import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Landing Page", () => {
  test("Landing page renders with brand content", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(50);

    // Should contain brand or product references
    const hasBrandContent =
      bodyText!.includes("Fretbox") ||
      bodyText!.includes("Outreach") ||
      bodyText!.includes("University") ||
      bodyText!.includes("Sign in") ||
      bodyText!.includes("Get Started");

    expect(hasBrandContent).toBe(true);
  });

  test("Landing page has no console errors", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60000 });
    // Network idle skipped — Convex WebSocket keeps connection alive

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
  });
});
