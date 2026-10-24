import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { versionsFor } from "../../src/lib/timetable/versions";

// SKO-403 on the isolated app with synthetic data: clashes are found by real clock overlap whatever the
// period numbers (and across campuses for a teacher); publication reviews an exact draft revision, blocks
// hard conflicts, and creates a version with an effective date; families, students and teachers see the
// version in force, not the draft; a future version waits for its date; affected people are told once.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.TIMETABLE_TEST_APP || "http://localhost:3107";
const evidence = process.env.TIMETABLE_EVIDENCE_DIR || "/tmp/sko403-evidence";
const db = new PrismaClient(), password = "SyntheticTimetable403!";
const schoolId = `timetable403-${randomUUID()}`, campusA = randomUUID(), campusB = randomUUID();
const class7 = randomUUID(), class8 = randomUUID(), class9 = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;

async function user(key: string, role: string, campus: string | null = campusA, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
// The school-local date, as the server reports it (the campus timezone can be a day ahead of UTC).
let schoolDay = "";
const today = () => schoolDay;
const plusDays = (days: number) => new Date(new Date(`${schoolDay}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
type Preview = { today: string; draftRevision: number; inForce: { version: number } | null; upcoming: { version: number; effectiveFrom: string } | null; validation: { conflicts: { type: string; severity: string; message: string; otherClass?: string; otherTime?: string; otherCampus?: string; otherSlotId?: string }[] }; changes: unknown[]; affected: { teachers: { fullName: string }[]; students: number } };
const preview = async (ctx: BrowserContext, timetableId: string) => { const data = (await (await ctx.request.get(`${base}/api/timetable/${timetableId}?publication=1`)).json()).data as Preview; schoolDay = data.today; return data; };
const put = async (ctx: BrowserContext, timetableId: string, data: Record<string, unknown>) => { const r = await ctx.request.put(`${base}/api/timetable/${timetableId}`, { data }); return { status: r.status(), json: await r.json() }; };
const slot = (timetableId: string, day: number, period: number, start: string, end: string, extra: Record<string, unknown> = {}) => db.timetableSlot.create({ data: { schoolId, timetableId, dayOfWeek: day, periodNumber: period, startTime: start, endTime: end, ...extra } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Timetable School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  for (const [id, name] of [[campusA, "Timetable North"], [campusB, "Timetable South"]]) {
    await db.campus.create({ data: { id, schoolId, name, regId: id, city: "Lahore" } });
    await db.academicCycle.create({ data: { schoolId, campusId: id, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  }
  await user("lead", "CAMPUS_ADMIN"); await user("lead-ar", "CAMPUS_ADMIN", campusA, "ar");
  const maya = await user("maya", "TEACHER"), omar = await user("omar", "TEACHER"), bystander = await user("bystander", "TEACHER");
  const parent = await user("parent", "PARENT"); const learner = await user("learner", "STUDENT");
  for (const [id, campus, name] of [[class7, campusA, "Grade 7"], [class8, campusA, "Grade 8"], [class9, campusB, "Grade 9"]] as const) await db.class.create({ data: { id, schoolId, campusId: campus, name, section: "A", academicYear: 2026, teachingMode: "SUBJECT" } });
  const subject = async (key: string, classId: string, campus: string, name: string, teacherId: string) => { ids[key] = (await db.subject.create({ data: { schoolId, campusId: campus, classId, name, teacherId } })).id; };
  await subject("math7", class7, campusA, "Mathematics", maya); await subject("eng7", class7, campusA, "English", omar);
  await subject("sci8", class8, campusA, "Science", maya); await subject("art9", class9, campusB, "Art", maya);
  ids.room1 = (await db.classRoom.create({ data: { schoolId, campusId: campusA, roomNumber: "N-1", capacity: 40 } })).id;
  ids.room2 = (await db.classRoom.create({ data: { schoolId, campusId: campusA, roomNumber: "N-2", capacity: 40 } })).id;
  ids.pupil = randomUUID();
  await db.student.create({ data: { id: ids.pupil, schoolId, campusId: campusA, classId: class7, studentUserId: learner, fullName: "Synthetic Pupil Zain", rollNo: "701", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId: campusA, studentId: ids.pupil, guardianUserId: parent, createdByUserId: users.get("lead")!.id, fullName: "Synthetic guardian", email: users.get("parent")!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: users.get("lead")!.id, reason: "Synthetic timetable fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  // Grade 7: Maya 09:00–09:45 (period 2) on Monday, and Tuesday 10:20–11:00 (period 4).
  ids.tt7 = (await db.timetable.create({ data: { schoolId, campusId: campusA, classId: class7, academicYear: 2026 } })).id;
  ids.s7mon1 = (await slot(ids.tt7, 1, 1, "08:15", "09:00", { subjectId: ids.eng7, teacherId: omar, roomId: ids.room1 })).id;
  ids.s7mon2 = (await slot(ids.tt7, 1, 2, "09:00", "09:45", { subjectId: ids.math7, teacherId: maya, roomId: ids.room1 })).id;
  await slot(ids.tt7, 2, 1, "08:15", "09:00");
  await slot(ids.tt7, 2, 2, "09:00", "09:45");
  ids.s7tue4 = (await slot(ids.tt7, 2, 4, "10:20", "11:00", { subjectId: ids.math7, teacherId: maya, roomId: ids.room1 })).id;
  // Grade 8 runs a different bell: its period 3 is 09:30–10:15, overlapping Grade 7's period 2.
  ids.tt8 = (await db.timetable.create({ data: { schoolId, campusId: campusA, classId: class8, academicYear: 2026 } })).id;
  ids.s8mon3 = (await slot(ids.tt8, 1, 3, "09:30", "10:15", { subjectId: ids.sci8, teacherId: maya, roomId: ids.room2 })).id;
  // Grade 9 at the other campus: Maya 10:30–11:10 on Tuesday, overlapping Grade 7's Tuesday lesson.
  ids.tt9 = (await db.timetable.create({ data: { schoolId, campusId: campusB, classId: class9, academicYear: 2026 } })).id;
  await slot(ids.tt9, 2, 1, "10:30", "11:10", { subjectId: ids.art9, teacherId: maya });
  void bystander;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("different period numbers with overlapping times clash, and a teacher's other campus counts", async () => {
  const lead = await context("lead");
  const eight = await preview(lead, ids.tt8);
  const clash = eight.validation.conflicts.find(c => c.type === "TEACHER_DOUBLE_BOOKED" && c.severity === "CRITICAL");
  assert.ok(clash, JSON.stringify(eight.validation));
  assert.match(clash!.message, /09:00–09:45/); assert.equal(clash!.otherClass, "Grade 7 - A"); assert.equal(clash!.otherSlotId, ids.s7mon2);
  const blocked = await put(lead, ids.tt8, { action: "publish", draftRevision: eight.draftRevision, effectiveFrom: today() });
  assert.equal(blocked.status, 409, "hard conflicts block publication");
  assert.equal(await db.timetableVersion.count({ where: { timetableId: ids.tt8 } }), 0);
  // Give Grade 8 another teacher; its draft no longer collides with Grade 7.
  assert.equal((await put(lead, ids.tt8, { draftRevision: eight.draftRevision, slots: [{ id: ids.s8mon3, teacherId: users.get("bystander")!.id }] })).status, 200);
  const seven = await preview(lead, ids.tt7);
  const crossCampus = seven.validation.conflicts.find(c => c.otherCampus === "Timetable South");
  assert.ok(crossCampus, "the teacher's lesson at the other campus overlaps 10:20–11:00");
  assert.equal(crossCampus!.otherTime, "10:30–11:10");
});

test("publishing reviews an exact draft revision and creates version 1 that every role reads", async () => {
  const lead = await context("lead");
  const before = await preview(lead, ids.tt7);
  // Resolve the cross-campus clash by moving the Tuesday lesson to period 2 (09:00–09:45).
  const tue2 = (await db.timetableSlot.findFirstOrThrow({ where: { timetableId: ids.tt7, dayOfWeek: 2, periodNumber: 2 } })).id;
  const moved = await put(lead, ids.tt7, { draftRevision: before.draftRevision, slots: [{ id: tue2, subjectId: ids.math7, teacherId: users.get("maya")!.id, roomId: ids.room1 }, { id: ids.s7tue4, subjectId: null, teacherId: null, roomId: null }] });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  const stale = await put(lead, ids.tt7, { draftRevision: before.draftRevision, slots: [{ id: ids.s7mon1, roomId: ids.room2 }] });
  assert.equal(stale.status, 409, "a save from an older copy of the draft is refused");
  const ready = await preview(lead, ids.tt7);
  assert.equal(ready.draftRevision, before.draftRevision + 1);
  assert.equal(ready.validation.conflicts.filter(c => c.severity === "CRITICAL").length, 0, JSON.stringify(ready.validation.conflicts));
  assert.deepEqual(ready.affected.teachers.map(t => t.fullName).sort(), ["Synthetic maya", "Synthetic omar"]);
  assert.equal(ready.affected.students, 1);
  assert.equal((await put(lead, ids.tt7, { action: "publish", draftRevision: ready.draftRevision, effectiveFrom: plusDays(-1) })).status, 400, "not in the past");
  assert.equal((await put(lead, ids.tt7, { action: "publish", draftRevision: ready.draftRevision - 1, effectiveFrom: today() })).status, 409, "a stale review cannot publish");
  assert.equal((await put(await context("maya"), ids.tt7, { action: "publish", draftRevision: ready.draftRevision, effectiveFrom: today() })).status, 403);
  const published = await put(lead, ids.tt7, { action: "publish", draftRevision: ready.draftRevision, effectiveFrom: today() });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  assert.equal(published.json.version.version, 1);
  const parentView = (await (await (await context("parent")).request.get(`${base}/api/parent/timetable?studentId=${ids.pupil}`)).json()).data;
  assert.equal(parentView.version.version, 1);
  assert.deepEqual(parentView.slots.filter((s: { subject: unknown }) => s.subject).map((s: { dayOfWeek: number; startTime: string; subject: { name: string } }) => `${s.dayOfWeek} ${s.startTime} ${s.subject.name}`), ["1 08:15 English", "1 09:00 Mathematics", "2 09:00 Mathematics"]);
  const studentView = (await (await (await context("learner")).request.get(`${base}/api/timetable/class`)).json()).data;
  assert.equal(studentView.version.version, 1);
  const mayaView = (await (await (await context("maya")).request.get(`${base}/api/timetable/teacher`)).json()).data;
  assert.deepEqual(mayaView.filter((s: { classId: string }) => s.classId === class7).map((s: { dayOfWeek: number; startTime: string }) => `${s.dayOfWeek} ${s.startTime}`), ["1 09:00", "2 09:00"]);
});

test("affected people are told once; a retry and an unaffected teacher get nothing", async () => {
  const lead = await context("lead");
  const notices = async (key: string) => db.notification.count({ where: { userId: users.get(key)!.id, type: "TIMETABLE_CHANGED" } });
  for (const key of ["maya", "omar", "parent", "learner"]) assert.equal(await notices(key), 1, key);
  assert.equal(await notices("bystander"), 0);
  const version = await db.timetableVersion.findFirstOrThrow({ where: { timetableId: ids.tt7, version: 1 } });
  assert.ok(version.notifiedAt);
  const retry = await put(lead, ids.tt7, { action: "notify", versionId: version.id });
  assert.equal(retry.json.delivery.sent, false);
  for (const key of ["maya", "parent"]) assert.equal(await notices(key), 1, `${key} after retry`);
  await assert.rejects(db.timetableVersion.update({ where: { id: version.id }, data: { effectiveFrom: new Date("2030-01-01Z") } }), /immutable/);
});

test("draft edits and a future version leave everyone on the version in force until its date", async () => {
  const lead = await context("lead"), parent = await context("parent");
  const before = await preview(lead, ids.tt7);
  assert.equal((await put(lead, ids.tt7, { draftRevision: before.draftRevision, slots: [{ id: ids.s7mon1, subjectId: ids.math7, teacherId: users.get("maya")!.id }, { id: ids.s7mon2, subjectId: ids.eng7, teacherId: users.get("omar")!.id }] })).status, 200);
  const parentNow = async () => (await (await parent.request.get(`${base}/api/parent/timetable?studentId=${ids.pupil}`)).json()).data;
  assert.equal((await parentNow()).slots.find((s: { startTime: string; dayOfWeek: number }) => s.dayOfWeek === 1 && s.startTime === "08:15").subject.name, "English", "a draft edit does not reach families");
  const draft = await preview(lead, ids.tt7);
  assert.equal(draft.changes.length, 2);
  const nextWeek = plusDays(7);
  const future = await put(lead, ids.tt7, { action: "publish", draftRevision: draft.draftRevision, effectiveFrom: nextWeek });
  assert.equal(future.status, 200, JSON.stringify(future.json));
  const view = await parentNow();
  assert.equal(view.version.version, 1, "version 1 stays in force until next week");
  assert.deepEqual(view.upcoming, { version: 2, effectiveFrom: nextWeek });
  // On the effective date the scheduled version takes over.
  const onDate = await versionsFor(ids.tt7, nextWeek, db as never);
  assert.equal(onDate.inForce!.version, 2);
  assert.equal((await versionsFor(ids.tt7, today(), db as never)).inForce!.version, 1);
  assert.equal((await db.notification.count({ where: { userId: users.get("bystander")!.id, type: "TIMETABLE_CHANGED" } })), 0);
});

test("screens: draft status, blocked review with the clashing booking, Arabic review", async () => {
  // A fresh hard conflict on Grade 8: Omar now teaches Grade 7 at 09:00–09:45 in the draft.
  await db.timetableSlot.update({ where: { id: ids.s8mon3 }, data: { teacherId: users.get("omar")!.id } });
  const page = await (await context("lead")).newPage();
  await page.goto(`${base}/admin?view=timetable`);
  const pick = (p: Page, classId: string) => p.locator(`select:has(option[value="${classId}"])`).selectOption(classId, { timeout: 30_000 });
  await pick(page, class8);
  await page.locator("[data-publication-status]").waitFor({ timeout: 30_000 });
  assert.match(await page.locator("[data-publication-status]").innerText(), /not published yet/);
  await page.locator("[data-review-publish]").click();
  await page.locator('[data-publication-review] [data-hard-conflict]').first().waitFor();
  assert.equal(await page.locator("[data-confirm-publish]").isDisabled(), true);
  await shot(page, "01-review-blocked");
  await page.close();
  const ar = await (await context("lead-ar")).newPage();
  await ar.goto(`${base}/admin?view=timetable`);
  await ar.locator(`select:has(option[value="${class7}"])`).selectOption(class7, { timeout: 30_000 });
  await ar.locator("[data-publication-status]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await shot(ar, "02-status-ar");
  await ar.locator("[data-review-publish]").click();
  await ar.locator("[data-publication-changes]").waitFor();
  await shot(ar, "03-review-ar");
  await ar.close();
});
