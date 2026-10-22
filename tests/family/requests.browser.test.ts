import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-421 on the isolated app with synthetic families: leave for future days is decided by the school and
// never marks the register; trip permission is answered for one exact version under its signatory rule,
// a material change asks again and keeps the earlier answer, stale and late answers are refused, a guardian
// without the consent right cannot answer, retries return the same receipt, and records cannot be edited.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.FAMILY_TEST_APP || "http://localhost:3107";
const evidence = process.env.FAMILY_EVIDENCE_DIR || "/tmp/sko421-evidence";
const db = new PrismaClient(), password = "SyntheticFamily421!";
const schoolId = `family421-${randomUUID()}`, campusId = randomUUID(), classA = randomUUID(), classB = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
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
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (ctx: BrowserContext, method: "post" | "patch" | "get", path: string, data?: Record<string, unknown>) => { const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); return { status: r.status(), json: await r.json() }; };
const ymd = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();
const relate = async (studentId: string, guardianKey: string, permissions: Record<string, unknown>) => {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(guardianKey)!.id, createdByUserId: users.get("lead")!.id, fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: users.get("lead")!.id, reason: "Synthetic family fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: false, attendance: true, finances: false, communication: true, pickup: false, ...permissions } as never } });
};
const terms = (over: Record<string, unknown> = {}) => ({ title: "Synthetic museum visit", destination: "Synthetic City Museum", departAt: hours(72), returnAt: hours(78), respondBy: hours(48), costAmount: 1500, costCurrency: "PKR", contact: "Synthetic office, extension 12", instructions: "Packed lunch. School uniform.", consentKind: "fieldTrips", signatoryRule: "ALL_GUARDIANS", ...over });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Willow School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Willow North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("lead", "PRINCIPAL"); await user("office", "CAMPUS_ADMIN"); await user("teacher", "TEACHER"); await user("parent", "PARENT"); await user("coparent", "PARENT"); await user("otherParent", "PARENT"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classA, schoolId, campusId, name: "Grade 5", section: "A", academicYear: 2026, classTeacherId: users.get("teacher")!.id } });
  await db.class.create({ data: { id: classB, schoolId, campusId, name: "Grade 3", section: "B", academicYear: 2026 } });
  const pupil = async (key: string, name: string, classId: string) => { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId, classId, fullName: name, rollNo: key, gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); };
  await pupil("ali", "Synthetic Ali Noor", classA); await pupil("zoya", "Synthetic Zoya Noor", classB); await pupil("omar", "Synthetic Omar Saeed", classA);
  await relate(ids.ali, "parent", { consents: { medicalTreatment: false, fieldTrips: true, mediaPublication: false, offsiteTravel: false } });
  await relate(ids.zoya, "parent", {});
  await relate(ids.ali, "coparent", { consents: { medicalTreatment: false, fieldTrips: true, mediaPublication: false, offsiteTravel: false } });
  await relate(ids.omar, "otherParent", {});
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("leave for future days: the school decides, the register is untouched, the notice carries no reason", async () => {
  const parent = await context("parent"), lead = await context("lead"), teacher = await context("teacher");
  const asked = await call(parent, "post", "/api/family/leave", { studentId: ids.ali, fromDate: ymd(3), toDate: ymd(4), reason: "Synthetic family wedding out of town" });
  assert.equal(asked.status, 201, JSON.stringify(asked.json));
  assert.equal((await call(parent, "post", "/api/family/leave", { studentId: ids.ali, fromDate: ymd(4), toDate: ymd(5), reason: "Overlapping" })).status, 409);
  assert.equal((await call(parent, "post", "/api/family/leave", { studentId: ids.ali, fromDate: ymd(-3), toDate: ymd(-3), reason: "In the past" })).status, 400);
  assert.equal((await call(parent, "post", "/api/family/leave", { studentId: ids.omar, fromDate: ymd(3), toDate: ymd(3), reason: "Not my child" })).status, 404, "the wrong child is refused");
  const queue = await call(lead, "get", "/api/attendance/leave");
  const row = queue.json.data.find((r: { id: string }) => r.id === asked.json.data.id);
  assert.ok(row);
  assert.equal((await call(teacher, "post", "/api/attendance/leave", { id: row.id, action: "approve" })).status, 403);
  assert.equal((await call(lead, "post", "/api/attendance/leave", { id: row.id, action: "clarify", note: "Please confirm the return day" })).status, 200);
  assert.equal((await call(parent, "patch", "/api/family/leave", { id: row.id, action: "reply", reason: "Back on the second day by noon" })).status, 200);
  assert.equal((await call(lead, "post", "/api/attendance/leave", { id: row.id, action: "approve", knownVersion: 1 })).status, 409, "a stale review is refused");
  assert.equal((await call(lead, "post", "/api/attendance/leave", { id: row.id, action: "approve" })).status, 200);
  assert.equal((await db.learnerLeaveRequest.findUniqueOrThrow({ where: { id: row.id } })).status, "APPROVED");
  assert.equal(await db.attendance.count({ where: { schoolId, studentId: ids.ali } }), 0, "approval never marks the register");
  const notices = await db.notification.findMany({ where: { userId: users.get("parent")!.id, type: "LEARNER_LEAVE_DECIDED" } });
  assert.ok(notices.length >= 1);
  assert.ok(notices.every(n => !n.message.includes("wedding") && !n.message.includes("return day")), "no private detail in the notice");
  assert.equal((await call(parent, "patch", "/api/family/leave", { id: row.id, action: "cancel" })).status, 409, "a decided request cannot be cancelled");
});

test("trip permission: exact version, signatory rule, re-consent after a material change, stale and unauthorized answers", async () => {
  const parent = await context("parent"), coparent = await context("coparent"), lead = await context("lead");
  const created = await call(lead, "post", "/api/trips", { ...terms(), classIds: [classA] });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  ids.trip = created.json.data.id;
  await db.tripInvitee.create({ data: { schoolId, tripId: ids.trip, studentId: ids.zoya } });
  const key = `k-${randomUUID()}`;
  const first = await call(parent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.ali, version: 1, choice: "GRANTED", idempotencyKey: key });
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const retry = await call(parent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.ali, version: 1, choice: "GRANTED", idempotencyKey: key });
  assert.equal(retry.json.data.receiptCode, first.json.data.receiptCode, "a retried submission returns the same receipt");
  assert.equal(await db.tripConsent.count({ where: { tripId: ids.trip } }), 1);
  const roster = async () => (await call(lead, "get", `/api/trips?id=${ids.trip}`)).json.data as { rows: { studentId: string; status: string }[] };
  assert.equal((await roster()).rows.find(r => r.studentId === ids.ali)!.status, "PARTIAL", "every guardian must agree under this rule");
  assert.equal((await call(coparent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.ali, version: 1, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` })).status, 201);
  assert.equal((await roster()).rows.find(r => r.studentId === ids.ali)!.status, "GRANTED");
  assert.equal((await call(parent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.zoya, version: 1, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` })).status, 403, "no field-trip right for Zoya");
  // A material change: the return time moves. Earlier answers stay on record but no longer count.
  const revised = await call(lead, "patch", "/api/trips", { id: ids.trip, action: "revise", ...terms({ returnAt: hours(80) }), knownVersion: 1, material: true, changeNote: "Return two hours later" });
  assert.equal(revised.status, 200, JSON.stringify(revised.json));
  assert.equal((await roster()).rows.find(r => r.studentId === ids.ali)!.status, "PENDING");
  const stale = await call(parent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.ali, version: 1, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` });
  assert.equal(stale.status, 409); assert.match(stale.json.error, /version 2/);
  const mine = (await call(parent, "get", `/api/family/trips?studentId=${ids.ali}`)).json.data[0];
  assert.deepEqual([mine.version.version, mine.myAnswer, mine.earlierAnswer.version, mine.earlierAnswer.choice], [2, null, 1, "GRANTED"]);
  assert.equal((await call(parent, "post", "/api/family/trips", { tripId: ids.trip, studentId: ids.ali, version: 2, choice: "DECLINED", idempotencyKey: `k-${randomUUID()}` })).status, 201);
  assert.equal((await roster()).rows.find(r => r.studentId === ids.ali)!.status, "DECLINED", "a refusal stands");
  // A minor correction keeps the answers given to version 2.
  assert.equal((await call(lead, "patch", "/api/trips", { id: ids.trip, action: "revise", ...terms({ returnAt: hours(80), contact: "Synthetic office, extension 14" }), knownVersion: 2, material: false, changeNote: "Corrected the extension" })).status, 200);
  assert.equal((await roster()).rows.find(r => r.studentId === ids.ali)!.status, "DECLINED");
  assert.equal((await call(lead, "patch", "/api/trips", { id: ids.trip, action: "revise", ...terms(), knownVersion: 2, material: true, changeNote: "Stale" })).status, 409, "a revision from an older copy is refused");
  await assert.rejects(db.tripConsent.updateMany({ where: { tripId: ids.trip }, data: { choice: "GRANTED" } }), /immutable/);
  await assert.rejects(db.tripVersion.updateMany({ where: { tripId: ids.trip }, data: { title: "Edited" } }), /immutable/);
});

test("a late answer is refused; the family inbox shows trip and leave requests", async () => {
  const parent = await context("parent"), lead = await context("lead");
  // A trip whose answer deadline has already passed (inserted directly: the API refuses past deadlines).
  const trip = await db.trip.create({ data: { schoolId, campusId, createdById: users.get("lead")!.id, invitees: { create: [{ schoolId, studentId: ids.ali }] } } });
  await db.tripVersion.create({ data: { schoolId, tripId: trip.id, version: 1, title: "Synthetic late trip", destination: "Synthetic park", departAt: new Date(hours(24)), returnAt: new Date(hours(28)), respondBy: new Date(hours(-1)), contact: "Office", instructions: "", consentKind: "fieldTrips", signatoryRule: "ANY_GUARDIAN", publishedById: users.get("lead")!.id } });
  assert.equal((await call(parent, "post", "/api/family/trips", { tripId: trip.id, studentId: ids.ali, version: 1, choice: "GRANTED", idempotencyKey: `k-${randomUUID()}` })).status, 409);
  const inbox = (await call(parent, "get", "/api/parent/inbox")).json.data as { items: { id: string; kind: string; state: string; childId: string }[] };
  const tripItems = inbox.items.filter(i => i.kind === "TRIP_CONSENT");
  assert.equal(tripItems.find(i => i.id === `trip:${ids.trip}:${ids.ali}`)!.state, "COMPLETED");
  assert.equal(tripItems.find(i => i.id === `trip:${ids.trip}:${ids.zoya}`)!.state, "UPDATE", "no right to sign for Zoya: shown, not actionable");
  assert.equal(tripItems.find(i => i.id === `trip:${trip.id}:${ids.ali}`)!.state, "EXPIRED");
  assert.ok(inbox.items.some(i => i.kind === "LEAVE_REQUEST" && i.state === "COMPLETED"));
  void lead;
});

test("screens: changed trip notice and its review, staff roster, Arabic phone", async () => {
  // A third guardian joins now; under the version-3 terms they have not answered yet.
  await relate(ids.ali, "parent-ar", { consents: { medicalTreatment: false, fieldTrips: true, mediaPublication: false, offsiteTravel: false } });
  const page = await (await context("parent-ar", { width: 390, height: 844 })).newPage();
  // Trips and permissions live on Activities & trips (M90); leave stays on Attendance.
  await page.goto(`${base}/parent/activities`);
  await page.locator("[data-guardian-trips]").waitFor({ timeout: 30_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  await page.locator(`[data-trip="${ids.trip}"]`).scrollIntoViewIfNeeded();
  await shot(page, "01-trip-ar-390");
  await page.locator(`[data-trip="${ids.trip}"] [data-trip-choice="GRANTED"]`).click();
  await page.locator("[data-trip-review]").waitFor();
  await shot(page, "02-trip-review-ar");
  await page.locator("[data-trip-confirm]").click();
  await page.locator("[data-trip-receipt]").waitFor();
  await shot(page, "03-trip-receipt-ar");
  await page.close();
  const en = await (await context("parent")).newPage();
  await en.goto(`${base}/parent/activities`);
  await en.locator(`[data-trip="${ids.trip}"]`).waitFor({ timeout: 30_000 });
  await shot(en, "04a-family-trip-en");
  await en.goto(`${base}/parent/attendance`);
  await en.locator("[data-guardian-leave]").waitFor({ timeout: 30_000 });
  await en.locator("[data-guardian-leave]").scrollIntoViewIfNeeded();
  await shot(en, "04b-family-leave-en");
  await en.close();
  // Trips are campus operations (M53): the campus admin's Attendance view has a Trips tab; the
  // principal's Attendance shows the student registers only.
  const staff = await (await context("office")).newPage();
  await staff.goto(`${base}/admin?view=attendance`);
  await staff.locator('[data-tour="page.tab.trips"]').click({ timeout: 30_000 });
  await staff.locator(`[data-trip-row="${ids.trip}"] [data-trip-roster]`).click({ timeout: 30_000 });
  await staff.locator("[data-trip-roster-dialog]").waitFor();
  await shot(staff, "05-staff-trip-roster");
  await staff.close();
});
