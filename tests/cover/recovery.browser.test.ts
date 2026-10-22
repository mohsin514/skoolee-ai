import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-442 on the isolated app with synthetic data: a teacher who teaches at another campus too close to the
// lesson is not offered as cover; the absent teacher's handover reaches only the substitute, whose access to
// its resources lasts until the end of the lesson's day and ends with the duty; "supervised only" and "no
// cover" open a recovery decision for the class's teacher instead of counting as taught; a catch-up reaches
// learners only once shared and is completed with evidence; Today shows the cover teacher.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.COVER_TEST_APP || "http://localhost:3107";
const evidence = process.env.COVER_EVIDENCE_DIR || "/tmp/sko442-evidence";
const db = new PrismaClient(), password = "SyntheticCover442!";
const schoolId = `cover442-${randomUUID()}`, north = randomUUID(), south = randomUUID(), classId = randomUUID(), otherClassId = randomUUID();
const TZ = "Asia/Karachi";
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const DAY = 86_400_000;
const localDate = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
const today = localDate(new Date()), yesterday = localDate(new Date(Date.now() - DAY)), tomorrow = localDate(new Date(Date.now() + DAY));
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;

async function user(key: string, role: string, campusId = north, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport: { width: 1440, height: 1000 }, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data, maxRedirects: 0 } : { maxRedirects: 0 }); const out = { status: r.status(), json: await r.json().catch(() => ({})) }; await ctx.close(); return out; };
const id = (key: string) => users.get(key)!.id;
const notices = (key: string, type: string) => db.notification.count({ where: { userId: id(key), type } });
async function resource(title: string, klass: string) {
  const rid = randomUUID();
  await db.learningResource.create({ data: { id: rid, schoolId, campusId: north, classId: klass, title, kind: "WORKSHEET", audience: "CLASS", language: "en", sourceRights: "Synthetic", ownerId: id("absent"), latestVersion: 1, status: "PUBLISHED", publishedVersion: 1 } });
  await db.learningResourceVersion.create({ data: { schoolId, resourceId: rid, version: 1, description: `${title}: synthetic.`, createdById: id("absent"), linkUrl: "https://example.invalid/synthetic-worksheet" } });
  return rid;
}
const duty = async (slotKey: string, date: string, teacherKey: string) => (await db.schoolAiSubstituteDuty.create({ data: { schoolId, campusId: north, timetableSlotId: ids[slotKey], date: new Date(`${date}T00:00:00Z`), originalTeacherId: id("absent"), teacherId: id(teacherKey), reason: "Synthetic approved cover", status: "ASSIGNED", assignedById: id("coordinator"), lessonSnapshot: { classId, academicYear: 2026, term: "ANNUAL", dayOfWeek: weekday(date), periodNumber: 1, className: "Grade 7 A", subjectName: "Synthetic Science", roomNumber: "Lab 2", startTime: slotKey === "l1" ? "10:00" : "11:00", endTime: slotKey === "l1" ? "10:40" : "11:40", teacherName: `Synthetic ${teacherKey}`, originalTeacherName: "Synthetic absent" } } })).id;

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Juniper Academy", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: TZ } as never });
  for (const [cid, name] of [[north, "Juniper North"], [south, "Juniper South"]]) { await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: "Lahore" } }); await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } }); }
  await user("coordinator", "CAMPUS_ADMIN"); await user("absent", "TEACHER"); await user("sub", "TEACHER"); await user("free", "TEACHER"); await user("away", "TEACHER");
  const learner = await user("learner", "STUDENT"); await user("learner-ar", "STUDENT", north, "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId: north, name: "Grade 7", section: "A", academicYear: 2026, classTeacherId: id("absent") } });
  await db.class.create({ data: { id: otherClassId, schoolId, campusId: north, name: "Grade 8", section: "B", academicYear: 2026 } });
  const southClass = randomUUID(); await db.class.create({ data: { id: southClass, schoolId, campusId: south, name: "Grade 7", section: "S", academicYear: 2026 } });
  const subject = await db.subject.create({ data: { schoolId, campusId: north, classId, name: "Synthetic Science", teacherId: id("absent") } });
  for (const [key, account] of [["s1", learner], ["s2", id("learner-ar")]]) { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId: north, classId, studentUserId: account, fullName: `Synthetic pupil ${key}`, rollNo: key, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  const tt = await db.timetable.create({ data: { schoolId, campusId: north, classId, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  ids.l1 = (await db.timetableSlot.create({ data: { schoolId, timetableId: tt.id, dayOfWeek: weekday(today), periodNumber: 1, teacherId: id("absent"), subjectId: subject.id, startTime: "10:00", endTime: "10:40", slotType: "CLASS", roomNumber: "Lab 2" } })).id;
  ids.l2 = (await db.timetableSlot.create({ data: { schoolId, timetableId: tt.id, dayOfWeek: weekday(today), periodNumber: 2, teacherId: id("absent"), subjectId: subject.id, startTime: "11:00", endTime: "11:40", slotType: "CLASS" } })).id;
  const snap = (sid: string, period: number, start: string, end: string) => ({ id: sid, dayOfWeek: weekday(today), periodNumber: period, startTime: start, endTime: end, slotType: "CLASS", subjectId: subject.id, subjectName: "Synthetic Science", teacherId: id("absent"), teacherName: "Synthetic absent", roomId: null, roomNumber: period === 1 ? "Lab 2" : null });
  await db.timetableVersion.create({ data: { schoolId, campusId: north, timetableId: tt.id, version: 1, draftRevision: 1, effectiveFrom: new Date(`${yesterday}T00:00:00Z`), slots: [snap(ids.l1, 1, "10:00", "10:40"), snap(ids.l2, 2, "11:00", "11:40")] } });
  // The "away" teacher teaches at the south campus at 10:50, too close to cover 10:00–10:40 with travel.
  const southTt = await db.timetable.create({ data: { schoolId, campusId: south, classId: southClass, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  await db.timetableSlot.create({ data: { schoolId, timetableId: southTt.id, dayOfWeek: weekday(today), periodNumber: 1, teacherId: id("away"), startTime: "10:50", endTime: "11:30", slotType: "CLASS" } });
  const leaveType = await db.leaveType.create({ data: { schoolId, campusId: north, name: "Synthetic sick" } });
  await db.leaveRequest.create({ data: { schoolId, campusId: north, userId: id("absent"), leaveTypeId: leaveType.id, fromDate: new Date(`${yesterday}T00:00:00Z`), toDate: new Date(`${tomorrow}T00:00:00Z`), status: "APPROVED", reviewedAt: new Date() } });
  ids.r1 = await resource("Synthetic circuits worksheet", classId); ids.rOther = await resource("Synthetic Grade 8 notes", otherClassId);
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("cover suggestions explain reasons and reject a teacher who cannot travel between campuses in time", async () => {
  const board = (await call("coordinator", "get", `/api/staff/cover?campusId=${north}&date=${today}`)).json.data;
  const l1 = board.lessons.find((l: { slotId: string }) => l.slotId === ids.l1);
  const candidate = (key: string) => l1.candidates.find((c: { id: string }) => c.id === id(key));
  assert.equal(candidate("away").eligible, false);
  assert.match(candidate("away").conflicts.join(" "), /Juniper South 10:50–11:30; not enough travel time \(30 min\)/);
  assert.equal(candidate("sub").eligible, true);
  assert.ok(candidate("sub").reasons.includes("No lesson, cover or invigilation at this time"));
  assert.match(board.scopeNote, /another campus/);
});

test("handover reaches only the substitute; its resources open through the duty until the end of the day", async () => {
  ids.d1 = await duty("l1", today, "sub");
  ids.dPast = await duty("l2", yesterday, "free");
  assert.equal((await call("free", "post", "/api/cover", { action: "handover", dutyId: ids.d1, objective: "x" })).status, 404, "only the absent teacher or a leader writes it");
  assert.equal((await call("absent", "post", "/api/cover", { action: "handover", dutyId: ids.d1, objective: "Build a series circuit", resourceIds: [ids.rOther] })).status, 400, "only this class's published resources");
  const saved = await call("absent", "post", "/api/cover", { action: "handover", dutyId: ids.d1, objective: "Build a series circuit and explain current flow", instructions: "Staff only: pupils work in pairs; kits in cupboard B.", resourceIds: [ids.r1] });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(await notices("sub", "COVER_HANDOVER_READY"), 1, "the confirmed substitute is told");
  assert.equal(await notices("free", "COVER_HANDOVER_READY"), 0);
  const mine = (await call("sub", "get", "/api/cover")).json.data;
  const view = mine.duties.find((d: { id: string }) => d.id === ids.d1);
  assert.deepEqual([view.role, view.handover.objective, view.resources.map((r: { id: string }) => r.id), view.resourcesOpen], ["COVERING", "Build a series circuit and explain current flow", [ids.r1], true]);
  assert.equal((await call("sub", "get", `/api/resources/${ids.r1}/file`)).status, 302, "the substitute opens the handover resource");
  assert.equal((await call("free", "get", `/api/resources/${ids.r1}/file`)).status, 404, "another teacher does not");
  assert.equal((await call("sub", "get", `/api/resources/${ids.rOther}/file`)).status, 404, "nothing outside the handover");
  // Yesterday's duty: access has ended.
  await db.coverHandover.create({ data: { schoolId, campusId: north, dutyId: ids.dPast, objective: "Old lesson", resourceIds: [ids.r1] } });
  const past = (await call("free", "get", "/api/cover")).json.data.duties.find((d: { id: string }) => d.id === ids.dPast);
  assert.equal(past.resourcesOpen, false);
  assert.equal((await call("free", "get", `/api/resources/${ids.r1}/file`)).status, 404, "access ended with the lesson's day");
  assert.equal((await call("absent", "post", "/api/cover", { action: "handover", dutyId: ids.dPast, objective: "late" })).status, 409, "a passed lesson cannot get a new handover");
});

test("supervised-only cover and an uncovered lesson open recovery decisions, never 'taught'", async () => {
  assert.equal((await call("sub", "post", "/api/cover", { action: "acknowledge", dutyId: ids.d1 })).status, 200);
  assert.equal((await call("free", "post", "/api/cover", { action: "outcome", dutyId: ids.d1, outcome: "DELIVERED" })).status, 404, "only the substitute or a leader records it");
  assert.equal((await call("sub", "post", "/api/cover", { action: "outcome", dutyId: ids.d1, outcome: "SUPERVISED_ONLY" })).status, 400, "say what pupils did instead");
  const recorded = await call("sub", "post", "/api/cover", { action: "outcome", dutyId: ids.d1, outcome: "SUPERVISED_ONLY", actualActivity: "Pupils read the textbook chapter; the practical was postponed." });
  assert.equal(recorded.status, 200, JSON.stringify(recorded.json));
  ids.rec1 = recorded.json.data.recoveryId;
  assert.ok(ids.rec1);
  assert.equal((await call("sub", "post", "/api/cover", { action: "outcome", dutyId: ids.d1, outcome: "DELIVERED" })).status, 409, "recorded once");
  assert.equal(await notices("absent", "LESSON_RECOVERY_NEEDED"), 1);
  const future = await duty("l2", tomorrow, "sub");
  assert.equal((await call("sub", "post", "/api/cover", { action: "outcome", dutyId: future, outcome: "DELIVERED" })).status, 409, "not before the lesson's day");
  await db.schoolAiSubstituteDuty.update({ where: { id: future }, data: { status: "CANCELLED" } });
  // L2 today had no cover: the coordinator records it for follow-up.
  assert.equal((await call("coordinator", "post", `/api/cover/campus?campusId=${north}`, { action: "uncovered", slotId: ids.l1, date: today })).status, 409, "a covered lesson records its cover outcome instead");
  const none = await call("coordinator", "post", `/api/cover/campus?campusId=${north}`, { action: "uncovered", slotId: ids.l2, date: today });
  assert.equal(none.status, 201, JSON.stringify(none.json)); ids.rec2 = none.json.data.id;
  assert.equal((await call("coordinator", "post", `/api/cover/campus?campusId=${north}`, { action: "uncovered", slotId: ids.l2, date: today })).json.data.id, ids.rec2, "recorded once");
  assert.equal((await call("absent", "post", `/api/cover/campus?campusId=${north}`, { action: "uncovered", slotId: ids.l2, date: today })).status, 404, "teachers do not record cover gaps");
  const follow = (await call("coordinator", "get", `/api/cover/campus?campusId=${north}&date=${today}`)).json.data;
  assert.deepEqual(follow.covered.map((c: { id: string; handoverReady: boolean; acknowledged: boolean; outcome: string }) => [c.id, c.handoverReady, c.acknowledged, c.outcome]), [[ids.d1, true, true, "SUPERVISED_ONLY"]]);
  assert.deepEqual(follow.recoveries.map((r: { status: string }) => r.status).sort(), ["DECISION_NEEDED", "DECISION_NEEDED"]);
  assert.deepEqual(follow.uncoveredRecorded, [ids.l2]);
});

test("catch-up reaches learners only once shared; completed with evidence; Today shows the cover teacher", async () => {
  const learnerToday = async () => (await call("learner", "get", "/api/student/today")).json.data;
  let rec = await db.lessonRecovery.findUniqueOrThrow({ where: { id: ids.rec1 } });
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "plan", recoveryId: ids.rec1, knownVersion: rec.version, title: "Circuits practical", dueDate: yesterday })).status, 400, "due on or after the missed lesson");
  assert.equal((await call("sub", "post", "/api/cover", { action: "recovery", step: "plan", recoveryId: ids.rec1, knownVersion: rec.version, title: "x", dueDate: tomorrow })).status, 404, "the owner decides");
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "plan", recoveryId: ids.rec1, knownVersion: rec.version, title: "Circuits practical", instructions: "Bring your notes; we build the series circuit together.", dueDate: tomorrow })).status, 200);
  let t = await learnerToday();
  assert.equal(t.catchUp.length, 0, "a planned catch-up is not visible yet");
  const l1 = t.lessons.find((l: { id: string }) => l.id === ids.l1), l2 = t.lessons.find((l: { id: string }) => l.id === ids.l2);
  assert.deepEqual([l1.cover, l1.teacher], [true, "Synthetic sub"], "approved cover shows who teaches");
  assert.equal(l2.cover, undefined);
  rec = await db.lessonRecovery.findUniqueOrThrow({ where: { id: ids.rec1 } });
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "publish", recoveryId: ids.rec1, knownVersion: rec.version - 1 })).status, 409, "a stale version is refused");
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "publish", recoveryId: ids.rec1, knownVersion: rec.version })).status, 200);
  t = await learnerToday();
  assert.deepEqual(t.catchUp.map((c: { title: string; done: boolean; dueDate: string }) => [c.title, c.done, c.dueDate]), [["Circuits practical", false, tomorrow]]);
  rec = await db.lessonRecovery.findUniqueOrThrow({ where: { id: ids.rec1 } });
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "not_needed", recoveryId: ids.rec1, knownVersion: rec.version, note: "x" })).status, 409, "a shared catch-up is completed, not dropped");
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "complete", recoveryId: ids.rec1, knownVersion: rec.version })).status, 400, "evidence is required");
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "complete", recoveryId: ids.rec1, knownVersion: rec.version, evidenceNote: "All pupils built and explained the circuit in the catch-up lesson." })).status, 200);
  t = await learnerToday();
  assert.equal(t.catchUp[0].done, true);
  const r2 = await db.lessonRecovery.findUniqueOrThrow({ where: { id: ids.rec2 } });
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "not_needed", recoveryId: ids.rec2, knownVersion: r2.version })).status, 400, "a reason is required");
  assert.equal((await call("absent", "post", "/api/cover", { action: "recovery", step: "not_needed", recoveryId: ids.rec2, knownVersion: r2.version, note: "Revision lesson; the objective is taught again next week as planned." })).status, 200);
  const done = await db.lessonRecovery.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(done.map(r => [r.source, r.status, Boolean(r.completedById)]), [["SUPERVISED_ONLY", "COMPLETED", true], ["UNCOVERED", "NOT_NEEDED", true]]);
  // Staff-only handover text never reaches learners.
  assert.ok(!JSON.stringify(t).includes("cupboard B") && !JSON.stringify(t).includes("textbook chapter"));
});

test("screens: substitute's cover, owner's catch-up, coordinator follow-up, Arabic Today", async () => {
  // Fresh rows for the screenshots.
  const d = await duty("l2", today, "free");
  await db.coverHandover.create({ data: { schoolId, campusId: north, dutyId: d, objective: "Compare parallel and series circuits", instructions: "Staff only: use the demonstration board.", resourceIds: [ids.r1] } });
  const sub = await (await context("free")).newPage();
  await sub.goto(`${base}/teacher/timetable`);
  await sub.locator(`[data-my-cover] [data-duty="${d}"]`).waitFor();
  await sub.locator("[data-my-cover]").scrollIntoViewIfNeeded();
  await shot(sub, "01-substitute-cover-en");
  await sub.locator(`[data-duty="${d}"] [data-duty-outcome]`).click();
  await sub.locator("[data-outcome-dialog] [data-outcome=SUPERVISED_ONLY]").check();
  await shot(sub, "02-outcome-supervised-en");
  await sub.close();
  const owner = await (await context("absent")).newPage();
  await owner.goto(`${base}/teacher/timetable`);
  await owner.locator("[data-my-cover] [data-cover-recoveries]").waitFor();
  await owner.locator("[data-my-cover]").scrollIntoViewIfNeeded();
  await shot(owner, "03-owner-recoveries-en");
  await owner.close();
  const lead = await (await context("coordinator")).newPage();
  await lead.goto(`${base}/admin?view=staff-hierarchy`);
  // Staff structure sections are ViewTabs now (role="tab"); each tab carries its tour anchor.
  await lead.locator('[data-tour="page.tab.workload"]').click({ timeout: 30_000 });
  await lead.locator("[data-cover-follow-up] [data-follow-duty]").first().waitFor({ timeout: 30_000 });
  await lead.locator("[data-cover-follow-up]").scrollIntoViewIfNeeded();
  await shot(lead, "04-coordinator-follow-up-en");
  await lead.close();
  const ar = await (await context("learner-ar")).newPage();
  await ar.goto(`${base}/student`);
  await ar.locator("[data-catch-up]").first().waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await shot(ar, "05-student-today-ar");
  await ar.close();
});
