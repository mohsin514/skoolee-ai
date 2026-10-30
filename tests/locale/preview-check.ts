import { chromium } from "playwright";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
async function main() {
 if (!process.env.DATABASE_URL?.includes("127.0.0.1:55401/sko201")) throw new Error("Local fixture DB required");
 const db = new PrismaClient(); const browser = await chromium.launch();
 try {
  await db.localePolicy.deleteMany({ where: { schoolId: "locale-fixture" } });
  const cls = await db.class.create({ data: { id: "locale-preview-class", schoolId: "locale-fixture", campusId: "locale-campus-a", name: "Preview", academicYear: 2027 } });
  const subject = await db.subject.create({ data: { schoolId: "locale-fixture", campusId: "locale-campus-a", classId: cls.id, name: "Math", totalMarks: 100 } });
  const exam = await db.exam.create({ data: { schoolId: "locale-fixture", campusId: "locale-campus-a", classId: cls.id, title: "Real future paper", term: "Term-1", academicYear: 2027 } });
  const period = await db.periodDefinition.create({ data: { id: "locale-preview-period", schoolId: "locale-fixture", campusId: "locale-campus-a", timeType: "EXAM", periodNumber: 91, startTime: "09:00", endTime: "10:00" } });
  const scheduled = await db.examSchedule.create({ data: { schoolId: "locale-fixture", campusId: "locale-campus-a", examId: exam.id, subjectId: subject.id, periodDefinitionId: period.id, date: new Date("2027-04-01T00:00:00Z") } });
  const token = await new SignJWT({ userId: "locale-SUPER_ADMIN", schoolId: "locale-fixture", campusId: null, role: "SUPER_ADMIN", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await context.addCookies([{ name: "skoolee_token", value: token, url: "http://localhost:3201" }]);
  const page = await context.newPage(); await page.goto("http://localhost:3201/settings/locale", { waitUntil: "networkidle" });
  await page.locator("section select").first().selectOption("ar");
  await page.waitForFunction(() => !!document.querySelector("section[lang=ar]"));
  await page.locator("#locale-language").selectOption("ar"); await page.locator("#locale-numberingSystem").selectOption("arab"); await page.locator("#locale-timezone").fill("Asia/Riyadh"); await page.locator("#locale-country").selectOption("KW");
  await page.getByRole("button", { name: "معاينة التغييرات", exact: true }).click();
  const sample = page.locator("#locale-print-sample"); await sample.waitFor(); assert.match(await sample.innerText(), /DEMO-014/); assert.match(await sample.innerText(), /Real future paper/); assert.match(await sample.innerText(), /2027-04-01T04:00:00.000Z/); assert.match(await sample.innerText(), /2027-04-01T06:00:00.000Z/); assert.match(await sample.innerText(), /٢٠٢٧/);
  await page.screenshot({ path: "/tmp/sko201-evidence/arabic-preview.png", fullPage: true }); await page.pdf({ path: "/tmp/sko201-evidence/arabic-preview.pdf", format: "A4", printBackground: true });
  await page.getByRole("button", { name: "تطبيق الإعدادات المراجعة", exact: true }).click(); await page.getByText("تغيير العملة بانتظار مراجعة مالية مستقلة.").waitFor();
  const pending = await db.localePolicy.findMany({ where: { schoolId: "locale-fixture" } }); assert.equal(pending.length, 1); assert.equal(pending[0].status, "FINANCE_REVIEW"); assert.equal((await db.school.findUniqueOrThrow({ where: { id: "locale-fixture" } })).timezone, "Asia/Karachi");
  const financeToken = await new SignJWT({ userId: "locale-ACCOUNTANT", schoolId: "locale-fixture", campusId: "locale-campus-a", role: "ACCOUNTANT", onboardingComplete: true }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode("local-sko201-fixture"));
  const financeContext = await browser.newContext(); await financeContext.addCookies([{ name: "skoolee_token", value: financeToken, url: "http://localhost:3201" }]);
  const financePage = await financeContext.newPage(); await financePage.goto("http://localhost:3201/settings/locale", { waitUntil: "networkidle" });
  await financePage.locator("section select").first().selectOption("ar");
  await financePage.waitForFunction(() => !!document.querySelector("section[lang=ar]"));
  await financePage.getByRole("button", { name: "اعتماد العملة", exact: true }).click(); await financePage.getByText("مجدول / نشط", { exact: true }).waitFor();
  assert.equal((await db.localePolicy.findUniqueOrThrow({ where: { id: pending[0].id } })).financeReviewedBy, "locale-ACCOUNTANT");
  assert.equal((await db.examSchedule.findUniqueOrThrow({where:{id:scheduled.id}})).date.toISOString(), "2027-04-01T00:00:00.000Z");
  console.log("Actual future exam + Arabic preview -> print PDF -> signed apply -> independent accountant approval: pass");
 } finally { await db.class.deleteMany({ where: { id: "locale-preview-class" } }); await db.periodDefinition.deleteMany({where:{id:"locale-preview-period"}}); await db.localePolicy.deleteMany({ where: { schoolId: "locale-fixture" } }); await browser.close(); await db.$disconnect(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
