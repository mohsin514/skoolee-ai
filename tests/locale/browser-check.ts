import { chromium } from "playwright";
import { SignJWT } from "jose";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
async function main() {
const base = "http://localhost:3201";
await mkdir("/tmp/sko201-evidence", { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
 for (const role of ["APP_OWNER", "SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT", "STUDENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"]) {
  const token = await new SignJWT({ userId: `locale-${role}`, schoolId: "locale-fixture", campusId: ["APP_OWNER", "SUPER_ADMIN"].includes(role) ? null : "locale-campus-a", role, schoolStatus: "ACTIVE", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const context = await browser.newContext(); await context.addCookies([{ name: "skoolee_token", value: token, url: base }]);
  const page = await context.newPage();
  await page.goto(`${base}/settings/locale`, { waitUntil: "networkidle", timeout: 120000 });
  for (const width of [1440, 768, 390]) {
   await page.setViewportSize({ width, height: 1000 });
   const panel = page.locator("section[aria-labelledby='locale-heading']"); await panel.waitFor();
   if (role === "APP_OWNER") { await panel.getByRole("alert").waitFor(); assert.match(await panel.getByRole("alert").innerText(), /permission|access/i); }
   else { await panel.locator("select").first().selectOption("ar"); await page.waitForFunction(() => document.querySelector("section[lang='ar']"));
     assert.equal(await panel.getAttribute("dir"), "rtl");
     assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${role} overflow at ${width}`);
     const permitted = ["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL"].includes(role); assert.equal(await page.getByRole("button", { name: "معاينة التغييرات", exact: true }).count(), permitted ? 1 : 0);
   }
   await page.screenshot({ path: `/tmp/sko201-evidence/${role}-${width}.png`, fullPage: true }); results.push(`${role}/${width}: pass`);
  }
  await context.close();
 }
 console.log(results.join("\n"));
} finally { await browser.close(); }

}
main().catch((error) => { console.error(error); process.exitCode = 1; });
