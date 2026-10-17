import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type APIRequestContext, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-462: class, section, subject and teaching-assignment administration through the real routes and console.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.CLASS_TEST_APP || "http://localhost:3107";
const evidence = process.env.CLASS_EVIDENCE_DIR || "/tmp/sko462-evidence";
const db = new PrismaClient(), password = "SyntheticClasses462!";
const schoolId = `cls462-${randomUUID()}`, campusId = randomUUID(), otherCampusId = randomUUID();
const people = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, api: APIRequestContext, occupiedId = "", examSubjectId = "", teacherA = "", teacherB = "", foreignTeacher = "";

async function person(key: string, role: string, campus = campusId, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, { id, email });
  return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const post = (body: unknown) => api.post(`${base}/api/classes`, { data: body });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Maple Grove School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Grove Main", regId: campusId, city: "Riyadh" } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, name: "Grove North", regId: otherCampusId, city: "Riyadh" } });
  await person("admin", "CAMPUS_ADMIN"); await person("admin-ar", "CAMPUS_ADMIN", campusId, "ar");
  teacherA = await person("teacher-a", "TEACHER"); teacherB = await person("teacher-b", "TEACHER");
  foreignTeacher = await person("teacher-north", "TEACHER", otherCampusId);
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  // An occupied section with marks and an exam, to exercise impact and refusals.
  occupiedId = randomUUID();
  await db.class.create({ data: { id: occupiedId, schoolId, campusId, name: "Grade 7", section: "Al-Noor", academicYear: 2026, classTeacherId: teacherA } });
  const studentId = randomUUID();
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId: occupiedId, fullName: "Synthetic pupil", rollNo: "1", gender: "FEMALE", status: "active" } });
  examSubjectId = randomUUID();
  await db.subject.create({ data: { id: examSubjectId, schoolId, campusId, classId: occupiedId, name: "Science", teacherId: teacherA } });
  await db.exam.create({ data: { schoolId, campusId, classId: occupiedId, subjectId: examSubjectId, title: "Science midterm", term: "TERM_1", academicYear: 2026 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
  api = (await context("admin")).request;
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("duplicate classes are refused, including case and spacing, with a link to the existing class", async () => {
  const created = await post({ name: "Grade 9", section: "A", academicYear: 2026, classTeacherId: teacherA, campusId });
  assert.equal(created.status(), 201);
  const createdId = (await created.json()).data.id;
  const again = await post({ name: "  grade 9 ", section: "a", academicYear: 2026, campusId });
  assert.equal(again.status(), 409);
  assert.ok(String((await again.json()).error).includes(createdId), "the refusal names the existing class");
  assert.equal(await db.class.count({ where: { schoolId, name: { equals: "Grade 9", mode: "insensitive" } } }), 1);
});

test("two concurrent creates of the same section produce exactly one class", async () => {
  const [a, b] = await Promise.all([post({ name: "Grade 10", section: "B", academicYear: 2026, campusId }), post({ name: "Grade 10", section: "B", academicYear: 2026, campusId })]);
  assert.deepEqual([a.status(), b.status()].sort(), [201, 409]);
  assert.equal(await db.class.count({ where: { schoolId, name: "Grade 10", section: "B" } }), 1);
});

test("a teacher from another campus is refused, and a teacher change keeps dated history", async () => {
  assert.equal((await post({ name: "Grade 11", section: "C", academicYear: 2026, classTeacherId: foreignTeacher, campusId })).status(), 400);
  const subject = await db.subject.create({ data: { schoolId, campusId, classId: occupiedId, name: "History", teacherId: teacherA } });
  const first = await api.patch(`${base}/api/subjects`, { data: { id: subject.id, teacherId: teacherB, effectiveFrom: "2026-09-01" } });
  assert.equal(first.status(), 200);
  const history = await db.teachingAssignment.findMany({ where: { schoolId, subjectId: subject.id }, orderBy: { effectiveFrom: "asc" } });
  assert.deepEqual(history.map(row => [row.teacherId, row.effectiveTo === null]), [[teacherB, true]]);
  const second = await api.patch(`${base}/api/subjects`, { data: { id: subject.id, teacherId: teacherA, effectiveFrom: "2026-10-01" } });
  assert.equal(second.status(), 200);
  const after = await db.teachingAssignment.findMany({ where: { schoolId, subjectId: subject.id }, orderBy: { effectiveFrom: "asc" } });
  assert.deepEqual(after.map(row => [row.teacherId, row.effectiveFrom.toISOString().slice(0, 10), row.effectiveTo?.toISOString().slice(0, 10) ?? null]), [[teacherB, "2026-09-01", "2026-10-01"], [teacherA, "2026-10-01", null]], "who taught it in September stays answerable");
  assert.equal((await api.patch(`${base}/api/subjects`, { data: { id: subject.id, name: "science" } })).status(), 409, "a rename onto an existing subject is refused");
  assert.equal((await api.patch(`${base}/api/subjects`, { data: { id: subject.id, totalMarks: "abc" } })).status(), 400);
});

test("removals show their impact and refuse what would strand records", async () => {
  const impact = await (await api.get(`${base}/api/academic/impact?kind=class&id=${occupiedId}`)).json();
  assert.equal(impact.impact.counts.students, 1);
  assert.ok(impact.impact.counts.exams >= 1);
  const subjectPreview = await (await api.delete(`${base}/api/subjects?id=${examSubjectId}&preview=true`)).json();
  assert.equal(subjectPreview.impact.counts.exams, 1);
  assert.equal((await api.delete(`${base}/api/subjects?id=${examSubjectId}`)).status(), 409, "a subject used by an exam is not deleted");
  assert.equal((await api.delete(`${base}/api/classes?id=${occupiedId}`, { data: { reason: "Test" } })).status(), 409, "a class with enrolled students is not archived");
  assert.equal((await db.class.findUniqueOrThrow({ where: { id: occupiedId } })).archivedAt, null);
  const empty = await post({ name: "Grade 12", section: "D", academicYear: 2026, campusId });
  const emptyId = (await empty.json()).data.id;
  assert.equal((await api.delete(`${base}/api/classes?id=${emptyId}`, { data: { reason: "Not needed" } })).status(), 200);
  assert.equal((await api.patch(`${base}/api/classes`, { data: { id: emptyId, name: "Grade 12 renamed" } })).status(), 409, "an archived class is restored before it is edited");
});

/** The delete control of the subject row named `name` (rows share one container type). */
async function deleteSubjectButton(page: Page, name: string) {
  const index = await page.locator('button[title="Delete subject"]').evaluateAll((buttons, target) => buttons.findIndex(button => {
    let node: HTMLElement | null = button as HTMLElement;
    for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) if (node.querySelectorAll('button[title="Delete subject"]').length === 1 && node.textContent?.includes(target as string)) return true;
    return false;
  }), name);
  assert.ok(index >= 0, `no delete control for ${name}`);
  return page.locator('button[title="Delete subject"]').nth(index);
}
async function openClasses(page: Page) {
  await page.goto(`${base}/admin?view=classes`);
  await page.getByText("Grade 7", { exact: true }).first().click();
  // "Manage" opens the class manager on this section, where its subjects and settings live.
  await page.getByRole("button", { name: /Manage|إدارة/ }).first().click();
  await page.locator('button[title="Delete subject"]').first().waitFor();
}

test("the console shows the real impact before deleting a subject or archiving an occupied class", async () => {
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openClasses(page);
  await (await deleteSubjectButton(page, "Science")).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "cannot be deleted" });
  await dialog.waitFor();
  await shot(page, "classes-subject-impact-en-1440");
  await page.keyboard.press("Escape");
  await page.locator('button[title="Section settings"]').first().click();
  await page.getByRole("button", { name: "Archive Class" }).click();
  await page.getByText(/Move its 1 enrolled student/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Archive Class", exact: true }).count(), 1, "only the drawer control remains; the dialog offers Close");
  await shot(page, "classes-archive-occupied-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic admin reads the impact dialog right-to-left without overflow at 390px", async () => {
  // Earlier archive notifications are read, so their arrival toast does not cover the dialog.
  await db.notification.updateMany({ where: { userId: people.get("admin-ar")!.id }, data: { isRead: true, readAt: new Date() } });
  const ctx = await context("admin-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openClasses(page);
  await (await deleteSubjectButton(page, "Science")).click();
  await page.getByText(/لذلك لا يمكن حذفه/).waitFor();
  assert.equal(await noOverflow(page), true);
  await shot(page, "classes-subject-impact-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
