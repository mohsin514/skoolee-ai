import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-434 on the isolated app (role-ux G26: the accountant prepares and exports; the campus admin approves):
// the accountant prepares a run, fixes a missing provider id from the
// exception list, another leader approves, the accountant exports (twice: one reference), records
// one rejected row and opens a correction for it alone; a teacher sees no salaries. EN and AR.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.PAYROLL_TEST_APP || "http://localhost:3108";
const evidence = process.env.PAYROLL_EVIDENCE_DIR || "/tmp/sko434-evidence";
const db = new PrismaClient(), password = "SyntheticPayroll434!";
const schoolId = `pr434-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function user(key: string, role: string, language = "en", salary = 0) {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language, joiningDate: new Date("2026-01-01T00:00:00Z") } });
  if (salary) await db.staffProfile.create({ data: { schoolId, userId: id, basicSalary: salary } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Riyadh" } });
  await user("accountant", "ACCOUNTANT"); await user("accountant-ar", "ACCOUNTANT", "ar"); await user("admin", "CAMPUS_ADMIN");
  await user("teacher-a", "TEACHER", "en", 900_000); await user("teacher-b", "TEACHER", "en", 750_000);
  await db.payrollPolicy.create({ data: { schoolId, campusId, entityName: "Synthetic Cedar School", version: 2, currency: "SAR", effectiveFrom: new Date("2027-01-01T00:00:00Z"), packageLabel: "KSA-demo v2", scopeNote: "Demonstration rules; requires local validation.", prorationBasis: "FIXED_30", leaveDivisor: "FIXED_30", leaveYearStartMonth: 9, rounding: "HALF_UP", createdById: users.get("admin")!.id } });
  await db.payrollProvider.create({ data: { schoolId, campusId, code: "DEMOPAY", name: "Synthetic provider", version: 1, currencies: ["SAR"], columns: [{ header: "EmpID", field: "providerEmployeeId" }, { header: "Net", field: "net" }, { header: "Ref", field: "reference" }], createdById: users.get("admin")!.id } });
  await db.payrollEmployee.create({ data: { schoolId, campusId, userId: users.get("teacher-a")!.id, providerIds: { DEMOPAY: "E-201" }, updatedById: users.get("admin")!.id } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.payrollSubmission, db.payrollCalculation, db.payrollAdjustment, db.payrollEmployee, db.payrollProvider, db.payrollPolicy]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("prepare, fix an exception, approve by another leader, export once, correct the rejected row (EN desktop)", async () => {
  const teacher = await context("teacher-a");
  assert.equal((await teacher.request.get(`${base}/api/payroll/runs?year=2027&month=3`)).status(), 403, "no salary preview without payroll access");
  const page = await (await context("accountant")).newPage();
  await page.goto(`${base}/accountant?view=payroll`);
  const panel = page.locator("section[data-payroll-runs]");
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByLabel("Month", { exact: true }).fill("3"); await panel.getByLabel("Year", { exact: true }).fill("2027");
  await panel.getByText(/KSA-demo v2 \(version 2\)/u).waitFor({ timeout: 30_000 });
  // role-ux §4.4: "Prepare run" is the Payroll view's PageHeader primary; approval belongs to the campus admin (G26).
  await page.getByRole("button", { name: "Prepare run" }).click();
  await panel.getByText("2 employees · 1 items need review").waitFor({ timeout: 30_000 });
  assert.equal(await panel.getByRole("button", { name: "Approve run" }).count(), 0, "the finance desk is never offered approval");
  await panel.getByText("Waiting for your campus admin to approve this run.").waitFor();
  await panel.getByLabel("Provider employee id", { exact: true }).fill("E-202");
  await panel.getByRole("button", { name: "Save id" }).click();
  await panel.getByText("Provider employee id saved. Prepare a new version to include it.").waitFor();
  await page.getByRole("button", { name: "Prepare run" }).click();
  await panel.getByText("2 employees · 0 items need review").waitFor({ timeout: 30_000 });
  const run = await db.payrollCalculation.findFirstOrThrow({ where: { campusId, status: "DRAFT" } });
  const admin = await context("admin");
  assert.equal((await admin.request.post(`${base}/api/payroll/runs`, { headers: { Origin: base }, data: { action: "approve", id: run.id, reason: "Checked against attendance, leave and salary records." } })).status(), 200);
  await page.reload();
  await panel.getByLabel("Month", { exact: true }).fill("3"); await panel.getByLabel("Year", { exact: true }).fill("2027");
  await panel.getByRole("button", { name: "Export to provider" }).click({ timeout: 30_000 });
  await panel.getByText("Approved run exported; provider confirmation is pending.").waitFor({ timeout: 30_000 });
  await panel.getByText("Exported does not mean paid.").first().waitFor();
  await panel.getByRole("button", { name: "Retry export" }).click();
  await panel.getByText(/Retried with the same reference/u).waitFor({ timeout: 30_000 });
  assert.equal(await db.payrollSubmission.count({ where: { campusId } }), 1, "one submission, one reference");
  await panel.getByLabel("Outcome").first().selectOption("ACCEPTED");
  await panel.getByLabel("Outcome").nth(1).selectOption("REJECTED");
  await panel.getByLabel("Provider's reason").fill("Unknown IBAN");
  await panel.getByRole("button", { name: "Save provider result" }).click();
  await panel.getByText("Provider rejected 1 row(s). Accepted rows will not be resubmitted.").waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Create correction version" }).click();
  await panel.getByText("Correction version created. It needs approval again.").waitFor({ timeout: 30_000 });
  const correction = await db.payrollCalculation.findFirstOrThrow({ where: { campusId, correctionOfId: run.id } });
  assert.equal(correction.scopeUserIds.length, 1);
  await panel.getByText("Unknown IBAN").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await panel.screenshot({ path: `${evidence}/payroll-en-1440.png` });
  await page.close();
});

test("the payroll run reads right to left on a phone (AR)", async () => {
  const page = await (await context("accountant-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/accountant?view=payroll`);
  const panel = page.locator("section[data-payroll-runs]");
  await panel.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await panel.getByLabel("الشهر", { exact: true }).fill("3"); await panel.getByLabel("السنة", { exact: true }).fill("2027");
  await panel.getByText("قائمة التصحيح").waitFor({ timeout: 30_000 });
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/payroll-ar-390.png` });
  await page.close();
});
