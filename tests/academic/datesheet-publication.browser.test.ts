import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import { runUnscoped } from "../../src/lib/db/tenant-context";
import { documentVersionLabel } from "../../src/lib/academic/datesheet-publication";

// SKO-413 on the isolated app: a session's datesheet publishes only when every hard check passes
// (seats for every current candidate, an invigilator per room, capacity, clashes); families see nothing
// before version 1 and only the published version after; a later change needs a reason, lists the
// affected people and tells them once; documents print the version they show; a family can never take
// another class's sheet; formal sessions stay under office control.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.DATESHEET_TEST_APP || "http://localhost:3108";
const evidence = process.env.DATESHEET_EVIDENCE_DIR || "/tmp/sko413-evidence";
const db = new PrismaClient(), password = "SyntheticDatesheet413!";
const schoolId = `ds413-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
// A Wednesday at least a week ahead, clear of weekends.
const day = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7); while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const status = async () => (await (await (await context("officer")).request.get(`${base}/api/academic/datesheet-publication?sessionId=${ids.session}`)).json()).data;
const publish = async (expectedVersion: number, reason?: string) => (await context("officer")).request.post(`${base}/api/academic/datesheet-publication`, { data: { sessionId: ids.session, expectedVersion, reason } });
const familyPapers = async () => ((await (await (await context("pupil")).request.get(`${base}/api/academic/exam-schedule`)).json()).data as { id: string; periodDefinition: { startTime: string } | null; datesheetVersion?: number }[]);
const notices = async (key: string) => { let rows: { title: string }[] = []; for (let i = 0; i < 20; i++) { rows = await db.notification.findMany({ where: { userId: users.get(key)!.id, title: { startsWith: "Exam datesheet" } }, select: { title: true } }); if (rows.length) break; await new Promise(r => setTimeout(r, 250)); } return rows; };
const shot = async (page: Page, name: string, locator?: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); if (locator) await page.locator(locator).screenshot({ path: `${evidence}/${name}.png` }); else await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Poplar Exams School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Poplar Main", regId: campusId, city: "Lahore" } });
  await user("officer", "CAMPUS_ADMIN"); await user("officer-ar", "CAMPUS_ADMIN", "ar"); await user("t1", "TEACHER"); await user("t2", "TEACHER"); await user("accountant", "ACCOUNTANT"); await user("pupil", "STUDENT");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  ids.eight = (await db.class.create({ data: { schoolId, campusId, name: "Eight", section: "A", academicYear: 2026 } })).id;
  ids.nine = (await db.class.create({ data: { schoolId, campusId, name: "Nine", section: "A", academicYear: 2026 } })).id;
  const pupils: string[] = [];
  for (const [index, cls] of [ids.eight, ids.eight, ids.eight, ids.nine, ids.nine].entries()) pupils.push((await db.student.create({ data: { schoolId, campusId, classId: cls, fullName: `Synthetic Pupil ${index + 1}`, rollNo: `PO-${index + 1}`, gender: "OTHER", enrollmentDate: new Date("2026-04-01Z"), ...(index === 0 ? { studentUserId: users.get("pupil")!.id } : {}) } })).id);
  ids.math = (await db.subject.create({ data: { schoolId, campusId, classId: ids.eight, name: "Mathematics", totalMarks: 100 } })).id;
  ids.science = (await db.subject.create({ data: { schoolId, campusId, classId: ids.nine, name: "Science", totalMarks: 75 } })).id;
  ids.p1 = (await db.periodDefinition.create({ data: { schoolId, campusId, timeType: "EXAM", periodNumber: 1, startTime: "09:00", endTime: "10:00" } })).id;
  ids.p2 = (await db.periodDefinition.create({ data: { schoolId, campusId, timeType: "EXAM", periodNumber: 2, startTime: "11:00", endTime: "12:00" } })).id;
  ids.r1 = (await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "R-1", capacity: 12, rows: 2, benchesPerRow: 2, seatsPerBench: 3, examSeatsPerBench: 1 } })).id;
  ids.r2 = (await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "R-2", capacity: 12, rows: 2, benchesPerRow: 2, seatsPerBench: 3, examSeatsPerBench: 1 } })).id;
  ids.session = (await db.examSession.create({ data: { schoolId, campusId, title: "Synthetic Midterm", term: "TERM_1", academicYear: 2026, examType: "MID_TERM" } })).id;
  ids.exam8 = (await db.exam.create({ data: { schoolId, campusId, classId: ids.eight, sessionId: ids.session, title: "Midterm Eight", term: "TERM_1", academicYear: 2026, examType: "MID_TERM", status: "ACTIVE" } })).id;
  ids.exam9 = (await db.exam.create({ data: { schoolId, campusId, classId: ids.nine, sessionId: ids.session, title: "Midterm Nine", term: "TERM_1", academicYear: 2026, examType: "MID_TERM", status: "ACTIVE" } })).id;
  for (const [key, exam, subject, period, room, teacher, seated] of [["s8", ids.exam8, ids.math, ids.p1, ids.r1, "t1", pupils.slice(0, 2)], ["s9", ids.exam9, ids.science, ids.p2, ids.r2, null, pupils.slice(3, 5)]] as const) {
    ids[key] = (await db.examSchedule.create({ data: { schoolId, campusId, examId: exam, subjectId: subject, date: new Date(`${day}T00:00:00Z`), periodDefinitionId: period, roomId: room } })).id;
    const examRoom = await db.examRoom.create({ data: { schoolId, campusId, examScheduleId: ids[key], roomId: room, isPrimary: true } });
    ids[`${key}room`] = examRoom.id;
    if (teacher) await db.examInvigilation.create({ data: { schoolId, campusId, examRoomId: examRoom.id, teacherId: users.get(teacher)!.id, createdById: users.get("officer")!.id } });
    for (const [n, student] of seated.entries()) await db.examSeat.create({ data: { schoolId, campusId, examScheduleId: ids[key], examRoomId: examRoom.id, studentId: student, seatNumber: n + 1 } });
  }
  ids.unseated = pupils[2];
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.examDatesheetVersion.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("publication is blocked until every hard check passes; teachers cannot publish formal sessions", async () => {
  const blocked = await status();
  assert.equal(blocked.blocked, true);
  assert.deepEqual(blocked.issues.map((i: { kind: string }) => i.kind).sort(), ["NO_INVIGILATOR", "UNSEATED"]);
  const refused = await publish(0);
  assert.equal(refused.status(), 409);
  assert.equal((await refused.json()).issues.length, 2, "the refusal names each problem");
  assert.equal((await (await context("t1")).request.post(`${base}/api/academic/datesheet-publication`, { data: { sessionId: ids.session, expectedVersion: 0 } })).status(), 403);
  assert.equal((await familyPapers()).length, 0, "families see nothing before version 1");
  assert.equal((await (await context("pupil")).request.get(`${base}/api/academic/exam-documents?doc=datesheet&sessionId=${ids.session}`)).status(), 404);

  await db.examSeat.create({ data: { schoolId, campusId, examScheduleId: ids.s8, examRoomId: ids.s8room, studentId: ids.unseated, seatNumber: 3 } });
  await db.examInvigilation.create({ data: { schoolId, campusId, examRoomId: ids.s9room, teacherId: users.get("t2")!.id, createdById: users.get("officer")!.id } });
  const ready = await status();
  assert.equal(ready.blocked, false, JSON.stringify(ready.issues));
  const first = await publish(0);
  assert.equal(first.status(), 201, await first.text());
  assert.equal((await first.json()).data.version, 1);
  assert.equal((await publish(1)).status(), 409, "nothing changed, nothing to publish");
});

test("families see only the published version; a change needs a reason, names who is affected and tells them once", async () => {
  let seen = await familyPapers();
  assert.deepEqual([seen.length, seen[0].periodDefinition?.startTime, seen[0].datesheetVersion], [1, "09:00", 1]);
  await db.examSchedule.update({ where: { id: ids.s8 }, data: { periodDefinitionId: ids.p2 } });
  assert.equal((await familyPapers())[0].periodDefinition?.startTime, "09:00", "a live edit is invisible until published");
  const pending = await status();
  assert.deepEqual(pending.pendingChanges.map((c: { kind: string }) => c.kind), ["MOVED"]);
  assert.equal((await publish(1)).status(), 400, "a change needs a reason");
  assert.equal((await publish(0, "Hall needed for assembly")).status(), 409, "a stale version is refused");
  const second = await publish(1, "Hall needed for assembly; Mathematics moves to 11:00");
  assert.equal(second.status(), 201, await second.text());
  assert.deepEqual((await second.json()).data.affected, { classes: 1, students: 3, staff: 1 }, "only class Eight and its invigilator are affected");
  seen = await familyPapers();
  assert.deepEqual([seen[0].periodDefinition?.startTime, seen[0].datesheetVersion], ["11:00", 2]);
  assert.deepEqual((await notices("pupil")).map(n => n.title).sort(), ["Exam datesheet changed", "Exam datesheet published"], "told once per version");
  assert.deepEqual((await notices("t2")).map(n => n.title), ["Exam datesheet published"], "an unaffected invigilator is not told about version 2");
  assert.ok(await db.auditLog.findFirst({ where: { schoolId, tableName: "exam_datesheet_versions" } }));
});

test("documents name the version they show; families cannot take another class's sheet; seating stays with exam staff", async () => {
  const label = await runUnscoped("test: document label", () => documentVersionLabel(ids.session, campusId, "seating"));
  assert.match(label, /^Version 2 · ref [0-9a-f]{8} · published /);
  await db.examSeat.updateMany({ where: { examScheduleId: ids.s8, studentId: ids.unseated }, data: { seatNumber: 4 } });
  assert.match(await runUnscoped("test: document label", () => documentVersionLabel(ids.session, campusId, "seating")), /^DRAFT — changed since Version 2/);
  const pupil = await context("pupil");
  assert.equal((await pupil.request.get(`${base}/api/academic/exam-documents?doc=datesheet&examId=${ids.exam9}`)).status(), 404, "another class's exam is refused");
  const own = await pupil.request.get(`${base}/api/academic/exam-documents?doc=datesheet&sessionId=${ids.session}`);
  assert.equal(own.status(), 200);
  assert.equal(own.headers()["content-type"], "application/pdf");
  assert.equal((await (await context("accountant")).request.get(`${base}/api/academic/exam-documents?doc=seating&sessionId=${ids.session}`)).status(), 403);
  assert.equal((await (await context("t1")).request.get(`${base}/api/academic/exam-documents?doc=seating&sessionId=${ids.session}`)).status(), 200);
});

test("the office reviews checks, pending changes and history before publishing", async () => {
  await db.examSchedule.update({ where: { id: ids.s9 }, data: { periodDefinitionId: ids.p1 } });
  const page = await (await context("officer")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/admin?view=exam-cycles`);
  await page.getByText("Synthetic Midterm").first().click({ timeout: 30_000 });
  await page.getByRole("button", { name: /Seating/ }).first().click({ timeout: 15_000 });
  const panel = page.locator("[data-datesheet-publication]");
  await panel.locator("[data-pending-changes]").waitFor({ timeout: 30_000 });
  assert.match(await panel.locator("[data-publication-state]").innerText(), /Version 2 published/);
  assert.equal(await panel.locator('[data-change="MOVED"]').count(), 1);
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "datesheet-publication-en-1440", "[data-datesheet-publication]");
  assert.deepEqual(errors, []);
  await page.close();

  const ar = await (await context("officer-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/admin?view=exam-cycles`);
  await ar.waitForLoadState("networkidle");
  if (!ar.url().includes("view=exam-cycles")) await ar.goto(`${base}/admin?view=exam-cycles`);
  await ar.getByText("Synthetic Midterm").first().click({ timeout: 30_000 });
  await ar.getByRole("button", { name: /Seating|المقاعد/ }).first().click({ timeout: 15_000 });
  await ar.locator("[data-datesheet-publication] [data-pending-changes]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  assert.match(await ar.locator("[data-publication-state]").innerText(), /الإصدار 2/);
  await shot(ar, "datesheet-publication-ar-390", "[data-datesheet-publication]");
  await ar.close();
});
