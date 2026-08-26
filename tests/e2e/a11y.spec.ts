import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requireAuth, signIn } from "./helpers/auth";

/**
 * Targeted axe scans. Only serious/critical violations fail the suite.
 */
async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blockers = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    blockers.map((v) => `${v.id} (${v.impact}): ${v.help}`),
    `axe violations on ${page.url()}`,
  ).toEqual([]);
}

test.describe("Accessibility (axe)", () => {
  test("landing page has no serious/critical violations", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectNoSeriousViolations(page);
  });

  test("sign-in page has no serious/critical violations", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expectNoSeriousViolations(page);
  });

  test("sign-up page has no serious/critical violations", async ({ page }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
    await expectNoSeriousViolations(page);
  });

  test("dashboard has no serious/critical violations", async ({ page }) => {
    requireAuth();
    await signIn(page);
    await expectNoSeriousViolations(page);
  });

  test("approvals has no serious/critical violations", async ({ page }) => {
    requireAuth();
    await signIn(page);
    await page.goto("/dashboard/approvals", { waitUntil: "domcontentloaded" });
    await expectNoSeriousViolations(page);
  });

  test("proposals has no serious/critical violations", async ({ page }) => {
    requireAuth();
    await signIn(page);
    await page.goto("/dashboard/proposals", { waitUntil: "domcontentloaded" });
    await expectNoSeriousViolations(page);
  });
});
