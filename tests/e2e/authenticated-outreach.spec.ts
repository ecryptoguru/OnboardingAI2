import { test, expect } from "@playwright/test";
import { requireAuth, signIn, gotoAuthenticated, collectErrors } from "./helpers/auth";

test.describe("Outreach (authenticated)", () => {
  test.beforeEach(() => requireAuth());

  test("outreach kanban and replies panel render without errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await gotoAuthenticated(page, "/dashboard/outreach");
    await expect(
      page.getByRole("heading", { level: 1, name: /Outreach Pipeline/i }),
    ).toBeVisible();

    // Document Mailer entry point exists.
    await expect(
      page.getByRole("button", { name: /Document Mailer/i }),
    ).toBeVisible();

    // Replies section renders (empty or populated).
    await expect(page.getByText(/Replies/i).first()).toBeVisible();

    errors.assertClean();
  });
});
