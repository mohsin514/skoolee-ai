import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-423 on the isolated app with synthetic data: a weekly draft uses only released evidence and leaves out
// a child with nothing released; the teacher rewords, adds one home activity and approves an exact version
// (an edit reopens review); sending delivers once per child, guardian and channel and a retry adds nothing;
// a withdrawn source blocks that child's update and revoked access gets nothing; the notice carries no
// evidence; families read only while their access lasts; a scheduled digest is sent by the cron once.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.DIGEST_TEST_APP || "http://localhost:3107";
const evidence = process.env.DIGEST_EVIDENCE_DIR || "/tmp/sko423-evidence";
const db = new PrismaClient(), password = "SyntheticDigest423!";
const schoolId = `digest423-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const DAY = 86_400_000;
const mondayOf = (d: Date) => { const iso = d.getUTCDay() || 7; return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (iso - 1) * DAY); };
const thisWeek = mondayOf(new Date()), lastWeek = new Date(thisWeek.getTime() - 7 * DAY), twoWeeksAgo = new Date(thisWeek.getTime() - 14 * DAY);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

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
const relate = async (studentId: string, guardianKey: string) => {
  const relationship = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: users.get(guardianKey)!.id, createdByUserId: users.get("teacher")!.id, fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: users.get("teacher")!.id, reason: "Synthetic digest fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  return relationship.id;
};
/** A released assignment with a submission and feedback returned at `returnedAt`. */
async function returnedFeedback(studentId: string, title: string, returnedAt: Date) {
  const teacher = users.get("teacher")!.id, assignmentId = randomUUID();
  await db.assignment.create({ data: { id: assignmentId, schoolId, campusId, classId, title, instructions: "Synthetic.", status: "RELEASED", ownerId: teacher, currentVersion: 1 } });
  await db.assignmentRubricVersion.create({ data: { schoolId, assignmentId, version: 1, criteria: [{ id: "clarity", title: "Clarity", description: "", maxPoints: 10 }], totalPoints: 10, createdById: teacher } });
  await db.assignmentVersion.create({ data: { schoolId, assignmentId, version: 1, title, instructions: "Synthetic.", rubricVersion: 1, audience: [studentId], submissionMode: "ONLINE", allowedTypes: [], timezone: "Asia/Karachi", opensAt: new Date(returnedAt.getTime() - 5 * DAY), dueAt: new Date(returnedAt.getTime() - DAY), dueLocal: "2026-01-01T09:00", latePolicy: "ACCEPT_FLAGGED", resubmission: "AFTER_RETURN", resourceIds: [], releasedById: teacher } });
  const submission = await db.assignmentSubmission.create({ data: { schoolId, assignmentId, studentId, status: "RETURNED", latestVersion: 1 } });
  const sv = await db.assignmentSubmissionVersion.create({ data: { schoolId, submissionId: submission.id, assignmentId, studentId, version: 1, assignmentVersion: 1, rubricVersion: 1, mode: "ONLINE", idempotencyKey: `idem-${randomUUID()}`, receiptCode: `R-${randomUUID().slice(0, 8)}`, text: "Synthetic answer.", artifactSha256: createHash("sha256").update(randomUUID()).digest("hex"), receivedAt: new Date(returnedAt.getTime() - 2 * DAY), effectiveDueAt: new Date(returnedAt.getTime() - DAY), late: false, recordedById: studentId } });
  return (await db.assignmentFeedback.create({ data: { schoolId, submissionVersionId: sv.id, rubricVersion: 1, criteria: [], comment: "Synthetic comment", totalPoints: 8, status: "RETURNED", markerId: teacher, returnedAt } })).id;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Lahore" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await user("teacher", "TEACHER"); await user("otherTeacher", "TEACHER"); await user("parentS", "PARENT"); await user("coparentS", "PARENT"); await user("parentB", "PARENT"); await user("parent-ar", "PARENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "C", academicYear: 2026, classTeacherId: users.get("teacher")!.id } });
  for (const [key, name, roll] of [["sara", "Synthetic Sara Malik", "601"], ["bilal", "Synthetic Bilal Malik", "602"]]) { ids[key] = randomUUID(); await db.student.create({ data: { id: ids[key], schoolId, campusId, classId, fullName: name, rollNo: roll, gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never }); }
  ids.relS = await relate(ids.sara, "parentS"); ids.relCo = await relate(ids.sara, "coparentS"); ids.relB = await relate(ids.bilal, "parentB"); await relate(ids.sara, "parent-ar");
  // This week: Sara has returned feedback and two recorded days; Bilal has nothing released.
  ids.fbThis = await returnedFeedback(ids.sara, "Synthetic fractions worksheet", new Date(Math.min(Date.now() - 60_000, thisWeek.getTime() + DAY)));
  for (const [d, status] of [[thisWeek, "PRESENT"], [new Date(thisWeek.getTime() + DAY), "ABSENT"]] as const) if (d.getTime() <= Date.now()) await db.attendance.create({ data: { schoolId, campusId, classId, studentId: ids.sara, date: d, status } });
  // Last week: Sara's feedback (to be withdrawn) and Bilal's attendance.
  ids.fbLast = await returnedFeedback(ids.sara, "Synthetic plant journal", new Date(lastWeek.getTime() + 2 * DAY));
  await db.attendance.create({ data: { schoolId, campusId, classId, studentId: ids.bilal, date: new Date(lastWeek.getTime() + DAY), status: "PRESENT" } });
  // Two weeks ago: Bilal's attendance, for the scheduled run.
  await db.attendance.create({ data: { schoolId, campusId, classId, studentId: ids.bilal, date: new Date(twoWeeksAgo.getTime() + DAY), status: "PRESENT" } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

type Entry = { id: string; studentId: string; skipped: boolean; status: string; content: { statements: { id: string; kind: string; text: string }[]; nextStep: unknown; noEvidence: boolean }; deliveries: unknown[] };
type Digest = { id: string; status: string; version: number; approvedVersion: number | null; entries: Entry[] };
const getDigest = async (ctx: BrowserContext, id: string) => (await call(ctx, "get", `/api/digests/${id}`)).json.data as Digest;
const step = { objective: "Explain one fraction model aloud using a drawing", minutes: 10, materials: "Paper and a pencil", alternative: "Talk it through at drop-off with the class teacher" };

test("released evidence only; reviewed, approved for an exact version, delivered once per guardian", async () => {
  const teacher = await context("teacher");
  assert.equal((await call(await context("otherTeacher"), "post", "/api/digests", { classId, week: ymd(thisWeek) })).status, 403);
  const prepared = await call(teacher, "post", "/api/digests", { classId, week: ymd(thisWeek) });
  assert.equal(prepared.status, 201, JSON.stringify(prepared.json));
  ids.digest = prepared.json.data.id;
  let digest = await getDigest(teacher, ids.digest);
  const sara = digest.entries.find(e => e.studentId === ids.sara)!, bilal = digest.entries.find(e => e.studentId === ids.bilal)!;
  assert.ok(sara.content.statements.some(s => s.kind === "FEEDBACK") && sara.content.statements.some(s => s.kind === "ATTENDANCE"), JSON.stringify(sara.content));
  assert.equal(sara.skipped, false);
  assert.deepEqual([bilal.skipped, bilal.content.noEvidence, bilal.content.statements.length], [true, true, 0], "no released evidence: left out, nothing invented");
  const feedback = sara.content.statements.find(s => s.kind === "FEEDBACK")!;
  const bad = await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "edit", knownVersion: digest.version, entryId: sara.id, nextStep: { objective: "Do it", minutes: 90, alternative: "" } });
  assert.equal(bad.status, 400, "a home activity needs purpose, time and an alternative");
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "edit", knownVersion: digest.version, entryId: sara.id, statements: { [feedback.id]: "Sara explained her fraction models clearly in the returned worksheet." }, nextStep: step })).status, 200);
  digest = await getDigest(teacher, ids.digest);
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "approve", knownVersion: digest.version - 1 })).status, 409, "approval binds to the version reviewed");
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "approve", knownVersion: digest.version })).status, 200);
  digest = await getDigest(teacher, ids.digest);
  assert.equal(digest.approvedVersion, digest.version);
  // An edit after approval reopens review.
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "edit", knownVersion: digest.version, entryId: sara.id, nextStep: step })).status, 200);
  digest = await getDigest(teacher, ids.digest);
  assert.deepEqual([digest.status, digest.approvedVersion], ["DRAFT", null]);
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "send", knownVersion: digest.version })).status, 409, "an unapproved version is not sent");
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "approve", knownVersion: digest.version })).status, 200);
  digest = await getDigest(teacher, ids.digest);
  const sent = await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "send", knownVersion: digest.version });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  assert.equal(sent.json.data.delivered, 3, "Sara's three guardians; Bilal was left out");
  const retry = await call(teacher, "patch", `/api/digests/${ids.digest}`, { action: "send", knownVersion: digest.version });
  assert.equal(retry.json.data.delivered ?? 0, 0, "a retry delivers nothing new");
  assert.equal(await db.familyDigestDelivery.count({ where: { digestId: ids.digest } }), 3);
  const notices = await db.notification.findMany({ where: { userId: users.get("parentS")!.id, type: "FAMILY_DIGEST_READY" } });
  assert.equal(notices.length, 1);
  assert.ok(!notices[0].message.includes("fraction") && !notices[0].message.includes("Sara"), "the notice names no evidence");
});

test("families read their own child's update only while access lasts", async () => {
  const parent = await context("parentS");
  const rows = (await call(parent, "get", `/api/family/digests?studentId=${ids.sara}`)).json.data;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content.nextStep.minutes, 10);
  assert.equal(rows[0].reviewedBy, "Synthetic teacher");
  assert.equal((await call(await context("parentB"), "get", `/api/family/digests?studentId=${ids.sara}`)).status, 404, "another family cannot read it");
  assert.ok((await db.familyDigestDelivery.findFirstOrThrow({ where: { digestId: ids.digest, guardianUserId: users.get("parentS")!.id } })).seenAt, "first read is recorded separately from delivery");
});

test("a withdrawn source blocks that child's update; revoked access gets nothing", async () => {
  const teacher = await context("teacher");
  const prepared = await call(teacher, "post", "/api/digests", { classId, week: ymd(lastWeek) });
  ids.last = prepared.json.data.id;
  let digest = await getDigest(teacher, ids.last);
  assert.ok(digest.entries.find(e => e.studentId === ids.sara)!.content.statements.some(s => s.kind === "FEEDBACK"));
  assert.equal(digest.entries.find(e => e.studentId === ids.bilal)!.skipped, false, "Bilal had attendance last week");
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.last}`, { action: "approve", knownVersion: digest.version })).status, 200);
  digest = await getDigest(teacher, ids.last);
  // After approval: Bilal's register for the week is corrected, and one of Sara's guardians loses access.
  await db.attendance.updateMany({ where: { studentId: ids.bilal, date: new Date(lastWeek.getTime() + DAY) }, data: { status: "ABSENT" } });
  await db.guardianRelationship.update({ where: { id: ids.relCo }, data: { status: "SUSPENDED" } });
  const sent = await call(teacher, "patch", `/api/digests/${ids.last}`, { action: "send", knownVersion: digest.version });
  assert.equal(sent.status, 200);
  assert.deepEqual([sent.json.data.delivered, sent.json.data.blocked], [2, 1], "Sara's two guardians with access; Bilal's update is stale");
  digest = await getDigest(teacher, ids.last);
  assert.deepEqual([digest.entries.find(e => e.studentId === ids.bilal)!.status, digest.entries.find(e => e.studentId === ids.sara)!.status], ["BLOCKED", "SENT"]);
  assert.equal(await db.familyDigestDelivery.count({ where: { digestId: ids.last, guardianUserId: users.get("coparentS")!.id } }), 0, "revoked access receives nothing");
  assert.equal(await db.familyDigestDelivery.count({ where: { digestId: ids.last, studentId: ids.bilal } }), 0);
});

test("a scheduled digest is sent by the cron once", async () => {
  const teacher = await context("teacher");
  const prepared = await call(teacher, "post", "/api/digests", { classId, week: ymd(twoWeeksAgo) });
  ids.older = prepared.json.data.id;
  let digest = await getDigest(teacher, ids.older);
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.older}`, { action: "approve", knownVersion: digest.version })).status, 200);
  digest = await getDigest(teacher, ids.older);
  assert.equal((await call(teacher, "patch", `/api/digests/${ids.older}`, { action: "schedule", knownVersion: digest.version, at: new Date(Date.now() + 1500).toISOString() })).status, 200);
  const cron = await browser.newContext();
  const early = await (await cron.request.post(`${base}/api/cron/family-digests`)).json();
  assert.ok(!early.results.some((r: { id: string }) => r.id === ids.older), "not before its time");
  await new Promise(resolve => setTimeout(resolve, 2000));
  const run = await (await cron.request.post(`${base}/api/cron/family-digests`)).json();
  assert.equal(run.results.find((r: { id: string }) => r.id === ids.older).delivered, 1);
  const again = await (await cron.request.post(`${base}/api/cron/family-digests`)).json();
  assert.ok(!again.results.some((r: { id: string }) => r.id === ids.older));
  assert.equal(await db.familyDigestDelivery.count({ where: { digestId: ids.older } }), 1);
  await cron.close();
});

test("screens: teacher review and the family update in Arabic", async () => {
  const page = await (await context("teacher")).newPage();
  // The weekly family update moved to Calendar & meetings (M66).
  await page.goto(`${base}/teacher/calendar`);
  const review = page.locator("[data-digest-review]");
  await review.waitFor({ timeout: 30_000 });
  await review.locator('input[type="date"]').fill(ymd(thisWeek));
  await review.locator("[data-digest-prepare]").click();
  await review.locator(`[data-digest-entry="${ids.sara}"]`).waitFor();
  await review.scrollIntoViewIfNeeded();
  await shot(page, "01-teacher-review-sent");
  await review.locator(`[data-digest-entry="${ids.sara}"] [data-digest-preview]`).click();
  await page.locator("[data-digest-card]").waitFor();
  await shot(page, "02-family-preview");
  await page.close();
  const ar = await (await context("parent-ar", { width: 390, height: 844 })).newPage();
  await ar.goto(`${base}/parent`);
  await ar.locator("[data-guardian-digest]").waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  await ar.locator("[data-guardian-digest]").scrollIntoViewIfNeeded();
  await shot(ar, "03-family-update-ar-390");
  await ar.close();
});
