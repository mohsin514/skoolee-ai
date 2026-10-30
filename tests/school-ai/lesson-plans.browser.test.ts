import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import type { AuthUser } from "../../src/lib/auth";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { previewRelease, releaseAssignment } from "../../src/lib/assignments/service";
import { protectLessonPlans } from "../../src/lib/school-ai/learning";
import { assessmentFixture } from "./assessment-fixture";

// SKO-414 on the isolated app: a saved lesson plan is checked with repair steps (timing, period length,
// unpublished resources, confirmation); AI drafts stay drafts until the owning teacher confirms; temporary
// groups are private, neutral and limited to the class; an activity becomes an assignment draft for the
// class or one group, and a later group change never alters a released audience; the lesson record and
// history never reopen the curriculum; copying carries content only.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.LESSON_TEST_APP || "http://localhost:3108";
const evidence = process.env.LESSON_EVIDENCE_DIR || "/tmp/sko414-evidence";
const db = new PrismaClient(), password = "SyntheticLessons414!";
const schoolId = `ls414-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string; role: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {}, pupils: string[] = [];
let browser: Browser;
const authUser = (key: string): AuthUser => ({ userId: users.get(key)!.id, schoolId, campusId, role: users.get(key)!.role as AuthUser["role"], email: users.get(key)!.email });
const ctx = <T>(key: string, work: () => Promise<T>) => { const u = authUser(key); return runWithTenantContext({ schoolId, campusId, userId: u.userId, role: u.role }, work); };

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email, role });
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
const view = async (key = "owner") => (await (await context(key)).request.get(`${base}/api/school-ai/lesson-plans?curriculumId=${ids.curriculumA}&planId=plan-1`)).json();
const post = async (key: string, action: string, data: object) => (await context(key)).request.post(`${base}/api/school-ai/lesson-plans`, { data: { action, data }, headers: { origin: base } });
const setPlan = async (patch: Record<string, unknown>) => {
  const record = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: ids.curriculumA } });
  const data = record.data as { lessonPlans: Record<string, unknown>[] };
  await db.schoolAiRecord.update({ where: { id: record.id }, data: { data: { ...data, lessonPlans: [{ ...data.lessonPlans[0], ...patch }] } as never } });
};
const shot = async (page: Page, name: string, locator: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.locator(locator).screenshot({ path: `${evidence}/${name}.png` }); };

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Linden Lessons School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Linden Main", regId: campusId, city: "Lahore" } });
  await user("owner", "TEACHER"); await user("colleague", "TEACHER"); await user("leader", "CAMPUS_ADMIN"); await user("leader-ar", "CAMPUS_ADMIN", "ar");
  ids.classA = (await db.class.create({ data: { schoolId, campusId, name: "Seven", section: "A", academicYear: 2026 } })).id;
  ids.classB = (await db.class.create({ data: { schoolId, campusId, name: "Seven", section: "B", academicYear: 2026 } })).id;
  ids.subjectA = (await db.subject.create({ data: { schoolId, campusId, classId: ids.classA, name: "Mathematics", teacherId: users.get("owner")!.id } })).id;
  ids.subjectB = (await db.subject.create({ data: { schoolId, campusId, classId: ids.classB, name: "Mathematics", teacherId: users.get("owner")!.id } })).id;
  for (let n = 0; n < 3; n++) pupils.push((await db.student.create({ data: { schoolId, campusId, classId: ids.classA, fullName: `Synthetic Pupil ${n + 1}`, rollNo: `LN-${n + 1}`, gender: "OTHER", enrollmentDate: new Date("2026-04-01Z") } })).id);
  ids.outsider = (await db.student.create({ data: { schoolId, campusId, classId: ids.classB, fullName: "Synthetic Other Class", rollNo: "LN-B1", gender: "OTHER", enrollmentDate: new Date("2026-04-01Z") } })).id;
  await db.periodDefinition.create({ data: { schoolId, campusId, timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:35" } });
  ids.resource = (await db.learningResource.create({ data: { schoolId, campusId, classId: ids.classA, title: "Counters worksheet", kind: "WORKSHEET", audience: "CLASS", status: "DRAFT", ownerId: users.get("owner")!.id } })).id;
  const plan = { id: "plan-1", title: "Combining counters", kind: "LESSON", language: "en", outcomeIds: ["outcome-1"], durationMinutes: 40,
    activities: [{ title: "Combine counters", instructions: "Combine two groups of counters and explain the total to a partner.", minutes: 30 }],
    checks: [{ question: "What is two plus two?", expectedEvidence: "Four, explained by combining." }], adaptations: "", confirmed: false,
    sourceRefs: [{ sourceId: "source-1", page: "1", excerpt: "Two plus two equals four." }], resourceIds: [ids.resource] };
  for (const [key, classId, subjectId, withPlan] of [["curriculumA", ids.classA, ids.subjectA, true], ["curriculumB", ids.classB, ids.subjectB, false]] as const) {
    const data = { ...assessmentFixture(subjectId, classId).curriculum, ...(withPlan ? { lessonPlans: [plan] } : {}) };
    // The class teacher drafts their own curriculum; the other class's curriculum belongs to the office.
    const author = withPlan ? "owner" : "leader";
    ids[key] = (await ctx(author, () => createWorkspaceRecord(authUser(author), { kind: "CURRICULUM", campusId, title: `Mathematics ${key}`, data: data as never, idempotencyKey: randomUUID() }))).id;
  }
  // The fixture plan began as an AI draft owned by the class teacher.
  await setPlan({ ownerId: users.get("owner")!.id, origin: "AI" });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("checks name each problem with a repair; AI drafts stay drafts until the owning teacher confirms", async () => {
  const first = await view();
  assert.ok(first.result, JSON.stringify(first));
  const issues: string[] = first.result.issues;
  assert.ok(issues.some(i => /add up to 30 of 40 minutes/.test(i)));
  assert.ok(issues.some(i => /a period is 35/.test(i)));
  assert.ok(issues.some(i => /not published to this class's learners/.test(i)));
  assert.ok(issues.some(i => /has not confirmed/.test(i)));
  assert.deepEqual([first.result.plan.origin, first.result.canManage], ["AI", true]);
  assert.equal((await view("colleague")).result?.canManage ?? false, false, "a colleague cannot manage the plan");
  const prev = { lessonPlans: [{ id: "plan-1", ownerId: users.get("owner")!.id, origin: "AI", confirmed: false }] };
  assert.throws(() => protectLessonPlans({ lessonPlans: [{ id: "plan-1", confirmed: true }] }, prev, { userId: users.get("colleague")!.id, leader: false }), /Only the teacher who owns/);
  const kept = protectLessonPlans({ lessonPlans: [{ id: "plan-1", confirmed: true, ownerId: "someone-else", origin: "TEACHER" }] }, prev, { userId: users.get("owner")!.id, leader: false }) as { lessonPlans: { ownerId: string; origin: string }[] };
  assert.deepEqual([kept.lessonPlans[0].ownerId, kept.lessonPlans[0].origin], [users.get("owner")!.id, "AI"], "ownership and AI origin cannot be rewritten");
  await setPlan({ durationMinutes: 35, activities: [{ title: "Combine counters", instructions: "Combine two groups of counters and explain the total to a partner.", minutes: 35 }], confirmed: true });
  await db.learningResource.update({ where: { id: ids.resource }, data: { status: "PUBLISHED", publishedVersion: 1, latestVersion: 1 } });
  assert.deepEqual((await view()).result.issues, []);
});

test("groups are private, neutral and limited to the class", async () => {
  assert.equal((await post("colleague", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: 0, groups: [[pupils[0]]] })).status(), 404, "a colleague cannot even see another teacher's draft");
  assert.equal((await post("owner", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: 0, groups: [[pupils[0], ids.outsider]] })).status(), 400);
  assert.equal((await post("owner", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: 0, groups: [[pupils[0]], [pupils[0]]] })).status(), 400);
  const saved = await post("owner", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: 0, groups: [[pupils[0], pupils[1]], [pupils[2]]] });
  assert.equal(saved.status(), 200, await saved.text());
  assert.deepEqual((await saved.json()).result.groups.map((g: { label: string }) => g.label), ["Group A", "Group B"]);
  assert.equal((await post("owner", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: 0, groups: [[pupils[0]]] })).status(), 409, "a stale version is refused");
});

test("an activity becomes an assignment for one group; a later group change never alters the released audience", async () => {
  const before = await view();
  const groupA = before.result.groups.find((g: { label: string }) => g.label === "Group A");
  const due = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10) + "T17:00";
  const published = await post("owner", "publish", { curriculumId: ids.curriculumA, planId: "plan-1", activityIndex: 0, groupId: groupA.id, dueLocal: due });
  assert.equal(published.status(), 201, await published.text());
  const assignmentId = (await published.json()).result.assignmentId as string;
  const assignment = await db.assignment.findUniqueOrThrow({ where: { id: assignmentId } });
  assert.deepEqual(assignment.audienceStudentIds.sort(), [pupils[0], pupils[1]].sort());
  assert.equal(assignment.status, "DRAFT", "publishing creates a draft for the assignment workflow");
  assert.ok(!/Group/.test(`${assignment.title} ${assignment.instructions}`), "group labels never reach learners");
  assert.deepEqual(assignment.resourceIds, [ids.resource]);
  const preview = await ctx("owner", () => previewRelease(authUser("owner"), assignmentId));
  assert.equal(preview.audience.length, 2);
  await ctx("owner", () => releaseAssignment(authUser("owner"), assignmentId, { expectedVersion: 0 }));
  const again = await post("owner", "publish", { curriculumId: ids.curriculumA, planId: "plan-1", activityIndex: 0, groupId: groupA.id, dueLocal: due });
  assert.deepEqual([(await again.json()).result.assignmentId, (await again.json()).result.duplicate], [assignmentId, true]);
  const current = await view();
  assert.equal((await post("owner", "groups", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: current.result.stateVersion, groups: [[pupils[0]], [pupils[1], pupils[2]]] })).status(), 200);
  const release = await db.assignmentVersion.findFirstOrThrow({ where: { assignmentId } });
  assert.deepEqual([...release.audience].sort(), [pupils[0], pupils[1]].sort(), "the released audience stays frozen");
});

test("the lesson record keeps history without reopening the curriculum; copying carries content only", async () => {
  const curriculumBefore = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: ids.curriculumA } });
  const state = await view();
  const future = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  assert.equal((await post("owner", "delivery", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: state.result.stateVersion, status: "TAUGHT", on: future, reflection: "" })).status(), 400);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await post("owner", "delivery", { curriculumId: ids.curriculumA, planId: "plan-1", expectedVersion: state.result.stateVersion, status: "TAUGHT", on: today, reflection: "Counters worked; pairs needed more time to explain." })).status(), 200);
  const after = await view();
  assert.deepEqual(after.result.delivery.status, "TAUGHT");
  assert.deepEqual(after.result.events.map((e: { kind: string }) => e.kind).sort(), ["DELIVERY", "GROUPS", "GROUPS", "PUBLISHED_ACTIVITY"]);
  const curriculumAfter = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: ids.curriculumA } });
  assert.deepEqual([curriculumAfter.version, curriculumAfter.status], [curriculumBefore.version, curriculumBefore.status], "recording a lesson never reopens or re-versions the curriculum");

  const target = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: ids.curriculumB } });
  const copied = await post("leader", "copy", { curriculumId: ids.curriculumA, planId: "plan-1", targetCurriculumId: ids.curriculumB, targetVersion: target.version });
  assert.equal(copied.status(), 201, await copied.text());
  const plans = ((await db.schoolAiRecord.findUniqueOrThrow({ where: { id: ids.curriculumB } })).data as { lessonPlans: Record<string, unknown>[] }).lessonPlans;
  assert.equal(plans.length, 1);
  assert.deepEqual([plans[0].confirmed, plans[0].resourceIds, plans[0].ownerId], [false, undefined, users.get("leader")!.id]);
  assert.equal(await db.lessonPlanState.count({ where: { curriculumId: ids.curriculumB } }), 0, "groups, records and published tasks stay with the original class");
});

test("the plan panel reads clearly in English and Arabic", async () => {
  for (const [key, viewport, name] of [["leader", { width: 1440, height: 1000 }, "lesson-plan-actions-en-1440"], ["leader-ar", { width: 390, height: 844 }, "lesson-plan-actions-ar-390"]] as const) {
    const page = await (await context(key, viewport)).newPage(), errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/ai`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: key === "leader" ? "Curriculum & papers" : "المناهج والأوراق" }).first().click({ timeout: 30_000 });
    await page.locator('select[id$="assessment-record"]').selectOption(ids.curriculumA);
    const panel = page.locator("[data-lesson-plan-actions]");
    await panel.locator('[data-plan="plan-1"] button').first().click({ timeout: 30_000 });
    await panel.locator("[data-plan-panel] [data-plan-ready]").waitFor({ timeout: 30_000 });
    if (key === "leader-ar") assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
    await panel.scrollIntoViewIfNeeded();
    await shot(page, name, "[data-lesson-plan-actions]");
    assert.deepEqual(errors, []);
    await page.close();
  }
});
