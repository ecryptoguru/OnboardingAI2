import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await context.newPage();
  
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  
  console.log("Before submit cookies:", await context.cookies());
  
  await page.locator('input[name="email"]').fill("test@fretbox.ai");
  await page.locator('input[name="password"]').fill("TestPassword123!");
  await page.locator('button[type="submit"]').click();
  
  await page.waitForTimeout(3000);
  console.log("After failed sign-in URL:", page.url());
  console.log("After failed sign-in cookies:", await context.cookies());
  
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  console.log("After goto sign-up URL:", page.url());
  
  await browser.close();
})();
