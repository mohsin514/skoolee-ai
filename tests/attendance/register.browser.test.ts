import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-405 on the isolated app with synthetic pupils: a register's roster is the dated enrollment (a pupil
// who moved stays on the old class's earlier days); unmarked stays unmarked and blocks submission; a stale
// write is returned as a conflict instead of overwriting; late needs a time; a submitted register changes
// only with a reason, kept in history, and an absence correction tells the guardian once; a guardian's
// explanation waits for staff, who accept, reject or ask for clarification; the counting rule is versioned
// and used by the family's rate.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.REGISTER_TEST_APP || "http://localhost:3107";
const evidence = process.env.REGISTER_EVIDENCE_DIR || "/tmp/sko405-evidence";
const db = new PrismaClient(), password = "SyntheticRegister405!";
const schoolId = `register405-${randomUUID()}`, campusId = randomUUID(), classA = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const pupils: Record<string, string> = {};
let browser: Browser;

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
type Entry = { studentId: string; name: string; status: string | null; movedSince: boolean; version: number };
const view = async (ctx: BrowserContext, classId: string, date: string) => { const r = await ctx.request.get(`${base}/api/attendance/register?classId=${classId}&date=${date}`); return { status: r.status(), data: (await r.json()).data as { entries: Entry[]; register: { status: string }; counts: Record<string, number> } }; };
const save = async (ctx: BrowserContext, body: Record<string, unknown>) => { const r = await ctx.request.post(`${base}/api/attendance/register`, { data: body }); return { status: r.status(), json: await r.json() }; };
const mark = (studentId: string, status: string, knownStatus: string | null = null, extra: Record<string, unknown> = {}) => ({ studentId, status, knownStatus, ...extra });
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Register School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Register North", regId: campusId, city: "Lahore" } });
  const teacher = await user("teacher", "TEACHER"); await user("otherTeacher", "TEACHER"); const lead = await user("lead", "PRINCIPAL"); await user("lead-ar", "PRINCIPAL", "ar");
  const parent = await user("parent", "PARENT"); await user("otherParent", "PARENT");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await db.class.create({ data: { id: classA, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026, classTeacherId: teacher } });
  await db.class.create({ data: { id: classB, schoolId, campusId, name: "Grade 6", section: "B", academicYear: 2026 } });
  // Creating a pupil opens its first enrollment (database trigger) from the enrollment date.
  const pupil = async (key: string, name: string, classId: string, rollNo: string, from = "2026-04-01") => { const id = randomUUID(); pupils[key] = id; await db.student.create({ data: { id, schoolId, campusId, classId, fullName: name, rollNo, gender: "FEMALE", enrollmentDate: new Date(`${from}T00:00:00Z`) } as never }); return id; };
  for (const [key, name, roll] of [["amna", "Synthetic Amna Tariq", "601"], ["bilal", "Synthetic Bilal Khan", "602"], ["sana", "Synthetic Sana Iqbal", "603"]] as const) await pupil(key, name, classA, roll);
  // Moved from 6A to 6B on 2026-10-12: 6A's register for earlier days still lists her.
  const mover = await pupil("mover", "Synthetic Mover Hira", classA, "604");
  await db.$transaction(async tx => {
    await tx.studentEnrollment.update({ where: { id: `initial-${mover}` }, data: { endDate: new Date("2026-10-12T00:00:00Z"), status: "HISTORICAL" } });
    await tx.studentEnrollment.create({ data: { schoolId, studentId: mover, campusId, classId: classB, campusName: "Register North", className: "Grade 6 B", curriculum: "National", academicYear: 2026, rollNo: "611", startDate: new Date("2026-10-12T00:00:00Z") } });
    await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${mover}, true)`;
    await tx.student.update({ where: { id: mover }, data: { classId: classB, rollNo: "611" } });
  });
  // Joined 6A on 2026-10-13: not on earlier registers.
  await pupil("joiner", "Synthetic Joiner Omar", classA, "605", "2026-10-13");
  for (const [guardian, student] of [[parent, pupils.amna]]) {
    const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId: student, guardianUserId: guardian, createdByUserId: lead, fullName: "Synthetic guardian", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
    await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: lead, reason: "Synthetic register fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("the roster is the dated enrollment: a pupil who moved stays on earlier days, a later joiner does not", async () => {
  const teacher = await context("teacher");
  const before = await view(teacher, classA, "2026-10-08");
  assert.equal(before.status, 200);
  assert.deepEqual(before.data.entries.map(e => e.name).sort(), ["Synthetic Amna Tariq", "Synthetic Bilal Khan", "Synthetic Mover Hira", "Synthetic Sana Iqbal"]);
  assert.equal(before.data.entries.find(e => e.studentId === pupils.mover)!.movedSince, true);
  const afterMove = await view(teacher, classA, "2026-10-13");
  assert.deepEqual(afterMove.data.entries.map(e => e.name).sort(), ["Synthetic Amna Tariq", "Synthetic Bilal Khan", "Synthetic Joiner Omar", "Synthetic Sana Iqbal"]);
  assert.ok(before.data.entries.every(e => e.status === null), "nothing is marked until someone marks it");
  assert.equal(before.data.counts.UNMARKED, 4);
  // A historical register for the pupil who moved can be recorded on the class she belonged to.
  const saved = await save(teacher, { classId: classA, date: "2026-10-08", entries: [mark(pupils.mover, "PRESENT")] });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const wrong = await save(teacher, { classId: classA, date: "2026-10-13", entries: [mark(pupils.mover, "PRESENT")] });
  assert.equal(wrong.status, 400, "a pupil not enrolled that day cannot be marked");
  assert.equal((await view(await context("otherTeacher"), classA, "2026-10-08")).status, 404, "an unassigned teacher cannot open the register");
});

test("unmarked pupils block submission and raise no absence; late needs a time", async () => {
  const teacher = await context("teacher");
  const partial = await save(teacher, { classId: classA, date: "2026-10-09", submit: true, entries: [mark(pupils.amna, "PRESENT"), mark(pupils.bilal, "ABSENT")] });
  assert.equal(partial.status, 200);
  assert.equal(partial.json.data.submitted, false);
  assert.deepEqual(partial.json.data.unmarked.map((u: { name: string }) => u.name).sort(), ["Synthetic Mover Hira", "Synthetic Sana Iqbal"]);
  assert.equal(await db.attendance.count({ where: { schoolId, date: new Date("2026-10-09T00:00:00Z") } }), 2, "unmarked pupils have no attendance row");
  assert.equal((await db.attendanceRegister.findFirst({ where: { classId: classA, date: new Date("2026-10-09T00:00:00Z") } }))!.status, "OPEN");
  const late = await save(teacher, { classId: classA, date: "2026-10-09", entries: [mark(pupils.sana, "LATE")] });
  assert.equal(late.status, 400);
  assert.match(late.json.error, /arrival time/);
  const done = await save(teacher, { classId: classA, date: "2026-10-09", submit: true, entries: [mark(pupils.sana, "LATE", null, { arrivalTime: "08:40" }), mark(pupils.mover, "PARTIAL", null, { departureTime: "11:30" })] });
  assert.equal(done.json.data.submitted, true, JSON.stringify(done.json));
  const register = await db.attendanceRegister.findFirst({ where: { classId: classA, date: new Date("2026-10-09T00:00:00Z") } });
  assert.equal(register!.status, "SUBMITTED"); assert.equal(register!.rosterCount, 4);
  assert.equal((await db.attendance.findFirst({ where: { studentId: pupils.sana, date: new Date("2026-10-09T00:00:00Z") } }))!.arrivalTime, "08:40");
});

test("a stale write is a conflict to review, never a silent overwrite", async () => {
  const teacher = await context("teacher"), lead = await context("lead");
  const loaded = await view(lead, classA, "2026-10-07");
  assert.equal(loaded.data.entries.find(e => e.studentId === pupils.bilal)!.status, null);
  assert.equal((await save(teacher, { classId: classA, date: "2026-10-07", entries: [mark(pupils.bilal, "ABSENT")] })).status, 200);
  const own = await save(teacher, { classId: classA, date: "2026-10-07", entries: [mark(pupils.bilal, "LEAVE", "ABSENT")] });
  assert.equal(own.status, 200, `a teacher can change their own mark before submitting: ${JSON.stringify(own.json)}`);
  const stale = await save(lead, { classId: classA, date: "2026-10-07", entries: [mark(pupils.bilal, "PRESENT"), mark(pupils.amna, "PRESENT")] });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.json.data.conflicts.map((c: { studentId: string; current: string; markedBy: string }) => [c.studentId, c.current, c.markedBy]), [[pupils.bilal, "LEAVE", "Synthetic teacher"]]);
  assert.equal(stale.json.data.written, 1, "the pupil nobody else touched is saved");
  assert.equal((await db.attendance.findFirst({ where: { studentId: pupils.bilal, date: new Date("2026-10-07T00:00:00Z") } }))!.status, "LEAVE");
  assert.equal((await save(teacher, { classId: classA, date: "2026-10-07", entries: [mark(pupils.amna, "ABSENT", "PRESENT")] })).status, 403, "changing someone else's mark needs edit permission");
  const reviewed = await save(lead, { classId: classA, date: "2026-10-07", entries: [mark(pupils.bilal, "PRESENT", null, { reviewedConflict: true })] });
  assert.equal(reviewed.status, 200);
  assert.equal((await db.attendance.findFirst({ where: { studentId: pupils.bilal, date: new Date("2026-10-07T00:00:00Z") } }))!.status, "PRESENT");
});

test("a submitted register changes only with a reason; an absence correction tells the guardian once", async () => {
  const teacher = await context("teacher");
  const day = "2026-10-06", date = new Date(`${day}T00:00:00Z`);
  assert.equal((await save(teacher, { classId: classA, date: day, submit: true, entries: [mark(pupils.amna, "ABSENT"), mark(pupils.bilal, "PRESENT"), mark(pupils.sana, "PRESENT"), mark(pupils.mover, "PRESENT")] })).json.data.submitted, true);
  const lead = await context("lead");
  const noReason = await save(lead, { classId: classA, date: day, entries: [mark(pupils.amna, "PRESENT", "ABSENT")] });
  assert.equal(noReason.status, 400); assert.match(noReason.json.error, /reason/);
  assert.equal((await save(teacher, { classId: classA, date: day, reason: "Teacher tries to correct", entries: [mark(pupils.amna, "PRESENT", "ABSENT")] })).status, 403, "a submitted register is corrected by someone with edit permission");
  const fixed = await save(lead, { classId: classA, date: day, reason: "Arrived with the sports team, register taken early", entries: [mark(pupils.amna, "PRESENT", "ABSENT")] });
  assert.equal(fixed.status, 200, JSON.stringify(fixed.json));
  const row = await db.attendance.findFirst({ where: { studentId: pupils.amna, date }, include: { editHistory: true } });
  assert.equal(row!.status, "PRESENT");
  assert.deepEqual(row!.editHistory.map(h => [h.oldStatus, h.newStatus, h.source, h.reason]), [["ABSENT", "PRESENT", "CORRECTION", "Arrived with the sports team, register taken early"]]);
  const notices = await db.notification.findMany({ where: { userId: users.get("parent")!.id, type: "ATTENDANCE_CORRECTED" } });
  assert.equal(notices.length, 1); assert.match(notices[0].message, /Synthetic Amna Tariq/);
  const history = await (await teacher.request.get(`${base}/api/attendance/register?history=${row!.id}`)).json();
  assert.equal(history.data.changes[0].by, "Synthetic lead");
});

test("a guardian's explanation waits for staff, who reject, ask for clarification or accept", async () => {
  const teacher = await context("teacher"), parent = await context("parent"), lead = await context("lead"), other = await context("otherParent");
  const day = "2026-10-05", date = new Date(`${day}T00:00:00Z`);
  await save(teacher, { classId: classA, date: day, submit: true, entries: [mark(pupils.amna, "ABSENT"), mark(pupils.bilal, "ABSENT"), mark(pupils.sana, "PRESENT"), mark(pupils.mover, "PRESENT")] });
  const attendance = await db.attendance.findFirst({ where: { studentId: pupils.amna, date } });
  const mine = await (await parent.request.get(`${base}/api/parent/attendance?studentId=${pupils.amna}`)).json();
  assert.ok(mine.data.some((r: { attendanceId: string }) => r.attendanceId === attendance!.id));
  assert.equal((await other.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: attendance!.id, reason: "Not my child at all", proposedStatus: "EXCUSED" } })).status(), 404);
  const bilalRow = await db.attendance.findFirst({ where: { studentId: pupils.bilal, date } });
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: bilalRow!.id, reason: "Another family's child", proposedStatus: "EXCUSED" } })).status(), 404);
  const sent = await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: attendance!.id, reason: "Fever overnight, doctor visit", proposedStatus: "EXCUSED" } });
  assert.equal(sent.status(), 201);
  assert.equal((await db.attendance.findUnique({ where: { id: attendance!.id } }))!.status, "ABSENT", "an explanation never edits the register");
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: attendance!.id, reason: "Sending it twice", proposedStatus: "EXCUSED" } })).status(), 409);
  const queue = (await (await lead.request.get(`${base}/api/attendance/register?queue=1`)).json()).data;
  const explanation = queue.explanations.find((e: { attendanceId: string }) => e.attendanceId === attendance!.id);
  assert.ok(explanation);
  assert.ok(queue.unexplainedAbsences.some((a: { attendanceId: string }) => a.attendanceId === bilalRow!.id));
  assert.ok(!queue.unexplainedAbsences.some((a: { attendanceId: string }) => a.attendanceId === attendance!.id), "an explained absence leaves the unexplained list");
  assert.equal((await save(lead, { review: { id: explanation.id, action: "reject" } })).status, 400, "rejecting needs a reason");
  assert.equal((await save(lead, { review: { id: explanation.id, action: "clarify", note: "Please attach the doctor's note" } })).status, 200);
  const asked = (await (await parent.request.get(`${base}/api/parent/attendance?studentId=${pupils.amna}`)).json()).data.find((r: { attendanceId: string }) => r.attendanceId === attendance!.id);
  assert.equal(asked.explanation.status, "CLARIFICATION"); assert.equal(asked.explanation.reviewNote, "Please attach the doctor's note");
  assert.equal((await parent.request.post(`${base}/api/parent/attendance`, { data: { attendanceId: attendance!.id, reason: "Doctor's note handed to the office", proposedStatus: "EXCUSED" } })).status(), 201);
  assert.equal(await db.attendanceExplanation.count({ where: { attendanceId: attendance!.id } }), 1, "the reply continues the same explanation");
  const stale = await save(lead, { review: { id: explanation.id, action: "accept", knownVersion: 99 } });
  assert.equal(stale.status, 409);
  const accepted = await save(lead, { review: { id: explanation.id, action: "accept", knownVersion: attendance!.version } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
  const row = await db.attendance.findUnique({ where: { id: attendance!.id }, include: { editHistory: true } });
  assert.equal(row!.status, "EXCUSED");
  assert.equal(row!.editHistory.at(-1)!.source, "EXPLANATION");
  assert.equal((await save(lead, { review: { id: explanation.id, action: "accept" } })).status, 409, "a decided explanation stays decided");
  assert.equal((await db.notification.count({ where: { userId: users.get("parent")!.id, type: "ATTENDANCE_CORRECTED" } })), 2);
});

test("the counting rule is versioned and drives the family's rate", async () => {
  const teacher = await context("teacher"), lead = await context("lead"), parent = await context("parent");
  assert.equal((await save(teacher, { rule: { attended: ["PRESENT"], excluded: [], note: "Teachers cannot change it" } })).status, 403);
  // Amna: 10-06 PRESENT (corrected), 10-07 PRESENT, 10-09 PRESENT, 10-05 EXCUSED. Default rule: 4/4 = 100%.
  const rate = async () => (await (await parent.request.get(`${base}/api/parent/data?studentId=${pupils.amna}`)).json()).data?.attendance ?? (await (await parent.request.get(`${base}/api/parent/data`)).json()).attendance;
  const before = await rate();
  assert.equal(before.rate, 100, JSON.stringify(before));
  const published = await save(lead, { rule: { attended: ["PRESENT", "LATE", "PARTIAL", "LEAVE"], excluded: [], note: "Excused absence counts against the rate from this term" } });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  assert.equal(published.json.data.version, 1);
  assert.equal((await save(lead, { rule: { attended: ["PRESENT", "LATE", "PARTIAL", "LEAVE"], excluded: [], note: "Same again" } })).status, 409);
  assert.equal((await save(lead, { rule: { attended: ["PRESENT", "ABSENT"], excluded: [], note: "Absent cannot count" } })).status, 400);
  assert.equal((await rate()).rate, 75);
});

test("screens: unmarked state, fill only unmarked, review; Arabic exceptions; guardian explanation", async () => {
  const teacherCtx = await context("teacher");
  const page = await teacherCtx.newPage();
  await page.goto(`${base}/teacher/attendance?classId=${classA}`);
  const register = page.locator("[data-class-register]");
  await register.waitFor({ timeout: 30_000 }).catch(async error => { await shot(page, "00-debug-teacher"); throw error; });
  await register.locator('input[type="date"]').fill("2026-10-08");
  await page.locator(`[data-register-row="${pupils.mover}"]`).waitFor();
  assert.equal(await page.locator('[data-register-row][data-status="UNMARKED"]').count(), 3, "only the pupil marked earlier is marked");
  await page.locator(`[data-register-row="${pupils.amna}"] [data-mark="ABSENT"]`).click();
  await page.locator("[data-review-register]").click();
  await page.locator("[data-review-unmarked]").waitFor();
  await shot(page, "01-review-blocked-unmarked");
  await page.getByRole("button", { name: "Back to the register" }).click();
  await page.locator("[data-fill-present]").click();
  assert.equal(await page.locator(`[data-register-row="${pupils.amna}"]`).getAttribute("data-status"), "ABSENT", "filling never overwrites a mark");
  assert.equal(await page.locator('[data-register-row][data-status="UNMARKED"]').count(), 0);
  await page.locator("[data-review-register]").click();
  await shot(page, "02-review-ready");
  await page.locator("[data-confirm-register]").click();
  await page.locator('[data-class-register][data-register-status="SUBMITTED"]').waitFor();
  await shot(page, "03-submitted");
  assert.equal((await db.attendanceRegister.findFirst({ where: { classId: classA, date: new Date("2026-10-08T00:00:00Z") } }))!.status, "SUBMITTED");
  await page.close();

  const ar = await (await context("lead-ar")).newPage();
  await ar.goto(`${base}/principal?view=attendance`);
  const exceptions = ar.locator("[data-attendance-exceptions]");
  await exceptions.waitFor({ timeout: 30_000 });
  await exceptions.scrollIntoViewIfNeeded();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  assert.match(await exceptions.innerText(), /استثناءات الحضور/);
  await shot(ar, "04-exceptions-ar");
  await ar.close();

  const parentPage = await (await context("parent", { width: 390, height: 844 })).newPage();
  await parentPage.goto(`${base}/parent/attendance`);
  await parentPage.locator("[data-guardian-absences]").waitFor({ timeout: 30_000 });
  await parentPage.locator("[data-guardian-absences]").scrollIntoViewIfNeeded();
  await parentPage.locator("[data-explain]").first().click();
  await parentPage.locator("[data-explain-dialog]").waitFor();
  await shot(parentPage, "05-guardian-explain-mobile");
  await parentPage.getByRole("button", { name: "Cancel" }).click();
  await parentPage.evaluate(() => window.scrollTo(0, 0));
  await shot(parentPage, "06-guardian-summary-mobile");
  await parentPage.close();
});
