import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on("console", async msg => {
    if (msg.type() === "error") {
      const args = await Promise.all(msg.args().map(a => a.jsonValue().catch(() => a.toString())));
      console.log("BROWSER CONSOLE ERROR:", ...args);
    }
  });

  page.on("response", async res => {
    if (!res.ok() && res.status() === 400) {
      try {
        const text = await res.text();
        console.log("HTTP 400 ERROR on", res.url(), "Response:", text);
      } catch (e) {
        console.log("Could not read response text");
      }
    }
  });

  console.log("Navigating to /dashboard/outreach...");
  await page.goto("http://localhost:3000/dashboard/outreach");
  await page.waitForTimeout(3000);
  console.log("PAGE TEXT:", await page.innerText("body"));

  console.log("Navigating to /dashboard/proposals...");
  await page.goto("http://localhost:3000/dashboard/proposals");
  await page.waitForTimeout(3000);
  console.log("PAGE TEXT:", await page.innerText("body"));

  await browser.close();
})();
