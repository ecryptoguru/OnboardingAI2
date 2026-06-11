import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await context.newPage();
  
  // Step 1: Sign-up
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  console.log("After goto /sign-up URL:", page.url());
  
  const hasEmail = await page.$('input[name="email"]');
  console.log("Has email input:", !!hasEmail);
  
  if (hasEmail) {
    await page.locator('input[name="email"]').fill("test@fretbox.ai");
    await page.locator('input[name="password"]').fill("TestPassword123!");
    await page.locator('button[type="submit"]').click();
    
    await page.waitForTimeout(5000);
    console.log("After sign-up submit URL:", page.url());
    const body = await page.locator("body").textContent();
    console.log("Body has 'already exists':", body?.includes("already exists"));
    console.log("Body has 'Could not create':", body?.includes("Could not create"));
    console.log("Body has 'Fretbox Outreach AI':", body?.includes("Fretbox Outreach AI"));
    console.log("Body has 'Create account':", body?.includes("Create account"));
    console.log("Body first 300 chars:", body?.substring(0, 300));
    
    // If still on sign-up, check if there's an error
    if (page.url().includes("/sign-up")) {
      const errorEl = await page.$("p.text-red-400");
      if (errorEl) {
        console.log("Error text:", await errorEl.textContent());
      }
    }
  }
  
  await browser.close();
})();
