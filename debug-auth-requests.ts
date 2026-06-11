import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: "http://localhost:3001" });
  const page = await context.newPage();
  
  const failedRequests: { url: string; status: number }[] = [];
  page.on("response", response => {
    if (response.status() >= 400) {
      failedRequests.push({ url: response.url(), status: response.status() });
    }
  });
  
  const randomEmail = `test${Date.now()}@fretbox.ai`;
  console.log("Trying sign-up with:", randomEmail);
  
  await page.goto("/sign-up", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  
  await page.locator('input[name="email"]').fill(randomEmail);
  await page.locator('input[name="password"]').fill("TestPassword123!");
  await page.locator('button[type="submit"]').click();
  
  await page.waitForTimeout(10000);
  console.log("After sign-up URL:", page.url());
  console.log("Failed requests:", failedRequests);
  
  await browser.close();
})();
