import { test, expect } from "@playwright/test";
import { requireAuth, signIn } from "./helpers/auth";

test.describe("Keyboard Navigation & Accessibility", () => {
  test("sign-in form is keyboard navigable in order", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });

    // The skip link is intentionally the first focusable element.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="email"]')).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="password"]')).toBeFocused();

    // The "Forgot password?" link sits between the password field and submit.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Forgot password?" }),
    ).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.locator('button[type="submit"]')).toBeFocused();
  });

  test("skip link is the first focusable element and targets main content", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to main content" }),
    ).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("dashboard sidebar links are keyboard focusable", async ({ page }) => {
    requireAuth();
    await signIn(page);

    const firstLink = page.locator("aside nav a").first();
    await expect(firstLink).toBeVisible();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
  });

  test("dialog Escape closes the API-key modal", async ({ page }) => {
    requireAuth();
    await signIn(page);

    // Navigate to outreach where the Gemini key gate lives.
    await page.goto("/dashboard/outreach", { waitUntil: "domcontentloaded" });
    const documentMailer = page.getByRole("button", { name: /Document Mailer/i });
    await documentMailer.click();

    // If a Gemini key is configured, the modal opens directly.
    const dialog = page.getByRole("dialog", { name: "Document Mailer" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
