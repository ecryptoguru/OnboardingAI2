import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await context.newPage();
  
  // Step 1: Try sign-up
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("Step 1 - Sign-up URL:", page.url());
  
  const hasEmail = await page.$('input[name="email"]');
  if (hasEmail) {
    await page.locator('input[name="email"]').fill("test@fretbox.ai");
    await page.locator('input[name="password"]').fill("TestPassword123!");
    await page.locator('button[type="submit"]').click();
    
    await page.waitForTimeout(5000);
    console.log("Step 2 - After sign-up submit URL:", page.url());
    const body = await page.locator("body").textContent();
    console.log("Body contains 'already exists':", body?.includes("already exists"));
    console.log("Body contains 'Invalid':", body?.includes("Invalid"));
    console.log("Body first 200 chars:", body?.substring(0, 200));
  } else {
    console.log("No email input on sign-up page");
    console.log("Page body first 200:", (await page.locator("body").textContent())?.substring(0, 200));
  }
  
  await browser.close();
})();
