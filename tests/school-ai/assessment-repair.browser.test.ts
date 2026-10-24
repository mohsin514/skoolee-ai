import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { releaseResults } from "../../src/lib/school-ai/exam-release-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-472 browser acceptance: the teacher previews the impact of repairing question 1's key and submits it;
// a campus leader reviews the exact plan in the confirmation and applies it; the receipt shows every step;
// the Arabic phone layout keeps counts and before/after values; the learner receives one correction notice.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3108";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko472-evidence";
const raw = new PrismaClient(), password = "SyntheticRepair472!";
const schoolId = `rep472-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, examId = "";
const learnerKeys = ["learner1", "learner2"];

async function person(key: string, role: AuthUser["role"], language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await raw.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string, fullPage = false) => { await settled(page); await page.waitForTimeout(300); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage }); };
async function openRepair(page: Page, spaceName: RegExp, examLabel: string) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو|اسٹوڈیو/ }).getByRole("button", { name: spaceName }).click();
  const space = page.locator("[data-improve-space]");
  await space.getByLabel(examLabel, { exact: true }).selectOption(examId);
  const panel = space.locator("[data-repair-panel]");
  await panel.waitFor({ timeout: 60_000 });
  return panel;
}
const as = (user: AuthUser) => <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cedar Repair School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Riyadh" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "A", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const studentIds: string[] = [];
  for (const [index, key] of learnerKeys.entries()) {
    const learner = await person(key, "STUDENT");
    const id = randomUUID(); studentIds.push(id);
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "MALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 7 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Addition check", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author)(() => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Addition check · October", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  // Pupil 1 chose a1 (the original key, "4"); pupil 2 chose a2 ("5").
  for (const [index, key] of learnerKeys.entries()) {
    const learner = people.get(key)!, choice = index === 0 ? "a1" : "a2";
    await as(learner)(() => startSchoolAiExam(learner, examId));
    const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId, userId: learner.userId } });
    await as(learner)(() => saveSchoolAiAttempt(learner, examId, { sequence: attempt.sequence + 1, responses: { q1: choice, q3: "Combine the groups and count." }, submit: true }));
    await as(lead)(() => reviewSchoolAiAttempt(lead, examId, attempt.id, { marks: [{ questionId: "q1", marks: choice === "a1" ? 2 : 0, feedback: "Scored." }, { questionId: "q3", marks: 2, feedback: "Name the counting step." }], note: "Moderated." }));
  }
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { endsAt: new Date(Date.now() - 1000) } });
  await as(lead)(() => releaseResults(lead, examId));
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.schoolAiAssessmentRepair.deleteMany({ where: { schoolId } }); await raw.notification.deleteMany({ where: { schoolId } }); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the teacher previews the impact and submits; the proposer cannot approve their own repair", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = await openRepair(page, /Results and improvement/, "Exam");
  await panel.getByLabel("Question", { exact: true }).selectOption({ label: "Question 1" });
  await panel.getByLabel("Corrected answer", { exact: true }).selectOption({ label: "5" });
  await panel.getByLabel("Reason (staff only)").fill("The intended answer is 5; the key was entered wrongly.");
  await panel.getByLabel("Explanation for the family").fill("Question 1 had the wrong answer key. Your result has been corrected.");
  await panel.getByRole("button", { name: "Preview impact" }).click();
  const preview = panel.locator("[data-repair-preview]");
  await preview.waitFor();
  assert.match((await preview.locator('[data-impact-count="CHANGED"]').innerText()).replace(/\s+/g, " "), /Changed: [1-9]/u);
  const results = preview.locator('[data-impact-group="CHANGED"] [data-impact-kind="RESULT"]');
  assert.equal(await results.count(), 2, "both learners' totals change");
  assert.deepEqual((await results.locator("span[dir=ltr]").allInnerTexts()).sort(), ["2 → 4", "4 → 2"]);
  await preview.locator("[data-repair-evidence] summary").click();
  await preview.locator("[data-repair-evidence]").getByText("Proposed key").waitFor();
  await shot(page, "repair-preview-en-1440", true);
  await preview.getByRole("button", { name: "Submit repair for review" }).click();
  await panel.locator('[data-repair-status="PENDING_REVIEW"]').waitFor();
  assert.equal(await panel.getByRole("button", { name: "Review and apply" }).count(), 0, "the proposer is not offered approval");
  await panel.getByText("Another academic leader reviews this repair.").waitFor();
  assert.deepEqual(errors, []); await ctx.close();
});

test("the campus leader confirms the exact plan and the receipt shows every step applied; the learner gets one notice", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = await openRepair(page, /Results and improvement/, "Exam");
  await panel.getByRole("button", { name: "Review and apply" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByText("Result revision: 2").waitFor();
  await dialog.getByText(/Notices to 2 people/).waitFor();
  await dialog.getByLabel("Approval note").fill("Checked against the syllabus page.");
  await shot(page, "repair-confirm-en-1440");
  await dialog.getByRole("button", { name: "Apply repair" }).click();
  const applied = panel.locator('[data-repair-status="APPLIED"]');
  await applied.waitFor({ timeout: 60_000 });
  assert.equal(await applied.locator('[data-step-status="APPLIED"]').count(), await applied.locator("[data-step]").count());
  await applied.scrollIntoViewIfNeeded();
  await shot(page, "repair-applied-en-1440");
  const learner = people.get("learner1")!;
  const notices = await raw.notification.findMany({ where: { schoolId, userId: learner.userId, type: "ASSESSMENT_RESULT_CORRECTED" } });
  assert.equal(notices.length, 1);
  assert.equal(notices[0].message, "Question 1 had the wrong answer key. Your result has been corrected.");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic leader on a phone reads the receipt right-to-left with counts and no overflow", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage();
  const panel = await openRepair(page, /النتائج والتحسين/, "الامتحان");
  await panel.locator('[data-repair-status="APPLIED"]').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "no horizontal overflow at 390px");
  await panel.getByText("إصلاح سؤال نُشرت نتائجه").or(panel.getByText("تصحيح سؤال نُشرت نتائجه")).first().waitFor();
  await panel.locator('[data-impact-count="CHANGED"]').first().waitFor();
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "repair-receipt-ar-390", true);
  await ctx.close();
});
