import { chromium } from "@playwright/test";
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: "http://localhost:3001" });
  await page.goto("/sign-in", { waitUntil: "networkidle" });
  console.log("URL:", page.url());
  const html = await page.content();
  console.log("Has email input:", html.includes('name="email"'));
  console.log("Has password input:", html.includes('name="password"'));
  await page.screenshot({ path: "playwright/.auth/debug-signin.png" });
  console.log("Screenshot saved");
  await browser.close();
})();
