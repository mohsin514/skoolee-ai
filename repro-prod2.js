const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch();
  for (const url of ["/super/billing", "/super?view=billing"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.request.post("http://localhost:3001/api/auth/login", { data: { email: "admin@demo.com", password: "Admin@123" } });
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("http://localhost:3001" + url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(e => errs.push("nav:" + e.message.slice(0, 80)));
    await page.waitForTimeout(3500);
    console.log(`ALWAYS-BILLING ${url}: ${errs.length ? "ERRORS " + JSON.stringify(errs) : "clean"}`);
    await ctx.close();
  }
  await browser.close();
})();
