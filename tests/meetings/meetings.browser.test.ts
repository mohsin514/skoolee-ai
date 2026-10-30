import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-420 on the isolated app with synthetic data: only guardians with the communication permission book
// the child's own teachers; lessons hide slots; two families racing for one slot get one booking; a retried
// booking is not duplicated; leave and a new lesson turn bookings into "needs a new time" with notices and
// an inbox item; a lost reschedule keeps the original; shared follow-up reaches the family without staff
// notes; family actions are completed by their owner only; reminders are sent once.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.MEETINGS_TEST_APP || "http://localhost:3107";
const evidence = process.env.MEETINGS_EVIDENCE_DIR || "/tmp/sko420-evidence";
const db = new PrismaClient(), password = "SyntheticMeet420!";
const schoolId = `meet420-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const TZ = "Asia/Karachi";
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const DAY = 86_400_000;
const localDate = (instant: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
// A meeting day a few days ahead that is not a Sunday, and the next one after it.
const pickDay = (from: number) => { for (let d = from; ; d++) { const day = localDate(new Date(Date.now() + d * DAY)); if (weekday(day) !== 7) return { day, offset: d }; } };
const first = pickDay(3), second = pickDay(first.offset + 1);
const D1 = first.day, D2 = second.day;
const karachi = (date: string, time: string) => new Date(`${date}T${time}:00+05:00`).toISOString(); // Asia/Karachi has no DST

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (ctx: BrowserContext, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); return { status: r.status(), json: await r.json().catch(() => ({})), text: "" }; };
const relate = async (studentId: string, guardianKey: string, communication = true) => {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(guardianKey)!.id, createdByUserId: users.get("teacher")!.id, fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: users.get("teacher")!.id, reason: "Synthetic meeting fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication, pickup: false } } });
};
type Family = { timezone: string; teachers: { id: string }[]; windows: { id: string; teacherId: string; localDate: string; cancellationPolicy: string; slots: { startsAt: string; start: string }[] }[]; bookings: { id: string; status: string; version: number; conflictReason: string | null; startsAt: string; mine: boolean; followUp: unknown; actions: { id: string; ownerRole: string; status: string }[] }[] };
const family = async (key: string, studentId: string) => { const r = await call(await context(key), "get", `/api/family/meetings?studentId=${studentId}`); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json.data as Family; };
const book = async (key: string, studentId: string, windowId: string, startsAt: string, requestKey = `k-${randomUUID()}`) => call(await context(key), "post", "/api/family/meetings", { action: "book", studentId, windowId, startsAt, requestKey, agenda: "Synthetic: reading confidence", mode: "IN_PERSON" });
const notices = async (key: string, type: string) => db.notification.count({ where: { userId: users.get(key)!.id, type } });
const policy = "Change or cancel up to one day before. Tell the office if you are running late.";

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Willow School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: TZ } as never });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Willow Main", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("teacher", "TEACHER"); await user("outsider", "TEACHER");
  await user("parentS", "PARENT"); await user("coparentS", "PARENT"); await user("limitedS", "PARENT"); await user("parentB", "PARENT"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 4", section: "A", academicYear: 2026, classTeacherId: users.get("teacher")!.id } });
  await db.subject.create({ data: { schoolId, campusId, classId, name: "Synthetic Reading", teacherId: users.get("teacher")!.id } });
  for (const [key, name, roll] of [["sara", "Synthetic Sara Khan", "401"], ["bilal", "Synthetic Bilal Shah", "402"]]) { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId, classId, fullName: name, rollNo: roll, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  await relate(ids.sara, "parentS"); await relate(ids.sara, "coparentS"); await relate(ids.sara, "limitedS", false); await relate(ids.bilal, "parentB"); await relate(ids.sara, "parent-ar");
  // A published lesson on D1's weekday, 14:15–14:25, hides that slot.
  const timetable = await db.timetable.create({ data: { schoolId, campusId, classId, academicYear: 2026, status: "PUBLISHED", publishedAt: new Date() } });
  ids.timetable = timetable.id;
  await db.timetableSlot.create({ data: { schoolId, timetableId: timetable.id, dayOfWeek: weekday(D1), periodNumber: 1, teacherId: users.get("teacher")!.id, startTime: "14:15", endTime: "14:25", slotType: "CLASS" } });
  ids.leaveType = (await db.leaveType.create({ data: { schoolId, campusId, name: "Synthetic casual" } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("teacher opens times; families see only the child's teachers and open slots; permission is checked", async () => {
  const teacher = await context("teacher");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "window", localDate: D1, startTime: "14:00", endTime: "14:45", slotMinutes: 10, bufferMinutes: 5, mode: "IN_PERSON", location: "Room 4" })).status, 400, "a cancellation policy is required");
  const made = await call(teacher, "post", "/api/meetings", { action: "window", localDate: D1, startTime: "14:00", endTime: "14:45", slotMinutes: 10, bufferMinutes: 5, mode: "IN_PERSON", location: "Room 4", cancellationPolicy: policy });
  assert.equal(made.status, 201, JSON.stringify(made.json)); ids.w1 = made.json.data.id;
  const outsider = await call(await context("outsider"), "post", "/api/meetings", { action: "window", localDate: D1, startTime: "09:00", endTime: "10:00", slotMinutes: 15, mode: "REMOTE", cancellationPolicy: policy });
  ids.wOut = outsider.json.data.id;
  const desk = (await call(teacher, "get", "/api/meetings")).json.data;
  assert.deepEqual(desk.windows[0].slots.map((s: { start: string; state: string }) => `${s.start}:${s.state}`), ["14:00:OPEN", "14:15:BLOCKED", "14:30:OPEN"], "a published lesson blocks its slot");
  const view = await family("parentS", ids.sara);
  assert.equal(view.timezone, TZ);
  assert.deepEqual(view.teachers.map(t => t.id), [users.get("teacher")!.id], "only the child's own teachers");
  assert.deepEqual(view.windows.map(w => w.id), [ids.w1]);
  assert.deepEqual(view.windows[0].slots.map(s => s.start), ["14:00", "14:30"]);
  assert.equal(view.windows[0].slots[0].startsAt, karachi(D1, "14:00"), "the exact instant of the school's 14:00");
  assert.equal(view.windows[0].cancellationPolicy, policy, "the policy is visible before booking");
  assert.equal((await call(await context("limitedS"), "get", `/api/family/meetings?studentId=${ids.sara}`)).status, 404, "no communication permission, no booking");
  assert.equal((await call(await context("parentB"), "get", `/api/family/meetings?studentId=${ids.sara}`)).status, 404, "another family's child");
  assert.equal((await book("parentS", ids.sara, ids.wOut, karachi(D1, "09:00"))).status, 409, "a teacher who does not teach the child cannot be booked");
  assert.equal((await book("parentS", ids.sara, ids.w1, karachi(D1, "14:15"))).status, 409, "a blocked slot cannot be booked");
});

test("two families race for one slot: one booking; a retried request is not duplicated", async () => {
  const [a, b] = await Promise.all([book("parentS", ids.sara, ids.w1, karachi(D1, "14:00"), "race-sara-0001"), book("parentB", ids.bilal, ids.w1, karachi(D1, "14:00"), "race-bilal-0001")]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409], JSON.stringify([a.json, b.json]));
  const loser = a.status === 409 ? a : b;
  assert.match(loser.json.error, /just booked/);
  assert.equal(await db.meetingBooking.count({ where: { schoolId, startsAt: new Date(karachi(D1, "14:00")) } }), 1);
  // Make Sara the 14:00 booking and Bilal 14:30 whichever won.
  const winnerIsSara = a.status === 201;
  const other = winnerIsSara ? await book("parentB", ids.bilal, ids.w1, karachi(D1, "14:30"), "bilal-1430-01") : await book("parentS", ids.sara, ids.w1, karachi(D1, "14:30"), "sara-1430-0001");
  assert.equal(other.status, 201);
  ids.saraBooking = (await db.meetingBooking.findFirstOrThrow({ where: { studentId: ids.sara } })).id;
  ids.bilalBooking = (await db.meetingBooking.findFirstOrThrow({ where: { studentId: ids.bilal } })).id;
  const saraKey = (await db.meetingBooking.findUniqueOrThrow({ where: { id: ids.saraBooking } })).requestKey;
  const retry = await book("parentS", ids.sara, ids.w1, karachi(D1, "14:00"), saraKey);
  assert.deepEqual([retry.status, retry.json.data.repeated, retry.json.data.id], [200, true, ids.saraBooking], "the same request returns the same booking");
  assert.equal((await book("parentS", ids.sara, ids.w1, karachi(D1, "14:30"))).status, 409, "the child already has a meeting with this teacher");
  assert.equal((await family("parentS", ids.sara)).windows.length, 0, "no open slots left");
  const co = await family("coparentS", ids.sara);
  assert.deepEqual([co.bookings.length, co.bookings[0].mine], [1, false], "the other guardian sees the booking but cannot change it");
  assert.equal((await call(await context("coparentS"), "post", "/api/family/meetings", { action: "cancel", bookingId: ids.saraBooking, knownVersion: 1 })).status, 404);
  assert.equal(await notices("teacher", "MEETING_BOOKED"), 2, "one notice per booking, none for the retry");
  assert.equal(await db.meetingBookingEvent.count({ where: { bookingId: ids.saraBooking } }), 1);
});

test("leave makes bookings need a new time; a lost reschedule keeps the original; a new lesson conflicts too", async () => {
  await db.leaveRequest.create({ data: { schoolId, campusId, userId: users.get("teacher")!.id, leaveTypeId: ids.leaveType, fromDate: new Date(`${D1}T00:00:00Z`), toDate: new Date(`${D1}T00:00:00Z`), status: "APPROVED", reviewedAt: new Date() } });
  const teacher = await context("teacher");
  const desk = (await call(teacher, "get", "/api/meetings")).json.data;
  assert.deepEqual(desk.bookings.map((b: { status: string; conflictReason: string }) => `${b.status}:${b.conflictReason}`), ["RESCHEDULE_NEEDED:LEAVE", "RESCHEDULE_NEEDED:LEAVE"]);
  assert.equal(await notices("parentS", "MEETING_NEEDS_RESCHEDULE_FAMILY"), 1);
  assert.equal(await notices("teacher", "MEETING_NEEDS_RESCHEDULE"), 2);
  await call(teacher, "get", "/api/meetings");
  assert.equal(await notices("parentS", "MEETING_NEEDS_RESCHEDULE_FAMILY"), 1, "told once");
  const inbox = (await call(await context("parentS"), "get", "/api/parent/inbox")).json.data;
  assert.ok(inbox.items.some((i: { kind: string; state: string }) => i.kind === "MEETING_RESCHEDULE" && i.state === "ACTION"), "the family inbox asks for a new time");
  const w2 = await call(teacher, "post", "/api/meetings", { action: "window", localDate: D2, startTime: "15:00", endTime: "15:20", slotMinutes: 20, mode: "EITHER", location: "Room 4", cancellationPolicy: policy });
  ids.w2 = w2.json.data.id;
  const sara = (await family("parentS", ids.sara)).bookings[0];
  const moved = await call(await context("parentS"), "post", "/api/family/meetings", { action: "reschedule", bookingId: ids.saraBooking, knownVersion: sara.version, windowId: ids.w2, startsAt: karachi(D2, "15:00"), mode: "REMOTE" });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  const bilal = (await family("parentB", ids.bilal)).bookings[0];
  const lost = await call(await context("parentB"), "post", "/api/family/meetings", { action: "reschedule", bookingId: ids.bilalBooking, knownVersion: bilal.version, windowId: ids.w2, startsAt: karachi(D2, "15:00"), mode: "IN_PERSON" });
  assert.equal(lost.status, 409, "the slot is taken");
  const kept = await db.meetingBooking.findUniqueOrThrow({ where: { id: ids.bilalBooking } });
  assert.deepEqual([kept.status, kept.startsAt.toISOString(), kept.version], ["RESCHEDULE_NEEDED", bilal.startsAt, bilal.version], "the original booking is untouched");
  assert.equal((await call(await context("parentS"), "post", "/api/family/meetings", { action: "cancel", bookingId: ids.saraBooking, knownVersion: sara.version })).status, 409, "a stale version is refused");
  const now = await db.meetingBooking.findUniqueOrThrow({ where: { id: ids.saraBooking } });
  assert.deepEqual([now.status, now.mode, now.version], ["CONFIRMED", "REMOTE", 3]);
  assert.deepEqual((await db.meetingBookingEvent.findMany({ where: { bookingId: ids.saraBooking }, orderBy: { version: "asc" } })).map(e => e.action), ["BOOKED", "CONFLICT", "RESCHEDULED"], "a versioned receipt of every change");
  assert.equal(await notices("teacher", "MEETING_MOVED"), 1);
  // A lesson published later at the new time conflicts as well.
  await db.timetableSlot.create({ data: { schoolId, timetableId: ids.timetable, dayOfWeek: weekday(D2), periodNumber: 2, teacherId: users.get("teacher")!.id, startTime: "15:05", endTime: "15:30", slotType: "CLASS" } });
  await call(teacher, "get", "/api/meetings");
  assert.deepEqual(Object.values(await db.meetingBooking.findUniqueOrThrow({ where: { id: ids.saraBooking }, select: { status: true, conflictReason: true } })), ["RESCHEDULE_NEEDED", "TIMETABLE"]);
  await db.timetableSlot.deleteMany({ where: { timetableId: ids.timetable, periodNumber: 2 } });
  // Bilal's family cancels; the teacher is told.
  const cancelled = await call(await context("parentB"), "post", "/api/family/meetings", { action: "cancel", bookingId: ids.bilalBooking, knownVersion: bilal.version });
  assert.equal(cancelled.status, 200);
  assert.equal(await notices("teacher", "MEETING_CANCELLED"), 1);
});

test("follow-up: shared summary and owned actions reach the family; staff notes never do", async () => {
  // A meeting that already happened.
  const past = new Date(Date.now() - 2 * DAY), pastDay = localDate(past);
  const w = await db.meetingWindow.create({ data: { schoolId, campusId, teacherId: users.get("teacher")!.id, localDate: pastDay, startTime: "10:00", endTime: "10:30", timezone: TZ, slotMinutes: 15, mode: "IN_PERSON", location: "Room 4", cancellationPolicy: policy, createdById: users.get("teacher")!.id } });
  const rel = await db.guardianRelationship.findFirstOrThrow({ where: { studentId: ids.sara, guardianUserId: users.get("parentS")!.id } });
  const held = await db.meetingBooking.create({ data: { schoolId, campusId, windowId: w.id, teacherId: users.get("teacher")!.id, studentId: ids.sara, guardianUserId: users.get("parentS")!.id, relationshipId: rel.id, startsAt: new Date(karachi(pastDay, "10:00")), endsAt: new Date(karachi(pastDay, "10:15")), mode: "IN_PERSON", requestKey: `past-${randomUUID()}`, status: "CONFIRMED" } });
  ids.held = held.id;
  const teacher = await context("teacher");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "followup", bookingId: held.id, summary: "x" })).status, 409, "record the meeting first");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "outcome", bookingId: held.id, outcome: "HELD" })).status, 200);
  const secret = "PRIVATE-STAFF-NOTE-420";
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "note", bookingId: held.id, body: `${secret}: synthetic observation for staff only` })).status, 201);
  const actions = [{ text: "Read aloud for ten minutes each evening", ownerRole: "FAMILY", dueDate: localDate(new Date(Date.now() + 7 * DAY)) }, { text: "Share a short reading log on Friday", ownerRole: "FAMILY", dueDate: localDate(new Date(Date.now() + 5 * DAY)) }, { text: "Send home two levelled readers", ownerRole: "STAFF", dueDate: localDate(new Date(Date.now() + 3 * DAY)) }];
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "followup", bookingId: held.id, summary: "We agreed to practise short explanations of what Sara reads.", actions: [...actions, ...actions] })).status, 400, "a small number of actions");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "followup", bookingId: held.id, summary: "We agreed to practise short explanations of what Sara reads.", actions })).status, 200);
  let view = await family("parentS", ids.sara);
  let row = view.bookings.find(b => b.id === held.id)!;
  assert.deepEqual([row.followUp, row.actions.length], [null, 0], "a draft is not visible to the family");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "share", bookingId: held.id })).status, 200);
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "share", bookingId: held.id })).json.data.shared, false, "shared once");
  assert.equal(await notices("parentS", "MEETING_FOLLOW_UP_SHARED"), 1);
  const raw = await (await context("parentS")).request.get(`${base}/api/family/meetings?studentId=${ids.sara}`);
  const body = await raw.text();
  assert.ok(!body.includes(secret) && !body.includes("notes"), "the guardian API carries no staff notes");
  view = JSON.parse(body).data; row = view.bookings.find(b => b.id === held.id)!;
  assert.equal(row.actions.length, 3);
  const familyAction = row.actions.find(a => a.ownerRole === "FAMILY")!, staffAction = row.actions.find(a => a.ownerRole === "STAFF")!;
  assert.equal((await call(await context("parentS"), "post", "/api/family/meetings", { action: "action-done", actionId: staffAction.id })).status, 404, "a family completes only its own actions");
  assert.equal((await call(await context("parentB"), "post", "/api/family/meetings", { action: "action-done", actionId: familyAction.id })).status, 404);
  assert.equal((await call(await context("parentS"), "post", "/api/family/meetings", { action: "action-done", actionId: familyAction.id })).status, 200);
  const done = await db.meetingAction.findUniqueOrThrow({ where: { id: familyAction.id } });
  assert.deepEqual([done.status, done.completedById], ["DONE", users.get("parentS")!.id], "completion history kept");
  assert.equal((await call(teacher, "post", "/api/meetings", { action: "action-done", actionId: staffAction.id })).status, 200);
  const inbox = (await call(await context("parentS"), "get", "/api/parent/inbox")).json.data;
  assert.equal(inbox.items.filter((i: { kind: string; state: string }) => i.kind === "MEETING_ACTION" && i.state === "ACTION").length, 1, "the remaining family action is in the inbox");
  assert.equal((await db.meetingBooking.findUniqueOrThrow({ where: { id: held.id } })).status, "HELD", "no automatic label");
});

test("reminders are sent once per meeting", async () => {
  const soon = new Date(Date.now() + 3 * 3_600_000), soonDay = localDate(soon);
  const w = await db.meetingWindow.create({ data: { schoolId, campusId, teacherId: users.get("teacher")!.id, localDate: soonDay, startTime: "00:00", endTime: "23:50", timezone: TZ, slotMinutes: 10, mode: "REMOTE", cancellationPolicy: policy, createdById: users.get("teacher")!.id } });
  const rel = await db.guardianRelationship.findFirstOrThrow({ where: { studentId: ids.bilal, guardianUserId: users.get("parentB")!.id } });
  await db.meetingBooking.create({ data: { schoolId, campusId, windowId: w.id, teacherId: users.get("teacher")!.id, studentId: ids.bilal, guardianUserId: users.get("parentB")!.id, relationshipId: rel.id, startsAt: soon, endsAt: new Date(soon.getTime() + 600_000), mode: "REMOTE", requestKey: `soon-${randomUUID()}` } });
  const ctx = await browser.newContext();
  const [r1, r2] = await Promise.all([ctx.request.post(`${base}/api/cron/meeting-reminders`), ctx.request.post(`${base}/api/cron/meeting-reminders`)]);
  assert.deepEqual([r1.status(), r2.status()], [200, 200]);
  await ctx.request.post(`${base}/api/cron/meeting-reminders`);
  assert.equal(await notices("parentB", "MEETING_REMINDER_FAMILY"), 1);
  assert.equal(await notices("teacher", "MEETING_REMINDER"), 1);
  await ctx.close();
  await db.meetingWindow.update({ where: { id: w.id }, data: { status: "WITHDRAWN" } });
});

test("screens: family booking with both clocks (EN, mobile, Arabic) and the teacher desk", async () => {
  // Re-open a slot for the screenshots: Sara's moved meeting conflicted; withdraw nothing, add a new window.
  const teacher = await context("teacher");
  await call(teacher, "post", "/api/meetings", { action: "window", localDate: D2, startTime: "16:00", endTime: "16:45", slotMinutes: 15, mode: "EITHER", location: "Room 4", cancellationPolicy: policy });
  const ctx = await context("parentS", { timezoneId: "Europe/London" }), page = await ctx.newPage();
  await page.goto(`${base}/parent/meetings`);
  await page.locator("[data-family-meetings] [data-meeting-slot]").first().waitFor();
  await page.locator("[data-family-meetings]").scrollIntoViewIfNeeded();
  await shot(page, "01-family-slots-en");
  await page.locator("[data-family-meetings] [data-meeting-slot]").first().click();
  await page.locator("[data-meeting-confirm]").waitFor();
  assert.ok((await page.locator("[data-meeting-confirm]").innerText()).includes(policy), "the policy is shown before booking");
  await shot(page, "02-family-review-en");
  await page.close();
  const mobile = await (await context("parentS", { viewport: { width: 390, height: 844 } })).newPage();
  await mobile.goto(`${base}/parent/meetings`);
  await mobile.locator("[data-family-meetings] [data-meeting-conflict]").first().waitFor();
  await mobile.locator("[data-family-meetings]").scrollIntoViewIfNeeded();
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(mobile, "03-family-needs-new-time-mobile");
  await mobile.close();
  const ar = await (await context("parent-ar")).newPage();
  await ar.goto(`${base}/parent/meetings`);
  await ar.locator("[data-family-meetings] [data-meeting-slot]").first().waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-family-meetings]").scrollIntoViewIfNeeded();
  await shot(ar, "04-family-slots-ar");
  await ar.close();
  const desk = await teacher.newPage();
  await desk.goto(`${base}/teacher/calendar`);
  await desk.locator(`[data-booking="${ids.held}"] [data-booking-open]`).click();
  await desk.locator("[data-staff-notes]").waitFor();
  await shot(desk, "05-teacher-followup-and-private-notes");
  await desk.close();
});
