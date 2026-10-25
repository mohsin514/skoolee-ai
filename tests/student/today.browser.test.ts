import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-418 on the isolated app with synthetic data: Today shows only the learner's released work with their
// own extension, keeps each source's state (opening is not completing), orders the next action
// deterministically, follows the school-local day and its closures, deep-links into the source workflow,
// hides other work during an exam in progress, and labels an offline copy with its refresh time.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.TODAY_TEST_APP || "http://localhost:3107";
const evidence = process.env.TODAY_EVIDENCE_DIR || "/tmp/sko418-evidence";
const db = new PrismaClient(), password = "SyntheticToday418!";
const schoolId = `today418-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { student: { v: 1, s: "done", at: new Date().toISOString() } }, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, options: { viewport?: { width: number; height: number }; timezoneId?: string } = {}) {
  const saved = sessions.get(key), viewport = options.viewport ?? { width: 1440, height: 1000 };
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce", timezoneId: options.timezoneId });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce", timezoneId: options.timezoneId });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" }); await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: false }); };
type Today = { weekend: number[]; day: string; today: string; schoolDay: boolean; closure: { kind: string; name: string | null } | null; lessons: { subject: string | null }[]; current: unknown; nextAction: { kind: string; title: string; href: string } | null; work: { id: string; title: string; state: string; overdue: boolean; extended: boolean }[]; examLock: boolean; returned: unknown[] };
const today = async (ctx: BrowserContext, day?: string) => { const r = await ctx.request.get(`${base}/api/student/today${day ? `?day=${day}` : ""}`); const json = await r.json(); if (r.status() === 200 && !json.data) throw new Error(JSON.stringify(json)); if (r.status() >= 500) throw new Error(`Today ${r.status()}: ${JSON.stringify(json)}`); return { status: r.status(), data: json.data as Today }; };
const days = (day: string, n: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

async function assignment(key: string, title: string, dueAt: Date, audience: string[], status = "RELEASED") {
  const id = randomUUID(); ids[key] = id;
  await db.assignment.create({ data: { id, schoolId, campusId, classId, title, instructions: `${title} — synthetic instructions.`, status, ownerId: users.get("teacher")!.id, currentVersion: status === "DRAFT" ? null : 1 } });
  if (status === "DRAFT") return id;
  await db.assignmentRubricVersion.create({ data: { schoolId, assignmentId: id, version: 1, criteria: [{ id: "clarity", title: "Clarity", description: "", maxPoints: 10 }], totalPoints: 10, createdById: users.get("teacher")!.id } });
  await db.assignmentVersion.create({ data: { schoolId, assignmentId: id, version: 1, title, instructions: "Synthetic.", rubricVersion: 1, audience, submissionMode: "ONLINE", allowedTypes: [], timezone: "Asia/Karachi", opensAt: hours(-72), dueAt, dueLocal: dueAt.toISOString().slice(0, 16), latePolicy: "ACCEPT_FLAGGED", resubmission: "AFTER_RETURN", resourceIds: [], releasedById: users.get("teacher")!.id } });
  return id;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Today School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Today North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026–27", academicYear: 2026, status: "ACTIVE" } });
  await user("teacher", "TEACHER"); const learner = await user("learner", "STUDENT"); const other = await user("other", "STUDENT"); await user("learner-ar", "STUDENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "B", academicYear: 2026, classTeacherId: users.get("teacher")!.id } });
  ids.pupil = randomUUID(); ids.otherPupil = randomUUID(); ids.arPupil = randomUUID();
  for (const [id, account, name, roll] of [[ids.pupil, learner, "Synthetic Pupil Hina", "601"], [ids.otherPupil, other, "Synthetic Pupil Bilal", "602"], [ids.arPupil, users.get("learner-ar")!.id, "Synthetic Pupil Sara", "603"]] as const)
    await db.student.create({ data: { id, schoolId, campusId, classId, studentUserId: account, fullName: name, rollNo: roll, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  const subject = (await db.subject.create({ data: { schoolId, campusId, classId, name: "Science", teacherId: users.get("teacher")!.id } })).id;
  // A published timetable whose version 1 has an all-day lesson on every weekday.
  const tt = await db.timetable.create({ data: { schoolId, campusId, classId, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  const slots = [1, 2, 3, 4, 5, 6, 7].flatMap(day => [{ id: randomUUID(), dayOfWeek: day, periodNumber: 1, startTime: "00:00", endTime: "23:59", slotType: "CLASS", subjectId: subject, subjectName: "Science", teacherId: users.get("teacher")!.id, teacherName: "Synthetic teacher", roomId: null, roomNumber: "L-2" }]);
  await db.timetableVersion.create({ data: { schoolId, campusId, timetableId: tt.id, version: 1, draftRevision: 1, effectiveFrom: new Date(Date.now() - 30 * 86_400_000), slots } });
  const everyone = [ids.pupil, ids.arPupil];
  await assignment("overdue", "Synthetic overdue essay", hours(-20), everyone);
  await assignment("draft", "Synthetic lab report", hours(72), everyone);
  await assignment("extended", "Synthetic poem with extension", hours(-30), everyone);
  await db.assignmentExtension.create({ data: { schoolId, assignmentId: ids.extended, studentId: ids.pupil, dueAt: hours(48), dueLocal: hours(53).toISOString().slice(0, 16), timezone: "Asia/Karachi", reason: "Approved synthetic extension", grantedById: users.get("teacher")!.id } });
  await assignment("notMine", "Synthetic work for Bilal only", hours(24), [ids.otherPupil]);
  await assignment("unreleased", "Synthetic unreleased quiz", hours(24), everyone, "DRAFT");
  await db.assignmentSubmission.create({ data: { schoolId, assignmentId: ids.draft, studentId: ids.pupil, status: "DRAFT", draftText: "Synthetic draft paragraph about plants.", draftSavedAt: hours(-1) } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("only my released work, with my extension, in source states; the next action follows the published order", async () => {
  const learner = await context("learner");
  const { status, data } = await today(learner);
  assert.equal(status, 200);
  const titles = data.work.map(item => item.title).sort();
  assert.deepEqual(titles, ["Synthetic lab report", "Synthetic overdue essay", "Synthetic poem with extension"], "no other pupil's work and nothing unreleased");
  assert.equal(data.work.find(item => item.id === ids.extended)!.overdue, false, "my extension moves my due date");
  assert.equal(data.work.find(item => item.id === ids.extended)!.extended, true);
  assert.equal(data.work.find(item => item.id === ids.overdue)!.overdue, true);
  assert.equal(data.work.find(item => item.id === ids.draft)!.state, "DRAFT");
  assert.deepEqual([data.nextAction!.kind, data.nextAction!.title], ["CONTINUE_DRAFT", "Synthetic lab report"], "a saved draft comes before overdue work");
  assert.match(data.nextAction!.href, new RegExp(`open=${ids.draft}&from=today`));
  // Opening the task is not completion: the state is unchanged after reading it.
  assert.equal((await learner.request.get(`${base}/api/assignments/${ids.draft}`)).status(), 200);
  assert.equal((await today(learner)).data.work.find(item => item.id === ids.draft)!.state, "DRAFT");
  // The source confirms submission; Today follows it and moves to the overdue essay.
  const submitted = await learner.request.post(`${base}/api/assignments/${ids.draft}`, { data: { op: "submit", idempotencyKey: `today-${randomUUID()}` } });
  assert.equal(submitted.status(), 200, await submitted.text());
  const after = (await today(learner)).data;
  assert.ok(!after.work.some(item => item.id === ids.draft), "submitted work leaves the open list");
  assert.deepEqual([after.nextAction!.kind, after.nextAction!.title], ["OVERDUE", "Synthetic overdue essay"]);
  // A withdrawn (closed) assignment disappears on the next refresh, with no stale duplicate.
  await db.assignment.update({ where: { id: ids.overdue }, data: { status: "CLOSED" } });
  const closed = (await today(learner)).data;
  assert.ok(!closed.work.some(item => item.id === ids.overdue));
  assert.deepEqual([closed.nextAction!.kind, closed.nextAction!.title], ["NEXT_DUE", "Synthetic poem with extension"]);
  assert.equal(new Set(closed.work.map(item => item.id)).size, closed.work.length);
  assert.equal((await today(await context("teacher"))).status, 403, "Today is the learner's own view");
});

test("the school-local day, closures and the day switch", async () => {
  const learner = await context("learner");
  const now = (await today(learner)).data;
  // Find a closed day (the campus weekend) and a school day within the coming week.
  let weekend = now.today, school = now.today;
  const closedDays = now.weekend.map(d => d || 7);
  for (let i = 0; i < 7; i++) { const d = days(now.today, i); if (closedDays.includes(weekday(d))) { weekend = d; break; } }
  for (let i = 0; i < 7; i++) { const d = days(now.today, i); if (!closedDays.includes(weekday(d))) { school = d; break; } }
  if (closedDays.length) {
    const closed = (await today(learner, weekend)).data;
    assert.equal(closed.schoolDay, false); assert.equal(closed.closure!.kind, "WEEKEND"); assert.equal(closed.lessons.length, 0);
    assert.ok(closed.work.length > 0, "a closed day still shows upcoming work");
  }
  const open = (await today(learner, school)).data;
  assert.equal(open.schoolDay, true); assert.deepEqual(open.lessons.map(l => l.subject), ["Science"]);
  await db.holiday.create({ data: { schoolId, campusId, name: "Synthetic Founders Day", fromDate: new Date(`${school}T00:00:00Z`), toDate: new Date(`${school}T00:00:00Z`) } });
  const holiday = (await today(learner, school)).data;
  assert.deepEqual(holiday.closure, { kind: "HOLIDAY", name: "Synthetic Founders Day" });
  assert.equal(holiday.schoolDay, false); assert.equal(holiday.lessons.length, 0);
  assert.ok(holiday.work.length > 0, "a closed day still shows upcoming work");
  assert.deepEqual((await today(learner, days(school, 1))).data.day, days(school, 1), "the day switch moves one school-local day");
  assert.equal((await today(learner, days(now.today, 60))).status, 400);
});

test("screens: Today in a far timezone, the deep link and an unavailable task, offline copy, Arabic phone", async () => {
  const ctx = await context("learner", { timezoneId: "America/Los_Angeles" });
  const page = await ctx.newPage();
  const serverDay = (await today(ctx)).data.today;
  await page.goto(`${base}/student`);
  const panel = page.locator("[data-student-today]");
  await panel.locator("[data-next-action]").waitFor({ timeout: 30_000 }).catch(async error => { await shot(page, "00-debug"); throw error; });
  assert.equal(await panel.getAttribute("data-day"), serverDay, "the day is the school's, not the device's");
  await shot(page, "01-today-en-la-timezone");
  await panel.locator("[data-next-action-link]").click();
  await page.locator("[data-back-today]").waitFor({ timeout: 30_000 });
  assert.match(await page.content(), /Synthetic poem with extension/);
  await shot(page, "02-deep-link-opened");
  await page.goto(`${base}/student/assignments?open=${randomUUID()}&from=today`);
  await page.locator("[data-task-unavailable]").waitFor({ timeout: 30_000 });
  await shot(page, "03-task-unavailable");
  // Offline: the last good view is shown with its refresh time and no claims.
  await page.goto(`${base}/student`);
  await panel.locator("[data-next-action]").waitFor({ timeout: 30_000 });
  await ctx.setOffline(true);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("[data-today-error]").waitFor({ timeout: 15_000 });
  assert.match(await page.locator("[data-today-error]").innerText(), /Showing the view from/);
  await shot(page, "04-offline-copy");
  await ctx.setOffline(false);
  await page.close();

  const ar = await (await context("learner-ar", { viewport: { width: 390, height: 844 } })).newPage();
  await ar.goto(`${base}/student`);
  await ar.locator("[data-student-today] [data-next-action]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-student-today]").scrollIntoViewIfNeeded();
  const workTitle = ar.locator("[data-work] a > span").first();
  const titleBox = await workTitle.boundingBox();
  assert.ok(titleBox && titleBox.width > 200, "mobile work titles have a full readable row");
  await shot(ar, "05-today-ar-390");
  await ar.close();
});

test("another learner's legacy offline copy is never loaded and authorization failures clear current work", async () => {
  const ctx = await context("other"); const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("skoolee.student.today", JSON.stringify({ nextAction: { title: "PRIVATE OTHER LEARNER", href: "/secret" }, work: [], returned: [] })));
  let status = 503;
  await page.route("**/api/student/today", route => route.fulfill({ status, json: { success: false, error: "Today could not be refreshed." } }));
  await page.goto(`${base}/student`);
  await page.locator("[data-today-error]").waitFor();
  assert.equal((await page.locator("body").innerText()).includes("PRIVATE OTHER LEARNER"), false);
  assert.equal(await page.evaluate(() => localStorage.getItem("skoolee.student.today")), null);
  await page.unroute("**/api/student/today");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.locator("[data-work]").first().waitFor();
  status = 403;
  await page.route("**/api/student/today", route => route.fulfill({ status, json: { success: false, error: "Access denied" } }));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("[data-today-error]").waitFor();
  assert.equal(await page.locator("[data-work]").count(), 0);
  assert.equal(await page.locator("[data-next-action-link]").count(), 0);
  await shot(page, "06-private-copy-denied-1440");
  await ctx.close();
});

test("an exam in progress is the only next action and hides other work", async () => {
  const learner = await context("learner");
  const teacher = users.get("teacher")!.id;
  const paper = await db.schoolAiRecord.create({ data: { schoolId, campusId, kind: "PAPER", title: "Synthetic science paper", status: "APPROVED", data: { classId, questions: [] }, createdById: teacher, updatedById: teacher, idempotencyKey: randomUUID(), requestHash: randomUUID() } });
  const exam = await db.schoolAiExamAssignment.create({ data: { schoolId, campusId, classId, paperId: paper.id, paperVersion: 1, paperSnapshot: {}, createdById: teacher, title: "Synthetic science quiz", startsAt: hours(-1), endsAt: hours(2), studentIds: [ids.pupil], status: "ACTIVE", mode: "STANDARD" } });
  await db.schoolAiExamAttempt.create({ data: { schoolId, campusId, assignmentId: exam.id, studentId: ids.pupil, userId: users.get("learner")!.id, deadlineAt: hours(1), responses: {}, status: "IN_PROGRESS" } });
  // The exam boundary answers for every other task while the attempt runs, Today included.
  const blocked = await learner.request.get(`${base}/api/student/today`);
  assert.equal(blocked.status(), 409);
  const body = await blocked.json();
  assert.equal(body.code, "EXAM_SESSION_ACTIVE"); assert.equal(body.examUrl, `/ai/exams/${exam.id}`);
  const page = await (await context("learner")).newPage();
  await page.goto(`${base}/student`);
  await page.waitForURL(/\/ai\/exams\/|\/student/, { timeout: 30_000 });
  if (page.url().includes("/student")) {
    await page.locator('[data-next-action="RESUME_EXAM"]').waitFor({ timeout: 30_000 });
    assert.equal(await page.locator("[data-next-action-link]").getAttribute("href"), `/ai/exams/${exam.id}`);
    assert.equal(await page.locator("[data-today-work]").count(), 0);
  }
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot(page, "06-exam-in-progress");
  await page.close();
});
