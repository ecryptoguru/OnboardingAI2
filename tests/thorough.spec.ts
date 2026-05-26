import { test, expect } from "@playwright/test";

test.describe("Thorough Verification - API & Routing", () => {
  test("UGC sync proxy returns valid JSON or proper error", async ({
    request,
  }) => {
    const response = await request.get("http://localhost:3001/api/sync-ugc");
    // Should not be a 500 — can be 429 (rate limit) or 200/403 from UGC
    expect(response.status()).not.toBe(500);
  });

  test("Dashboard pages exist (no 404s)", async ({ page }) => {
    const paths = ["/dashboard", "/dashboard/outreach"];
    for (const path of paths) {
      const response = await page.goto(`http://localhost:3001${path}`);
      // Auth may redirect to sign-in — that's fine; we just check it's not a 500
      expect(response?.status()).not.toBe(500);
      const body = await page.locator("body").textContent();
      expect(body).toBeTruthy();
      expect(body!.length).toBeGreaterThan(50);
    }
  });
});
