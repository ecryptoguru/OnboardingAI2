import { test, expect } from "@playwright/test";
import { requireAuth, signIn, collectErrors } from "./helpers/auth";

test.describe("Universities Dashboard (authenticated)", () => {
  test.beforeEach(() => requireAuth());

  test("signs in and renders the university dashboard with stats and a table", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await signIn(page);

    await expect(
      page.getByRole("heading", { level: 1, name: /Universities/i }),
    ).toBeVisible();
    // Tab bar + stats render (tab labels include counts).
    await expect(page.getByRole("button", { name: /^All \d+$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Central \d+$/ })).toBeVisible();
    // Table header renders (list mode).
    await expect(page.getByRole("columnheader", { name: "University" })).toBeVisible();
    errors.assertClean();
  });

  test("search finds a university and the detail panel opens", async ({
    page,
  }) => {
    await signIn(page);

    const search = page.locator('input[placeholder="Search universities..."]');
    await expect(search).toBeVisible();
    await search.fill("Indian Institute");
    await expect(search).toHaveValue("Indian Institute");

    // Debounced search fires; a result row (role=button) must appear.
    const row = page.getByRole("button", {
      name: /Open details for .*Indian Institute of Technology/i,
    });
    await expect(row.first()).toBeVisible({ timeout: 25000 });
    await row.first().click();

    await expect(
      page.getByRole("button", { name: "Close details panel" }),
    ).toBeVisible();
  });

  test("tab filter switches the visible university set", async ({ page }) => {
    await signIn(page);

    const centralTab = page.getByRole("button", { name: "Central" });
    await expect(centralTab).toBeVisible();
    await centralTab.click();
    // After switching, the list re-renders from the paginated query.
    await expect(page.getByRole("columnheader", { name: "University" })).toBeVisible();
    await expect(searchOrRows(page)).toBeVisible({ timeout: 15000 });
  });

  test("keyboard can open a university row (Enter)", async ({ page }) => {
    await signIn(page);

    const search = page.locator('input[placeholder="Search universities..."]');
    await search.fill("Indian Institute");
    const row = page.getByRole("button", {
      name: /Open details for .*Indian Institute of Technology/i,
    });
    await expect(row.first()).toBeVisible({ timeout: 25000 });
    await row.first().focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Close details panel" }),
    ).toBeVisible();
  });
});

/** Any row in the university table (search or tab mode). */
function searchOrRows(page: import("@playwright/test").Page) {
  return page.getByRole("button", { name: /Open details for/i }).first();
}
