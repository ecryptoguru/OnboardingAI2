import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: "http://localhost:3001" });
  
  // Simulate the global setup flow
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("Sign-in page URL:", page.url());
  console.log("Sign-in has email:", !!(await page.$('input[name="email"]')));
  
  await page.locator('input[name="email"]').fill("test@fretbox.ai");
  await page.locator('input[name="password"]').fill("TestPassword123!");
  await page.locator('button[type="submit"]').click();
  
  await page.waitForTimeout(3000);
  console.log("After sign-in submit URL:", page.url());
  
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("Sign-up page URL:", page.url());
  console.log("Sign-up has email:", !!(await page.$('input[name="email"]')));
  console.log("Sign-up has password:", !!(await page.$('input[name="password"]')));
  
  await browser.close();
})();
