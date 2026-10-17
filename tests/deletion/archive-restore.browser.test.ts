import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-389 browser acceptance on the isolated app: the student modal offers Archive (never delete) with
// the server's real history counts; the archived list restores through a dialog that explains a reused
// roll number and takes a new current one, leaving earlier records with the original.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DELETION_TEST_APP || "http://localhost:3107";
const evidence = process.env.DELETION_EVIDENCE_DIR || "/tmp/sko389-evidence";
const db = new PrismaClient(), password = "SyntheticArchive389!";
const schoolId = `arc389-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const people = new Map<string, string>();
const pupilA = randomUUID(), pupilAr = randomUUID();
let browser: Browser;

async function person(key: string, language: string) {
  const email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id: randomUUID(), email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: "CAMPUS_ADMIN", schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, email);
}
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
async function context(key: string, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  // A signed-in session is reused: after MFA enrolment a fresh password login would need a challenge.
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))");
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const dialog = (page: Page) => page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
async function openStudent(page: Page, name: string) {
  await page.goto(`${base}/admin?view=students`);
  await page.getByText(name, { exact: true }).first().click({ timeout: 30_000 });
  await page.locator("[data-archive-student]").click();
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Hawthorn School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Dubai", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Hawthorn Main", regId: campusId, city: "Dubai" } });
  await person("admin", "en"); await person("admin-ar", "ar");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Six", section: "B", academicYear: 2026 } });
  for (const [id, name, roll] of [[pupilA, "Synthetic Amal Pupil", "R-07"], [pupilAr, "Synthetic Noor Pupil", "R-08"]]) await db.student.create({ data: { id, schoolId, campusId, classId, fullName: name, rollNo: roll, gender: "FEMALE", enrollmentDate: new Date("2026-04-01Z") } });
  const subject = await db.subject.create({ data: { schoolId, campusId, classId, name: "Mathematics" } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId, title: "Synthetic term test", term: "1", academicYear: 2026, status: "PUBLISHED" } });
  await db.mark.create({ data: { schoolId, campusId, studentId: pupilA, examId: exam.id, subjectId: subject.id, marksObtained: 74 } });
  await db.invoice.create({ data: { schoolId, campusId, studentId: pupilA, invoiceDate: new Date("2026-08-01Z"), dueDate: new Date("2026-08-30Z"), currency: "AED", invoiceNumber: `SYN-${randomUUID()}`, monthlyFee: 50000, subtotal: 50000, totalAmount: 50000, balanceDue: 50000 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the student modal archives with the server's history counts and keeps the history", async () => {
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openStudent(page, "Synthetic Amal Pupil");
  const confirm = dialog(page);
  await confirm.getByText("Archive Synthetic Amal Pupil?").waitFor();
  const text = await confirm.innerText();
  assert.match(text, /1 mark\(s\)/); assert.match(text, /1 invoice\(s\)/); assert.match(text, /can be restored later/);
  assert.doesNotMatch(text, /will be removed|permanently/i);
  await shot(page, "student-archive-en-1440");
  await confirm.getByRole("button", { name: "Archive Student" }).click();
  await page.waitForFunction(`!document.querySelector('[role="alertdialog"], [role="dialog"]')`, undefined, { timeout: 15_000 }).catch(() => undefined);
  const row = await db.student.findUniqueOrThrow({ where: { id: pupilA } });
  assert.ok(row.archivedAt);
  assert.deepEqual([await db.mark.count({ where: { studentId: pupilA } }), await db.invoice.count({ where: { studentId: pupilA } })], [1, 1]);
  assert.deepEqual(errors, []); await ctx.close();
});

test("restoring after the roll number was reused asks for a new current roll and keeps the old one on history", async () => {
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic Reuse Pupil", rollNo: "R-07", gender: "MALE", enrollmentDate: new Date("2026-09-01Z") } });
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=promote-archive`);
  await page.getByText("Synthetic Amal Pupil", { exact: true }).waitFor({ timeout: 30_000 });
  // Synthetic Amal Pupil is the only archived pupil in this school.
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  const confirm = dialog(page);
  await confirm.getByText("Restore Synthetic Amal Pupil?").waitFor();
  await confirm.getByRole("button", { name: "Restore student" }).click();
  await confirm.getByText("Restore needs a new current identifier. Past records will not change.").waitFor();
  assert.ok((await db.student.findUniqueOrThrow({ where: { id: pupilA } })).archivedAt, "nothing changed on conflict");
  const field = confirm.getByLabel(/New current roll number \(currently R-07/);
  await field.fill("R-07B");
  await shot(page, "student-restore-conflict-en-1440");
  await confirm.getByRole("button", { name: "Restore student" }).click();
  await page.getByText("Synthetic Amal Pupil restored with roll number R-07B. Past records keep R-07.").waitFor();
  const row = await db.student.findUniqueOrThrow({ where: { id: pupilA } });
  assert.deepEqual([row.archivedAt, row.rollNo], [null, "R-07B"]);
  const periods = await db.studentEnrollment.findMany({ where: { studentId: pupilA }, orderBy: { startDate: "asc" }, select: { rollNo: true, status: true } });
  assert.deepEqual(periods.map(period => [period.rollNo, period.status]), [["R-07", "ENDED"], ["R-07B", "ACTIVE"]]);
  assert.deepEqual(errors, []); await ctx.close();
});

test("the Arabic archive dialog reads right-to-left at phone width with translated counts", async () => {
  const ctx = await context("admin-ar", { width: 390, height: 844 }), page = await ctx.newPage();
  await openStudent(page, "Synthetic Noor Pupil");
  const confirm = dialog(page);
  await confirm.getByText("أرشفة Synthetic Noor Pupil؟").waitFor();
  assert.match(await confirm.innerText(), /لا توجد سجلات مرتبطة|تزيل الأرشفة/);
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  // A realtime notice from the earlier archive can still be on screen; let it leave before the evidence shot.
  await page.getByText("Student archived", { exact: true }).waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
  await shot(page, "student-archive-ar-390");
  await ctx.close();
});
