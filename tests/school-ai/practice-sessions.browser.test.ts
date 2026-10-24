import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { draftPractice } from "../../src/lib/school-ai/practice-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-426 on the isolated app: a learner practises the approved set from their released exam page —
// a hint, an answer, the worked example after answering — and the teacher sees assisted and
// independent results apart in the studio. EN desktop and AR phone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PRACTICE_TEST_APP || "http://localhost:3108";
const evidence = process.env.PRACTICE_EVIDENCE_DIR || "/tmp/sko426-evidence";
const db = new PrismaClient(), password = "SyntheticPractice426!";
const schoolId = `pr426-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const users = new Map<string, { id: string; email: string; role: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
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

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar Practice School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Lahore" } });
  await user("lead", "CAMPUS_ADMIN"); await user("learner", "STUDENT"); await user("learner-ar", "STUDENT", "ar");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Four", section: "C", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics" } });
  const learnerIds: string[] = [];
  for (const key of ["learner", "learner-ar"]) {
    const id = randomUUID();
    await db.student.create({ data: { id, schoolId, campusId, classId, studentUserId: users.get(key)!.id, fullName: `Synthetic ${key}`, rollNo: key === "learner" ? "CP-1" : "CP-2", gender: "OTHER", status: "active" } });
    learnerIds.push(id);
  }
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(authUser("lead"), { kind: "CURRICULUM", campusId, title: "Synthetic practice curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(authUser("lead"), curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(authUser("lead"), { kind: "PAPER", campusId, title: "Synthetic addition check", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(authUser("lead"), paper.id, { version: paper.version, action: "approve" });
  const now = new Date(Date.now() - 3 * 3_600_000);
  const exam = await ctx("lead", () => createSchoolAiExam(authUser("lead"), { idempotencyKey: randomUUID(), paperId: paper.id, title: "Addition check", startsAt: new Date(now.getTime() - 60_000).toISOString(), endsAt: new Date(now.getTime() + 3_600_000).toISOString(), studentIds: learnerIds, mode: "STANDARD" }, now));
  ids.exam = exam.id;
  for (const key of ["learner", "learner-ar"]) {
    const attempt = await ctx(key, () => startSchoolAiExam(authUser(key), exam.id, now));
    await ctx(key, () => saveSchoolAiAttempt(authUser(key), exam.id, { sequence: 1, responses: { q1: "a2", q3: "I add them." }, submit: true }, now));
    await ctx("lead", () => reviewSchoolAiAttempt(authUser("lead"), exam.id, attempt!.id, { note: "Checked", marks: [{ questionId: "q1", marks: 0, feedback: "Chose 5" }, { questionId: "q3", marks: 1, feedback: "Partly", evidence: [{ criterionId: "r2", quote: "add", marks: 1 }] }] }, now));
  }
  await db.schoolAiExamAssignment.update({ where: { id: exam.id }, data: { resultsReleasedAt: new Date(), resultsReleasedById: users.get("lead")!.id } });
  const draft = await ctx("lead", () => draftPractice(authUser("lead"), exam.id, {}));
  const record = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: draft.id } });
  const set = record.data as { items: Array<{ questionId: string; hints?: string[] }> };
  set.items = set.items.map((item) => (item.questionId === "q1" ? { ...item, hints: ["Count on from 2: three, four."] } : item));
  const saved = await updateWorkspaceRecord(authUser("lead"), draft.id, { version: draft.version, action: "save", data: set });
  await updateWorkspaceRecord(authUser("lead"), draft.id, { version: saved.version, action: "approve" });
  ids.practice = draft.id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.practiceSession.deleteMany({ where: { schoolId } });
  await db.practiceRevisit.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("a learner practises from the released exam: a hint, an answer, then the worked example (EN desktop, AR phone)", async () => {
  for (const [key, viewport, name, labels] of [
    ["learner", { width: 1440, height: 1000 }, "practice-en-1440", { start: "Start practice", hint: "Show a hint", check: "Check my answer" }],
    ["learner-ar", { width: 390, height: 844 }, "practice-ar-390", { start: "بدء التدريب", hint: "اعرض تلميحًا", check: "تحقق من إجابتي" }],
  ] as const) {
    const page = await (await context(key, viewport)).newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/ai/exams/${ids.exam}`);
    await page.getByRole("button", { name: labels.start }).click({ timeout: 60_000 });
    const panel = page.locator('section[aria-labelledby="practice-q"]');
    await panel.waitFor({ timeout: 30_000 });
    if (!(await panel.getByText("2 + 2").count())) await panel.getByRole("button", { name: key === "learner" ? "Next question" : "السؤال التالي" }).click();
    await panel.getByRole("button", { name: labels.hint }).click();
    await panel.getByText("Count on from 2: three, four.").waitFor();
    await panel.locator('input[type="radio"]').first().check();
    await panel.getByRole("button", { name: labels.check }).click();
    await panel.getByText(key === "learner" ? "Worked example" : "مثال محلول", { exact: true }).waitFor({ timeout: 30_000 });
    assert.ok((await panel.innerText()).includes("Four."), "the worked example appears only after answering");
    if (key === "learner") { const t = await panel.innerText(); assert.ok(t.includes("You used a hint on this question. Try a similar one next time."), t); }
    else assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
    await panel.scrollIntoViewIfNeeded();
    await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))");
    await panel.screenshot({ path: `${evidence}/${name}.png` });
    if (key === "learner") {
      await panel.getByRole("button", { name: "Finish session" }).click();
      await page.getByText("Session saved").waitFor();
      assert.ok(await page.getByText("Without hints: 0 of 0 correct. With hints: 1 of 1 correct.").isVisible());
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  const attempt = await db.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: ids.exam, studentId: { not: "" } } });
  assert.equal(attempt.reviewVersion, 1, "practice never changes the exam result");
});

test("the teacher sees assisted and independent results apart in the studio", async () => {
  const page = await (await context("lead")).newPage();
  await page.goto(`${base}/ai/studio?exam=${ids.exam}#space=improve`);
  const panel = page.locator('section[aria-labelledby="practice-progress"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByText("Latest: without hints 0/0, with hints 1/1 · 1 sessions").waitFor({ timeout: 30_000 });
  await panel.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/practice-progress-en-1440.png` });
  await page.close();
});
