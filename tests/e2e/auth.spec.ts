import { test, expect } from "@playwright/test";

/**
 * Auth flow tests run without an authenticated session.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Auth Flows", () => {
  test("Sign-in page renders form elements", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60000 });

    await expect(page.locator("h1")).toContainText("Fretbox Outreach AI");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="flow"]')).toHaveValue("signIn");
    await expect(page.locator('button[type="submit"]')).toContainText("Sign in");
  });

  test("Sign-up page renders form elements", async ({ page }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded", timeout: 60000 });

    await expect(page.locator("h1")).toContainText("Create account");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="flow"]')).toHaveValue("signUp");
    await expect(page.locator('button[type="submit"]')).toContainText("Create account");
  });

  test("Sign-up page enforces password minimum length", async ({ page }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator('input[name="password"]')).toHaveAttribute("minLength", "8");
  });

  test("Auth pages have link to each other", async ({ page }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator('a[href="/sign-up"]')).toBeVisible();

    await page.goto("/sign-up", { waitUntil: "domcontentloaded", timeout: 60000 });
    await expect(page.locator('a[href="/sign-in"]')).toBeVisible();
  });

  test("Sign-in page is accessible and not a 500", async ({ page }) => {
    const response = await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });

  test("Sign-up page is accessible and not a 500", async ({ page }) => {
    const response = await page.goto("/sign-up", { waitUntil: "domcontentloaded", timeout: 60000 });
    expect(response?.status()).not.toBe(500);
    const body = await page.locator("body").textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);
  });
});
