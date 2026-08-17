const { chromium } = require("playwright");

const BASE = "http://localhost:3000";
const OUT = "/Users/angular_dev_15/Downloads/skoolee-ai-marketing/marketing-src/screens";

const shots = [
  { path: "/teacher", name: "teacher-dashboard" },
  { path: "/teacher/classes", name: "teacher-classes" },
  { path: "/teacher/attendance", name: "teacher-attendance" },
  { path: "/teacher/marks", name: "teacher-marks" },
  { path: "/teacher/tests", name: "teacher-tests" },
  { path: "/teacher/students", name: "teacher-students" },
  { path: "/teacher/reports", name: "teacher-reports" },
  { path: "/teacher/timetable", name: "teacher-timetable" },
  { path: "/teacher/calendar", name: "teacher-calendar" },
  { path: "/teacher/insights", name: "teacher-insights" },
  { path: "/teacher/leave", name: "teacher-leave" },
  { path: "/teacher/ai", name: "teacher-ai" },
];

async function waitForAppReady(page) {
  for (let i = 0; i < 30; i++) {
    const splash = await page.locator("text=Processing...").count().catch(() => 0);
    if (splash === 0) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(2500);
}

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForSelector('input[type="email"], input[name="email"], input#email', { timeout: 20000 });
  const inputs = await page.locator("input").all();
  let emailInput = null, passInput = null;
  for (const inp of inputs) {
    const type = await inp.getAttribute("type");
    const name = (await inp.getAttribute("name")) || "";
    if (type === "email" || name.includes("email") || (await inp.getAttribute("id")) === "email") emailInput = emailInput || inp;
    if (type === "password" || name.includes("password")) passInput = passInput || inp;
  }
  if (!emailInput || !passInput) throw new Error("login inputs not found");
  await emailInput.fill(email);
  await passInput.fill(password);
  const submit = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').last();
  await submit.click();
  await page.waitForFunction(() => window.location.pathname !== "/login", null, { timeout: 25000 });
  await waitForAppReady(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await login(page, "teacher@demo.com", "Admin@123");
    console.log("LOGGED IN ->", page.url());
    for (const shot of shots) {
      await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
      await waitForAppReady(page);
      const splash = await page.locator("text=Processing...").count().catch(() => 0);
      console.log("capturing", shot.name, splash ? "[SPLASH STILL VISIBLE]" : "");
      await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: false, timeout: 60000 });
      console.log("  captured", shot.name);
    }
  } catch (e) {
    console.log("FAILED", e.message);
  }
  await context.close();
  await browser.close();
  console.log("done");
}

main();