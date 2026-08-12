const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.request.post("http://localhost:3001/api/auth/login", { data: { email: "admin@demo.com", password: "Admin@123" } });
  await page.goto("http://localhost:3001/super/billing", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  console.log(text.slice(0, 3500));
  await browser.close();
})();
