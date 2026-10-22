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
import { familyLearningActions } from "../../src/lib/learning/actions";

// SKO-425 on the isolated app: a learning action needs learner-specific evidence, a goal, a responsible
// adult and dates; only a leader activates it and AI suggestions stay drafts; families see only what was
// explicitly shared; missed check-ins stay in the owner's list and the principal queue until recorded or
// rescheduled; ownership moves explicitly; the review separates participation from outcome, needs a
// reason, refuses a closure without follow-up evidence and never claims causation.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ACTIONS_TEST_APP || "http://localhost:3108";
const evidence = process.env.ACTIONS_EVIDENCE_DIR || "/tmp/sko425-evidence";
const db = new PrismaClient(), password = "SyntheticActions425!";
const schoolId = `la425-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const day = (offset: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}
const id = (key: string) => users.get(key)!.id;
const save = async (key: string, body: object) => (await context(key)).request.post(`${base}/api/learning-actions`, { data: body });
const act = async (key: string, action: string, data: object) => (await context(key)).request.post(`${base}/api/learning-actions/${ids.plan}`, { data: { action, data } });
const detail = async (key = "owner") => (await (await (await context(key)).request.get(`${base}/api/learning-actions/${ids.plan}`)).json()).data;
const shot = async (page: Page, name: string, locator: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.locator(locator).screenshot({ path: `${evidence}/${name}.png` }); };
const draft = (extra: object = {}) => ({ version: 0, studentId: ids.pupil, title: "Equivalent fractions", concern: "Adds denominators when comparing fractions.", evidenceState: "CONFIRMED", evidenceRefs: [{ kind: "MARK", refId: ids.mark, label: "Fractions quiz, item 3" }], ...extra });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Rowan Support School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Rowan Main", regId: campusId, city: "Karachi" } });
  await user("owner", "TEACHER"); await user("colleague", "TEACHER"); await user("leader", "CAMPUS_ADMIN"); await user("leader-ar", "CAMPUS_ADMIN", "ar");
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  ids.cls = (await db.class.create({ data: { schoolId, campusId, name: "Six", section: "A", academicYear: 2026, classTeacherId: id("owner") } })).id;
  ids.other = (await db.class.create({ data: { schoolId, campusId, name: "Six", section: "B", academicYear: 2026 } })).id;
  ids.subject = (await db.subject.create({ data: { schoolId, campusId, classId: ids.cls, name: "Mathematics", teacherId: id("owner") } })).id;
  await db.subject.create({ data: { schoolId, campusId, classId: ids.other, name: "Mathematics", teacherId: id("colleague") } });
  ids.pupil = (await db.student.create({ data: { schoolId, campusId, classId: ids.cls, fullName: "Synthetic Zoya Rowan", rollNo: "RW-1", gender: "OTHER", enrollmentDate: new Date("2026-04-01Z") } })).id;
  ids.peer = (await db.student.create({ data: { schoolId, campusId, classId: ids.cls, fullName: "Synthetic Omar Rowan", rollNo: "RW-2", gender: "OTHER", enrollmentDate: new Date("2026-04-01Z") } })).id;
  const exam = await db.exam.create({ data: { schoolId, campusId, classId: ids.cls, subjectId: ids.subject, title: "Fractions quiz", term: "TERM_1", academicYear: 2026, examType: "CLASS_TEST", status: "LOCKED" } });
  ids.mark = (await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: ids.pupil, subjectId: ids.subject, marksObtained: 3 } })).id;
  ids.peerMark = (await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId: ids.peer, subjectId: ids.subject, marksObtained: 9 } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("activation needs evidence, goal, owner and dates; only a leader activates; AI suggestions stay drafts", async () => {
  assert.equal((await save("colleague", draft())).status(), 403, "a teacher plans only for learners they teach");
  assert.equal((await save("owner", draft({ evidenceRefs: [{ kind: "MARK", refId: ids.peerMark, label: "Someone else's mark" }] }))).status(), 400, "evidence must be the learner's own");
  const created = await save("owner", draft());
  assert.equal(created.status(), 201, await created.text());
  ids.plan = (await created.json()).data.id;
  assert.equal((await act("owner", "activate", { version: 1 })).status(), 403);
  const incomplete = await act("leader", "activate", { version: 1 });
  assert.equal(incomplete.status(), 409);
  assert.match((await incomplete.json()).error, /a specific goal, a responsible adult, a review date in the future/);
  const complete = await save("owner", draft({ id: ids.plan, version: 1, goal: "Explain equivalent fractions using two examples.", ownerId: id("owner"), reviewDate: day(14), nextCheckInDate: day(3),
    baseline: { measure: "Fraction comparison items correct", value: 1, denominator: 5, takenOn: day(-1), source: "Fractions quiz" }, plannedActivity: "Ten minutes of fraction-wall practice, three times a week.", minutesPerWeek: 30,
    familyShare: { goal: "Explain equivalent fractions with two examples.", action: "Fold paper strips into halves and quarters together." }, privateNotes: "Confidential: hearing assessment requested." }));
  assert.equal((await complete.json()).data.version, 2);
  assert.equal((await act("leader", "activate", { version: 1 })).status(), 409, "a stale version is refused");
  assert.equal((await act("leader", "activate", { version: 2 })).status(), 200);
  assert.equal((await detail()).status, "ACTIVE");
  const ai = await db.interventionPlan.create({ data: { schoolId, campusId, studentId: ids.pupil, createdBy: id("leader"), title: "AI suggestion", summary: "The learner may need fraction practice.", origin: "AI", status: "DRAFT" } });
  const refused = await (await context("leader")).request.post(`${base}/api/learning-actions/${ai.id}`, { data: { action: "activate", data: { version: 1 } } });
  assert.equal(refused.status(), 409, "an AI paragraph alone cannot become an active plan");
});

test("families see only the shared goal and action; private notes never leave staff", async () => {
  const before = await runUnscoped("test", () => familyLearningActions(ids.pupil, schoolId));
  assert.deepEqual(before, [], "nothing is visible until shared");
  const plan = await detail();
  assert.equal((await act("owner", "share", { version: plan.version })).status(), 200);
  const shared = await runUnscoped("test", () => familyLearningActions(ids.pupil, schoolId));
  assert.equal(shared.length, 1);
  assert.deepEqual(Object.keys(shared[0]).sort(), ["action", "active", "goal", "id", "reviewDate", "sharedAt"]);
  assert.ok(!JSON.stringify(shared).includes("Confidential"), "private notes are never part of the family view");
  const current = await detail();
  await save("owner", draft({ id: ids.plan, version: current.version, goal: current.goal, ownerId: current.ownerId, reviewDate: current.reviewDate, nextCheckInDate: current.nextCheckInDate, baseline: current.baseline,
    familyShare: { goal: "Explain equivalent fractions with three examples.", action: "Fold paper strips into halves and quarters together." } }));
  assert.deepEqual(await runUnscoped("test", () => familyLearningActions(ids.pupil, schoolId)), [], "changed family text must be shared again");
});

test("a missed check-in stays visible to the owner and the principal queue until recorded or rescheduled", async () => {
  await db.interventionPlan.update({ where: { id: ids.plan }, data: { nextCheckInDate: new Date(`${day(-2)}T00:00:00Z`) } });
  const listed = (await (await (await context("owner")).request.get(`${base}/api/learning-actions`)).json()).data.actions;
  assert.equal(listed.find((r: { id: string }) => r.id === ids.plan).checkInOverdue, true);
  const queue = async () => (await (await (await context("leader")).request.get(`${base}/api/principal/queue?campusId=${campusId}`)).json()).data.items as { type: string; sourceId: string }[];
  assert.ok((await queue()).some(i => i.type === "SUPPORT_CHECKIN" && i.sourceId === ids.plan), "the principal queue shows the missed check-in");
  let plan = await detail();
  assert.equal((await act("owner", "reschedule", { version: plan.version, nextCheckInDate: day(2), reason: "short" })).status(), 400);
  assert.equal((await act("owner", "check-in", { version: plan.version, dueOn: day(-2), delivered: true, minutes: 10, participation: "FULL", adjustment: "Used larger fraction strips.", pupilFeedback: null, nextCheckInDate: day(5) })).status(), 200);
  plan = await detail();
  assert.equal(plan.checkIns.length, 1);
  assert.ok(!(await queue()).some(i => i.type === "SUPPORT_CHECKIN" && i.sourceId === ids.plan), "recording the check-in clears the queue item");
});

test("ownership moves explicitly; the review separates participation from outcome, needs reasons and never claims causation", async () => {
  let plan = await detail();
  assert.equal((await act("leader", "handoff", { version: plan.version, ownerId: id("colleague"), reason: "Owner moves to the junior section this term." })).status(), 200);
  assert.equal((await (await context("owner")).request.get(`${base}/api/learning-actions/${ids.plan}`)).status(), 404, "the previous owner no longer manages it");
  plan = await detail("colleague");
  assert.equal(plan.ownerId, id("colleague"));
  assert.equal((await act("colleague", "check-in", { version: plan.version, dueOn: day(0), delivered: false, minutes: null, participation: "ABSENT", adjustment: null, pupilFeedback: null, nextCheckInDate: day(4) })).status(), 200);
  plan = await detail("colleague");
  const closeWithout = await act("colleague", "review", { version: plan.version, decision: "CLOSE", reason: "Family reports the practice was completed at home.", followUp: null, limitations: "", nextReviewDate: null, nextOwnerId: null });
  assert.equal(closeWithout.status(), 409, "participation alone cannot close the action as reviewed");
  const extend = { version: plan.version, decision: "EXTEND", reason: "One absence; continue practice before judging.", followUp: null, limitations: "Absent for one session.", nextReviewDate: day(21), nextOwnerId: null };
  const race = await Promise.all([act("colleague", "review", extend), act("leader", "review", extend)]);
  assert.deepEqual(race.map(r => r.status()).sort(), [200, 409], "one decision wins a race");
  plan = await detail("colleague");
  const closed = await act("colleague", "review", { version: plan.version, decision: "INCONCLUSIVE", reason: "Follow-up quiz used different item types; cannot compare fairly.",
    followUp: { measure: "Fraction comparison items correct", value: 4, denominator: 5, takenOn: day(0), source: "Follow-up check", comparable: false, differences: "Picture-based items instead of numeric ones" }, limitations: "Different item types; one absence.", nextReviewDate: null, nextOwnerId: null });
  assert.equal(closed.status(), 200, await closed.text());
  const outcome = (await closed.json()).data.outcome;
  assert.deepEqual(outcome.participation, { checkIns: 2, delivered: 1, minutes: 10, absent: 1 });
  assert.match(outcome.note, /does not show that the action caused/);
  plan = await detail("colleague");
  assert.equal(plan.status, "CLOSED");
  const kinds = plan.events.map((e: { kind: string }) => e.kind);
  for (const kind of ["CREATED", "EDITED", "ACTIVATED", "SHARED_WITH_FAMILY", "CHECK_IN", "OWNER_CHANGED", "REVIEW_EXTEND", "REVIEW_INCONCLUSIVE"]) assert.ok(kinds.includes(kind), `${kind} is kept in history`);
  assert.ok(plan.events.every((e: { snapshot: unknown; kind: string }) => e.kind.startsWith("SUGGESTION") || e.snapshot), "each version keeps a snapshot");
});

test("the learning actions panel reads clearly in English and Arabic", async () => {
  await save("owner", draft({ title: "Reading fluency", evidenceRefs: [{ kind: "OBSERVATION", refId: "obs-1", label: "Reads two-syllable words slowly during guided reading." }], evidenceState: "NEEDS_OBSERVATION" }));
  const page = await (await context("owner")).newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/teacher/insights`);
  const panel = page.locator("[data-learning-actions]");
  await panel.locator("[data-action]").first().waitFor({ timeout: 30_000 });
  await panel.locator("[data-action]").first().getByRole("button", { name: "Open" }).click();
  await panel.locator("[data-panel] [data-stage=evidence]").waitFor({ timeout: 15_000 });
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "learning-actions-teacher-en-1440", "[data-learning-actions]");
  assert.deepEqual(errors, []);
  await page.close();
  const ar = await (await context("leader-ar", { width: 390, height: 844 })).newPage();
  // The academic lead's queue is its own view now (registry leaf "learning-actions"; this campus has no principal).
  await ar.goto(`${base}/admin?view=learning-actions`);
  await ar.locator("[data-learning-actions] [data-action]").first().waitFor({ timeout: 30_000 });
  assert.equal(await ar.evaluate("document.documentElement.dir"), "rtl");
  await ar.locator("[data-learning-actions]").scrollIntoViewIfNeeded();
  await shot(ar, "learning-actions-leader-ar-390", "[data-learning-actions]");
  await ar.close();
});
