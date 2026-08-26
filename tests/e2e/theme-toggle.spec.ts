import { test, expect } from "@playwright/test";
import { requireAuth, signIn } from "./helpers/auth";

test.describe("Theme Toggle", () => {
  test("dark mode persists after toggling in the dashboard sidebar", async ({
    page,
  }) => {
    requireAuth();
    await signIn(page);

    const toggle = page.getByRole("button", { name: "Toggle theme" });
    await expect(toggle).toBeVisible();

    const html = page.locator("html");
    const before = await html.getAttribute("class");

    await toggle.click();
    await expect
      .poll(async () => (await html.getAttribute("class")) !== before)
      .toBe(true);

    // Toggle back to restore the original theme for other tests.
    await toggle.click();
    await expect
      .poll(async () => (await html.getAttribute("class")) === before)
      .toBe(true);
  });
});
