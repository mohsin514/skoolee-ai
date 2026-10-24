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

/** A section with enrolled pupils and an empty sibling section; admission creates each pupil's first enrollment. */
async function sectionsWithPupils(name: string, count: number, enrolledOn = "2026-04-01") {
  const fromId = randomUUID(), toId = randomUUID();
  await db.class.create({ data: { id: fromId, schoolId, campusId, name, section: "A", academicYear: 2026 } });
  await db.class.create({ data: { id: toId, schoolId, campusId, name, section: "B", academicYear: 2026 } });
  const pupils: string[] = [];
  for (let i = 1; i <= count; i++) {
    const id = randomUUID(); pupils.push(id);
    await db.student.create({ data: { id, schoolId, campusId, classId: fromId, fullName: `Synthetic ${name} pupil ${i}`, rollNo: `${name}-${i}`, gender: "MALE", status: "active", enrollmentDate: new Date(enrolledOn) } });
  }
  return { fromId, toId, pupils };
}

test("an occupied section moves all its pupils or none, keeps their history, archives once and is safe to retry", async () => {
  const blocked = await sectionsWithPupils("Grade 4", 2, "2026-10-10");
  const refused = await api.post(`${base}/api/classes/transfer`, { data: { fromClassId: blocked.fromId, toClassId: blocked.toId, effectiveDate: "2026-10-01", action: "apply", archiveAfter: true } });
  assert.equal(refused.status(), 409, "pupils whose enrollment starts after the move date block the whole move");
  assert.equal(await db.student.count({ where: { classId: blocked.fromId } }), 2, "nobody was moved");
  const { fromId, toId, pupils } = await sectionsWithPupils("Grade 5", 3);
  const preview = await (await api.post(`${base}/api/classes/transfer`, { data: { fromClassId: fromId, toClassId: toId, effectiveDate: "2026-10-01" } })).json();
  assert.deepEqual([preview.preview.students, preview.preview.ready, preview.preview.blocked.length], [3, 3, 0]);
  assert.equal(await db.student.count({ where: { classId: toId } }), 0, "a preview changes nothing");
  const [first, second] = await Promise.all([0, 1].map(() => api.post(`${base}/api/classes/transfer`, { data: { fromClassId: fromId, toClassId: toId, effectiveDate: "2026-10-01", action: "apply", archiveAfter: true } })));
  const bodies = await Promise.all([first.json(), second.json()]);
  const moved = bodies.filter(body => body.success).reduce((sum, body) => sum + body.moved, 0);
  assert.equal(moved, 3, `two concurrent applies move each pupil once: ${JSON.stringify(bodies)}`);
  assert.equal(await db.student.count({ where: { classId: toId } }), 3);
  assert.ok((await db.class.findUniqueOrThrow({ where: { id: fromId } })).archivedAt, "the emptied section is archived");
  const history = await db.studentEnrollment.findMany({ where: { studentId: pupils[0] }, orderBy: { startDate: "asc" } });
  assert.deepEqual(history.map(row => [row.classId, row.status, row.endDate?.toISOString().slice(0, 10) ?? null]), [[fromId, "ENDED", "2026-10-01"], [toId, "ACTIVE", null]], "the old placement is closed, not rewritten");
  const retry = await (await api.post(`${base}/api/classes/transfer`, { data: { fromClassId: fromId, toClassId: toId, effectiveDate: "2026-10-01", action: "apply", archiveAfter: true } })).json();
  assert.deepEqual([retry.moved, retry.archived], [0, false], "a retry after success is a no-op");
  assert.equal((await api.post(`${base}/api/classes/transfer`, { data: { fromClassId: toId, toClassId: occupiedId, effectiveDate: "2026-10-01" } })).status(), 200);
  const otherYear = randomUUID();
  await db.class.create({ data: { id: otherYear, schoolId, campusId, name: "Grade 5", section: "C", academicYear: 2027 } });
  assert.equal((await api.post(`${base}/api/classes/transfer`, { data: { fromClassId: toId, toClassId: otherYear, effectiveDate: "2026-10-01" } })).status(), 409, "another year is a promotion, not a transfer");
});

test("the section settings drawer previews and performs the move, then archives (EN 1440)", async () => {
  const { fromId, toId } = await sectionsWithPupils("Grade 6", 2);
  const ctx = await context("admin"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=classes`);
  await page.getByText("Grade 6", { exact: true }).first().click();
  await page.getByRole("button", { name: /Manage/ }).first().click();
  await page.getByText("Section A", { exact: true }).first().waitFor();
  await page.locator('button[title="Section settings"]').first().click();
  const transfer = page.getByTestId("section-transfer");
  await transfer.waitFor();
  await transfer.getByLabel("Effective from").first().fill("2026-10-01");
  await transfer.getByRole("button", { name: "Preview move" }).click();
  await transfer.getByRole("status").filter({ hasText: "2 student(s) move to Grade 6 B" }).waitFor();
  await shot(page, "classes-transfer-preview-en-1440");
  await transfer.getByRole("button", { name: "Move 2 student(s) and archive" }).click();
  await page.getByText(/Moved 2 student\(s\) to Grade 6 B/).first().waitFor();
  assert.equal(await db.student.count({ where: { classId: toId } }), 2);
  assert.ok((await db.class.findUniqueOrThrow({ where: { id: fromId } })).archivedAt);
  assert.deepEqual(errors, []); await ctx.close();
});

test("a teacher change can take effect from an earlier date, and the history says so", async () => {
  const classId = randomUUID(), subjectId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 3", section: "Z", academicYear: 2026, teachingMode: "SUBJECT", classTeacherId: teacherA } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Geography", teacherId: teacherA } });
  await db.teachingAssignment.create({ data: { schoolId, campusId, classId, subjectId, role: "SUBJECT_TEACHER", teacherId: teacherA, effectiveFrom: new Date("2026-09-01"), createdById: people.get("admin")!.id } });
  const ctx = await context("admin"), page = await ctx.newPage(), bodies: unknown[] = [];
  page.on("request", request => { if (request.method() === "PATCH" && request.url().endsWith("/api/subjects")) bodies.push(request.postDataJSON()); });
  await page.goto(`${base}/admin?view=classes`);
  await page.getByText("Grade 3", { exact: true }).first().click();
  await page.getByRole("button", { name: /Manage/ }).first().click();
  const date = page.getByTestId("assignment-effective-date").first();
  await date.scrollIntoViewIfNeeded();
  await date.fill("2026-10-03");
  await shot(page, "classes-teacher-effective-date-en-1440");
  // The subject's own picker is the first "Change" control in the section (the homeroom one follows).
  await page.getByRole("button", { name: /Synthetic teacher-a.*Change/i }).first().click();
  await page.getByRole("button", { name: /Synthetic teacher-b/ }).first().click();
  await page.waitForResponse(response => response.request().method() === "PATCH" && response.url().endsWith("/api/subjects"));
  assert.deepEqual(bodies.map(body => (body as { effectiveFrom?: string }).effectiveFrom), ["2026-10-03"]);
  const history = await db.teachingAssignment.findMany({ where: { schoolId, subjectId }, orderBy: { effectiveFrom: "asc" } });
  assert.deepEqual(history.map(row => [row.teacherId, row.effectiveFrom.toISOString().slice(0, 10), row.effectiveTo?.toISOString().slice(0, 10) ?? null]), [[teacherA, "2026-09-01", "2026-10-03"], [teacherB, "2026-10-03", null]]);
  await ctx.close();
});

test("class screens fit 320, 390, 768 and 1440 in EN/AR/UR, including the dashboard and teacher routes", async () => {
  const urAdmin = await person("admin-ur", "CAMPUS_ADMIN", campusId, "ur");
  void urAdmin;
  const failures: string[] = [];
  for (const [key, language] of [["admin", "en"], ["admin-ar", "ar"], ["admin-ur", "ur"]] as const) {
    for (const viewport of [{ width: 320, height: 720 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      // /dashboard/classes is only a redirect to this view now (§6.1); measuring it again added nothing.
      for (const path of ["/admin?view=classes"]) {
        await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const state = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, dir: document.documentElement.getAttribute("dir") || document.body.getAttribute("dir"), text: document.body.innerText }));
        if (state.overflow > 1) failures.push(`${language} ${path} @${viewport.width}: ${state.overflow}px overflow`);
        if ((language === "en" ? "ltr" : "rtl") !== state.dir) failures.push(`${language} ${path} @${viewport.width}: dir=${state.dir}`);
        if (!state.text.includes("Grade 7")) failures.push(`${language} ${path} @${viewport.width}: class list missing`);
      }
      if (language === "ur" && viewport.width === 390) { await page.goto(`${base}/admin?view=classes`, { waitUntil: "networkidle" }); await shot(page, "classes-console-ur-390"); }
      if (errors.length) failures.push(`${language} @${viewport.width}: ${errors.join("; ")}`);
      await ctx.close();
    }
  }
  const teacherCtx = await context("teacher-a", { width: 390, height: 844 }), teacherPage = await teacherCtx.newPage();
  await teacherPage.goto(`${base}/teacher/classes`, { waitUntil: "networkidle" });
  const teacherState = await teacherPage.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, text: document.body.innerText }));
  if (teacherState.overflow > 1) failures.push(`/teacher/classes @390: ${teacherState.overflow}px overflow`);
  if (!/Grade 7/.test(teacherState.text)) failures.push("/teacher/classes: the teacher's own class is missing");
  await shot(teacherPage, "teacher-classes-en-390");
  await teacherCtx.close();
  assert.deepEqual(failures, []);
});

test("the class console works from the keyboard: open a class, its settings, and close back to where focus was", async () => {
  const ctx = await context("admin"), page = await ctx.newPage();
  await page.goto(`${base}/admin?view=classes`, { waitUntil: "networkidle" });
  // Start at the panel's first control ("Add Class") and Tab onward to the class row.
  await page.getByRole("button", { name: "Add Class" }).first().focus();
  let reached = "";
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => (document.activeElement?.textContent || "").trim());
    if (/Grade 7/.test(reached)) break;
  }
  assert.match(reached, /Grade 7/, "the class row is reachable by Tab");
  await page.keyboard.press("Enter");
  const manage = page.getByRole("button", { name: /Manage/ }).first();
  await manage.waitFor();
  await manage.focus();
  await page.keyboard.press("Enter");
  const settings = page.locator('button[title="Section settings"]').first();
  await settings.waitFor();
  await settings.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog", { name: /settings/i });
  await drawer.waitFor();
  await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"][aria-label$="settings"]'), undefined, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "detached" });
  assert.equal(await page.locator('button[title="Section settings"]').count() > 0, true, "one Escape closes only the drawer; the class manager stays open");
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("title")), "Section settings", "focus returns to the control that opened it");
  await ctx.close();
});
