import { test, expect } from "@playwright/test";
import { requireAuth, signIn, gotoAuthenticated, collectErrors } from "./helpers/auth";

/**
 * Settings verification is READ-ONLY: this spec asserts the page renders and
 * exposes its sections exactly as before. It never writes, tests, or removes
 * any credential, and it must not fail when provider keys are absent.
 */
test.describe("Settings Page (authenticated, read-only)", () => {
  test.beforeEach(() => requireAuth());

  test("settings page renders all provider sections without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await gotoAuthenticated(page, "/dashboard/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: /Settings/i }),
    ).toBeVisible();

    // Provider sections are present (headings from the settings UI).
    for (const name of [
      "Google Gemini API Configuration",
      "Serper API Configuration",
      "Firecrawl API Configuration",
      "ZeptoMail Email API",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }

    errors.assertClean();
  });
});
