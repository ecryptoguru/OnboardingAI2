import { test, expect } from "@playwright/test";
import { requireAuth, signIn, gotoAuthenticated, collectErrors } from "./helpers/auth";

test.describe("Analytics (authenticated)", () => {
  test.beforeEach(() => requireAuth());

  test("analytics page renders funnel and email stats without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await gotoAuthenticated(page, "/dashboard/analytics");
    await expect(
      page.getByRole("heading", { level: 1, name: /Analytics/i }),
    ).toBeVisible();

    // Funnel stages render (labels from the analytics UI).
    await expect(page.getByText("Total Universities", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Enriched", { exact: false }).first()).toBeVisible();

    errors.assertClean();
  });
});
