import { test, expect } from "@playwright/test";
import { requireAuth, signIn, gotoAuthenticated, collectErrors } from "./helpers/auth";

test.describe("Proposals (authenticated)", () => {
  test.beforeEach(() => requireAuth());

  test("proposals page renders cards or empty state without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await gotoAuthenticated(page, "/dashboard/proposals");
    await expect(
      page.getByRole("heading", { level: 1, name: /Proposals/i }),
    ).toBeVisible();

    // Either a "Generate Proposal" control or an empty state must exist.
    await expect
      .poll(async () => {
        const hasButton =
          (await page.getByRole("button", { name: /Generate Proposal/i }).count()) > 0;
        const hasEmpty = (await page.getByText(/No proposals/i).count()) > 0;
        return hasButton || hasEmpty;
      })
      .toBe(true);

    errors.assertClean();
  });
});
