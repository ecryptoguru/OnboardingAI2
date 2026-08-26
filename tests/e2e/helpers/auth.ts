import { test, expect, type Page } from "@playwright/test";

/**
 * Authenticated E2E helpers.
 *
 * Credentials come from environment variables (never committed):
 *   E2E_EMAIL       — operator account email on the target Convex deployment
 *   E2E_PASSWORD    — operator account password
 *   E2E_RECIPIENT   — approved test inbox for controlled sends
 *   E2E_SEND_ALLOWED — set "1" to enable the single controlled send journey
 *
 * Tests skip (not fail) when credentials are absent so the suite remains
 * runnable for unauthenticated smoke tests, but the release gate requires
 * them to be present and the suite to actually execute.
 */

export const E2E_EMAIL = process.env.E2E_EMAIL;
export const E2E_PASSWORD = process.env.E2E_PASSWORD;
export const E2E_RECIPIENT =
  process.env.E2E_RECIPIENT || "ankit@fusionwaveai.com";
export const E2E_SEND_ALLOWED = process.env.E2E_SEND_ALLOWED === "1";

/** Call at the top of any test that requires an authenticated session. */
export function requireAuth() {
  test.skip(
    !E2E_EMAIL || !E2E_PASSWORD,
    "E2E_EMAIL/E2E_PASSWORD not set — skipping authenticated test",
  );
}

const ALLOWED_FAILURE_PATTERNS = [
  // Navigation aborts in-flight Convex requests; the retry/refresh loop
  // recovers on its own.
  /net::ERR_ABORTED/,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/,
];

/**
 * Sign in through the UI and wait until the dashboard shell is visible AND
 * the auth state has stabilized (Convex re-authentication can briefly bounce
 * the guard on cold connections; we wait out that window).
 */
export async function signIn(page: Page) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(E2E_EMAIL!);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD!);
  await page.locator('button[type="submit"]').click();

  // Wait for the dashboard shell, then confirm it stays put for a beat.
  await expect
    .poll(
      async () => {
        if (!page.url().includes("/dashboard")) return false;
        const sidebarVisible = await page
          .locator("aside nav a")
          .first()
          .isVisible()
          .catch(() => false);
        return sidebarVisible;
      },
      { timeout: 45000 },
    )
    .toBe(true);
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("aside nav a").first()).toBeVisible();
}

/**
 * Navigate to an authenticated route, recovering from the known cold-start
 * auth bounce (guard briefly redirects to /sign-in while the token refresh
 * completes).
 */
export async function gotoAuthenticated(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    if (page.url().includes("/sign-in")) {
      await signIn(page);
      continue;
    }
    return;
  }
  throw new Error(`Could not reach ${path} after auth recovery attempts`);
}

export interface ErrorCollector {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  /** Assert zero unexpected errors (allowlist + selector filters). */
  assertClean: () => void;
}

/**
 * Collect console errors, page errors, and failed requests for the lifetime
 * of the page. A small allowlist filters known-benign noise (navigation
 * aborts, favicon 404s); anything else fails the test via assertClean().
 */
export function collectErrors(
  page: Page,
  options: { urlFilter?: (url: string) => boolean } = {},
): ErrorCollector {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  const isAllowed = (text: string) =>
    ALLOWED_FAILURE_PATTERNS.some((re) => re.test(text));

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (isAllowed(text)) return;
    consoleErrors.push(text);
  });

  page.on("pageerror", (err) => {
    if (isAllowed(err.message)) return;
    pageErrors.push(err.message);
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (options.urlFilter && !options.urlFilter(url)) return;
    const detail = `${req.method()} ${url} — ${req.failure()?.errorText ?? "unknown"}`;
    if (isAllowed(detail)) return;
    failedRequests.push(detail);
  });

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    assertClean: () => {
      expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
      expect(
        consoleErrors,
        `console errors: ${consoleErrors.join(" | ")}`,
      ).toEqual([]);
      expect(
        failedRequests,
        `failed requests: ${failedRequests.join(" | ")}`,
      ).toEqual([]);
    },
  };
}

/** Sign out through the sidebar and confirm the redirect. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 15000 });
}
