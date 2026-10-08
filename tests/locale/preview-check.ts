import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
async function main() {
 if (!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201")) throw new Error("Local fixture DB required");
 const db = new PrismaClient(); const browser = await chromium.launch();
 try {
  await db.localePolicy.deleteMany({ where: { schoolId: "locale-fixture" } });
  const token = await new SignJWT({ userId: "locale-SUPER_ADMIN", schoolId: "locale-fixture", campusId: null, role: "SUPER_ADMIN", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await context.addCookies([{ name: "skoolee_token", value: token, url: "http://localhost:3201" }]);
  const page = await context.newPage(); await page.goto("http://localhost:3201/settings/locale", { waitUntil: "networkidle" });
  await page.locator("#locale-language").selectOption("ar"); await page.locator("#locale-numberingSystem").selectOption("arab"); await page.locator("#locale-timezone").fill("Asia/Riyadh"); await page.locator("#locale-currency").fill("KWD");
  await page.getByRole("button", { name: "معاينة التغييرات", exact: true }).click();
  const sample = page.locator("#locale-print-sample"); await sample.waitFor(); assert.match(await sample.innerText(), /DEMO-014/); assert.match(await sample.innerText(), /٢٠٢٧/);
  await page.screenshot({ path: "/tmp/sko201-evidence/arabic-preview.png", fullPage: true }); await page.pdf({ path: "/tmp/sko201-evidence/arabic-preview.pdf", format: "A4", printBackground: true });
  await page.getByRole("button", { name: "تطبيق الإعدادات المراجعة", exact: true }).click(); await page.getByText("تغيير العملة بانتظار مراجعة مالية مستقلة.").waitFor();
  const pending = await db.localePolicy.findMany({ where: { schoolId: "locale-fixture" } }); assert.equal(pending.length, 1); assert.equal(pending[0].status, "FINANCE_REVIEW"); assert.equal((await db.school.findUniqueOrThrow({ where: { id: "locale-fixture" } })).timezone, "Asia/Karachi");
  console.log("Arabic preview -> print PDF -> signed apply -> pending independent finance review: pass");
 } finally { await db.localePolicy.deleteMany({ where: { schoolId: "locale-fixture" } }); await browser.close(); await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
