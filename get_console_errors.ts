import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on("console", async msg => {
    if (msg.type() === "error") {
      console.log("BROWSER CONSOLE ERROR", { location: msg.location() });
    }
  });

  page.on("response", async res => {
    if (!res.ok() && res.status() === 400) {
      try {
        console.log("HTTP 400 ERROR", { url: new URL(res.url()).origin });
      } catch {
        console.log("Could not read response text");
      }
    }
  });

  console.log("Navigating to /dashboard/outreach...");
  await page.goto("http://localhost:3000/dashboard/outreach");
  await page.waitForTimeout(3000);
  console.log("PAGE LOADED", { url: page.url(), title: await page.title() });

  console.log("Navigating to /dashboard/proposals...");
  await page.goto("http://localhost:3000/dashboard/proposals");
  await page.waitForTimeout(3000);
  console.log("PAGE LOADED", { url: page.url(), title: await page.title() });

  await browser.close();
})();
