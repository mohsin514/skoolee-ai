import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-399 on the isolated app: workload names its week and definition and keeps unknown capacity
// unknown; cover lists only lessons whose teacher is on approved leave with no cover, and every candidate
// shows why they qualify or conflict (lesson, leave, invigilation, capacity); a proposal is rechecked and
// handed to the reviewed substitution workflow without touching the timetable; reporting loops are
// refused even when two changes race; an acting appointment does not change role or permissions.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.STAFF_TEST_APP || "http://localhost:3108";
const evidence = process.env.STAFF_EVIDENCE_DIR || "/tmp/sko399-evidence";
const db = new PrismaClient(), password = "SyntheticStaff399!";
const schoolId = `staff399-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, lessonSlot = "";
// Next Monday, so the lesson is in the future and on timetable day 1.
const now = new Date(); const daysToMonday = ((8 - now.getUTCDay()) % 7) || 7;
const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday)).toISOString().slice(0, 10);

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const id = (key: string) => users.get(key)!.id;
const board = async () => (await (await (await context("admin")).request.get(`${base}/api/staff/cover?campusId=${campusId}&date=${monday}`)).json()).data;
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Birch Staff School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Birch Main", regId: campusId, city: "Lahore" } });
  await user("admin", "CAMPUS_ADMIN"); await user("admin-ar", "CAMPUS_ADMIN", "ar");
  for (const key of ["absent", "free", "busy", "invigilator", "onleave", "full"]) await user(key, "TEACHER");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  const six = (await db.class.create({ data: { schoolId, campusId, name: "Six", academicYear: 2026 } })).id;
  const seven = (await db.class.create({ data: { schoolId, campusId, name: "Seven", academicYear: 2026 } })).id;
  const math6 = (await db.subject.create({ data: { schoolId, campusId, classId: six, name: "Mathematics" } })).id;
  const math7 = (await db.subject.create({ data: { schoolId, campusId, classId: seven, name: "Mathematics" } })).id;
  const tt6 = (await db.timetable.create({ data: { schoolId, campusId, classId: six, academicYear: 2026, status: "PUBLISHED" } })).id;
  const tt7 = (await db.timetable.create({ data: { schoolId, campusId, classId: seven, academicYear: 2026, status: "PUBLISHED" } })).id;
  lessonSlot = (await db.timetableSlot.create({ data: { schoolId, timetableId: tt6, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", subjectId: math6, teacherId: id("absent") } })).id;
  await db.timetableSlot.create({ data: { schoolId, timetableId: tt7, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", subjectId: math7, teacherId: id("busy") } });
  await db.timetableSlot.create({ data: { schoolId, timetableId: tt7, dayOfWeek: 1, periodNumber: 2, startTime: "08:45", endTime: "09:25", subjectId: math7, teacherId: id("free") } });
  for (let day = 2; day <= 4; day++) await db.timetableSlot.create({ data: { schoolId, timetableId: tt7, dayOfWeek: day, periodNumber: 1, startTime: "08:00", endTime: "08:40", subjectId: math7, teacherId: id("full") } });
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId, name: "Casual" } });
  for (const key of ["absent", "onleave"]) await db.leaveRequest.create({ data: { schoolId, campusId, userId: id(key), leaveTypeId: leaveType.id, fromDate: new Date(`${monday}T00:00:00Z`), toDate: new Date(`${monday}T00:00:00Z`), days: 10, status: "APPROVED" } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId: seven, title: "Synthetic Quiz", term: "Term 1", academicYear: 2026 } });
  const schedule = await db.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: math7, date: new Date(`${monday}T00:00:00Z`) } });
  const room = await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "R-1" } });
  const examRoom = await db.examRoom.create({ data: { schoolId, campusId, examScheduleId: schedule.id, roomId: room.id } });
  await db.examInvigilation.create({ data: { schoolId, campusId, examRoomId: examRoom.id, teacherId: id("invigilator"), createdById: id("admin") } });
  await db.staffProfile.create({ data: { schoolId, userId: id("full"), contractedPeriodsPerWeek: 3 } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("workload names its week and definition; unknown capacity stays unknown", async () => {
  const admin = await context("admin");
  const data = (await (await admin.request.get(`${base}/api/staff/workload?campusId=${campusId}&weekStart=${monday}`)).json()).data;
  assert.match(data.definition, /Capacity is the contracted periods per week/);
  const row = (key: string) => data.rows.find((r: { id: string }) => r.id === id(key));
  assert.deepEqual([row("absent").teaching, row("absent").leaveDays, row("absent").percent], [1, 1, null]);
  assert.deepEqual([row("full").teaching, row("full").capacity, row("full").percent], [3, 3, 100]);
  assert.equal(row("invigilator").invigilations, 1);
  assert.equal((await admin.request.patch(`${base}/api/staff/workload`, { data: { campusId, staffId: id("free"), capacity: 200 } })).status(), 400);
  assert.equal((await admin.request.patch(`${base}/api/staff/workload`, { data: { campusId, staffId: id("free"), capacity: 20 } })).status(), 200);
  assert.ok(await db.auditLog.findFirst({ where: { recordId: id("free"), tableName: "staff_profiles" } }));
  assert.equal((await (await context("absent")).request.get(`${base}/api/staff/workload?campusId=${campusId}&weekStart=${monday}`)).status(), 403);
});

test("cover lists the absent teacher's lesson and explains every candidate", async () => {
  const data = await board();
  assert.equal(data.lessons.length, 1);
  const lesson = data.lessons[0];
  assert.deepEqual([lesson.slotId, lesson.absentTeacher, lesson.className], [lessonSlot, "Synthetic absent", "Six"]);
  const candidate = (key: string) => lesson.candidates.find((c: { id: string }) => c.id === id(key));
  assert.equal(candidate("free").eligible, true);
  assert.ok(candidate("free").reasons.includes("Teaches Mathematics"));
  assert.deepEqual([candidate("busy").eligible, candidate("busy").conflicts], [false, ["Teaching Seven at this time"]]);
  assert.deepEqual(candidate("invigilator").conflicts, ["Invigilating an exam at this time"]);
  assert.deepEqual(candidate("onleave").conflicts, ["On approved leave that day"]);
  assert.match(candidate("full").warnings.join(), /Would exceed contracted capacity this week \(4 of 3\)/);
  assert.equal(lesson.candidates[0].eligible, true, "eligible candidates first");
});

test("a proposal is rechecked and goes to the reviewed substitution workflow without editing the timetable", async () => {
  const admin = await context("admin"), key = randomUUID();
  const refused = await admin.request.post(`${base}/api/staff/cover`, { data: { campusId, date: monday, duties: [{ slotId: lessonSlot, teacherId: id("busy") }], idempotencyKey: randomUUID() } });
  assert.equal(refused.status(), 409);
  assert.match((await refused.json()).error, /not available: Teaching Seven/);
  const first = await admin.request.post(`${base}/api/staff/cover`, { data: { campusId, date: monday, duties: [{ slotId: lessonSlot, teacherId: id("free") }], idempotencyKey: key } });
  assert.equal(first.status(), 201, await first.text());
  const again = await admin.request.post(`${base}/api/staff/cover`, { data: { campusId, date: monday, duties: [{ slotId: lessonSlot, teacherId: id("free") }], idempotencyKey: key } });
  assert.equal((await again.json()).data.recordId, (await first.json()).data.recordId, "a retry returns the same proposal");
  const record = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: (await again.json()).data.recordId } });
  assert.equal(record.kind, "WORKFLOW");
  assert.deepEqual((record.data as { proposal: { operation: string; duties: { teacherId: string }[] } }).proposal.operation, "timetable.assign_substitutes");
  assert.equal(await db.schoolAiSubstituteDuty.count({ where: { schoolId } }), 0, "nothing is assigned until the proposal is approved");
  assert.equal((await db.timetableSlot.findUniqueOrThrow({ where: { id: lessonSlot } })).teacherId, id("absent"), "the timetable is unchanged");
});

test("reporting loops are refused, even when two changes race; acting appointments do not change access", async () => {
  const admin = await context("admin"), patch = (body: Record<string, unknown>) => admin.request.patch(`${base}/api/staff/hierarchy`, { data: body });
  assert.equal((await patch({ userId: id("free"), reportsToId: id("busy") })).status(), 200);
  assert.equal((await patch({ userId: id("busy"), reportsToId: id("full") })).status(), 200);
  const loop = await patch({ userId: id("full"), reportsToId: id("free") });
  assert.equal(loop.status(), 400);
  assert.match((await loop.json()).error, /reporting loop/);
  const race = await Promise.all([patch({ userId: id("invigilator"), reportsToId: id("onleave") }), patch({ userId: id("onleave"), reportsToId: id("invigilator") })]);
  assert.deepEqual(race.map(r => r.status()).sort(), [200, 400], "exactly one of two opposite changes wins");
  const before = await db.user.findUniqueOrThrow({ where: { id: id("free") }, select: { role: true, accessVersion: true } });
  const grantsBefore = await db.rolePermission.count({ where: { schoolId } });
  assert.equal((await patch({ userId: id("free"), isActing: true, changeKind: "ACTING_ASSIGNMENT" })).status(), 200);
  const after = await db.user.findUniqueOrThrow({ where: { id: id("free") }, select: { role: true, accessVersion: true } });
  assert.deepEqual([after.role, after.accessVersion], [before.role, before.accessVersion], "rank and appointment never change the role");
  assert.equal(await db.rolePermission.count({ where: { schoolId } }), grantsBefore, "no permission grants are created");
});

test("leaders see workload and cover in the staff hierarchy view", async () => {
  const page = await (await context("admin")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=staff-hierarchy`);
  // The Staff structure sections are the view's PageHeader tabs (ViewTabs, role="tab") since the P5 console work.
  await page.getByRole("tab", { name: "Workload & cover" }).click({ timeout: 30_000 });
  const panel = page.locator("[data-workload-cover]");
  await panel.locator("[data-workload-row]").first().waitFor({ timeout: 15_000 });
  await panel.locator("#field-workload-week").fill(monday);
  await panel.locator(`[data-workload-row="${id("full")}"][data-over="false"]`).waitFor({ timeout: 15_000 });
  await panel.locator("#field-cover-date").fill(monday);
  await panel.locator(`[data-cover-lesson="${lessonSlot}"]`).waitFor({ timeout: 15_000 });
  await panel.locator(`[data-cover-lesson="${lessonSlot}"]`).scrollIntoViewIfNeeded();
  await shot(page, "staff-cover-candidates-en-1440");
  await panel.locator(`[data-candidate="${id("free")}"] input`).check();
  await panel.getByRole("button", { name: "Submit cover proposal" }).click();
  await panel.locator("[data-cover-proposal]").waitFor({ timeout: 15_000 });
  await panel.locator("[data-workload-table]").scrollIntoViewIfNeeded();
  await shot(page, "staff-workload-en-1440");
  assert.deepEqual(errors, []);
  await page.close();
});

test("Arabic leader reads workload and cover right-to-left at phone width", async () => {
  const page = await (await context("admin-ar", { width: 390, height: 844 })).newPage();
  // Below sm the view's tabs render as a Select, so the phone test opens the section by its address (§3.1 `?tab=`).
  await page.goto(`${base}/admin?view=staff-hierarchy&tab=workload`);
  await page.waitForLoadState("networkidle");
  if (!page.url().includes("tab=workload")) await page.goto(`${base}/admin?view=staff-hierarchy&tab=workload`);
  await page.locator("[data-workload-cover] [data-workload-row]").first().waitFor({ timeout: 15_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true);
  await shot(page, "staff-workload-ar-390");
  await page.close();
});
