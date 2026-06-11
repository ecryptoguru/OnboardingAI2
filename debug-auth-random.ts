import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await context.newPage();
  
  const randomEmail = `test${Date.now()}@fretbox.ai`;
  console.log("Trying sign-up with:", randomEmail);
  
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  
  await page.locator('input[name="email"]').fill(randomEmail);
  await page.locator('input[name="password"]').fill("TestPassword123!");
  await page.locator('button[type="submit"]').click();
  
  await page.waitForTimeout(8000);
  console.log("After sign-up URL:", page.url());
  
  const body = await page.locator("body").textContent();
  console.log("Has 'already exists':", body?.includes("already exists"));
  console.log("Has 'Create account':", body?.includes("Create account"));
  console.log("Has 'Dashboard':", body?.includes("Dashboard"));
  
  // Check console for errors
  const logs: string[] = [];
  page.on("console", msg => logs.push(msg.text()));
  await page.waitForTimeout(1000);
  console.log("Console logs:", logs.slice(0, 5));
  
  await browser.close();
})();
