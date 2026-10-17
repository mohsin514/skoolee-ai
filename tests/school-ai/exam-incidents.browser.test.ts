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
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R17 browser acceptance: a live clarification, the candidate's acknowledgement, and a previewed, authorized remedy.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-incidents-evidence";
const raw = new PrismaClient(), password = "SyntheticIncident408!";
const schoolId = `inc408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, examId = "";
const learnerKeys = ["learner-ur", "learner2"];

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
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string, fullPage = false) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage }); };
async function openSpace(page: Page, name: RegExp) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو|اسٹوڈیو/ }).getByRole("button", { name }).click();
}
const as = (user: AuthUser) => <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Maple Exam School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Islamabad", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Maple Main", regId: campusId, city: "Islamabad" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "C", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const studentIds: string[] = [];
  for (const [index, key] of learnerKeys.entries()) {
    const learner = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en");
    const id = randomUUID(); studentIds.push(id);
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "MALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 4 quiz", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author)(() => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Unit 4 quiz", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  for (const key of learnerKeys) { const learner = people.get(key)!; await as(learner)(() => startSchoolAiExam(learner, examId)); }
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the author sends a clarification about question 2 to everyone sitting, without touching the paper", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Control room/);
  const room = page.locator("[data-control-room]");
  await room.getByLabel("Notice text").fill("Question 2: “adding” means finding the total of both numbers.");
  await room.getByLabel("About question (optional)").selectOption({ label: "About question 2" });
  await room.getByRole("button", { name: "Send notice" }).click();
  await room.getByRole("status").filter({ hasText: "Notice sent." }).waitFor();
  await room.locator("[data-notice-reads]").filter({ hasText: "Read by 0 of 2" }).waitFor();
  await shot(page, "incidents-control-room-sent-en-1440");
  assert.equal(await raw.schoolAiExamClarification.count({ where: { assignmentId: examId } }), 1);
  assert.deepEqual(errors, []); await ctx.close();
});

test("the Urdu candidate sees the notice durably in the exam and acknowledges it", async () => {
  const ctx = await context("learner-ur"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai/exams/${examId}`);
  const notices = page.locator("[data-exam-notices]");
  await notices.getByText("امتحانی عملے کی اطلاعات").waitFor();
  await notices.getByText("سوال 2 کے بارے میں", { exact: false }).waitFor();
  await shot(page, "incidents-candidate-notice-ur-1440");
  await notices.getByRole("button", { name: "میں نے یہ پڑھ لیا" }).click();
  await notices.getByText("پڑھ لیا", { exact: true }).waitFor();
  assert.equal(await raw.schoolAiExamClarificationAck.count({ where: { schoolId } }), 1);
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic lead reads the control room right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /غرفة المتابعة/);
  const reads = page.locator("[data-control-room] [data-notice-reads]");
  await reads.filter({ hasText: "قرأه 1 من 2" }).waitFor();
  assert.equal(await noOverflow(page), true);
  await reads.first().scrollIntoViewIfNeeded();
  await shot(page, "incidents-control-room-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});

test("after the sitting a key correction is previewed per candidate and applied only on authorization", async () => {
  const lead = people.get("lead")!;
  for (const [index, key] of learnerKeys.entries()) {
    const learner = people.get(key)!;
    const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId, userId: learner.userId } });
    await as(learner)(() => saveSchoolAiAttempt(learner, examId, { sequence: attempt.sequence + 1, responses: { q1: index === 0 ? "a1" : "a2", q3: "Put both groups together and count." }, submit: true }));
    await as(lead)(() => reviewSchoolAiAttempt(lead, examId, attempt.id, { marks: [{ questionId: "q1", marks: index === 0 ? 2 : 0, feedback: "Marked against the key." }, { questionId: "q3", marks: 2, feedback: "Clear method." }], note: "Moderated." }));
  }
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Results and improvement/);
  const panel = page.locator("[data-remedy-panel]");
  await panel.getByLabel("Question", { exact: true }).selectOption({ label: "About question 1" });
  await panel.getByLabel("Correct option").selectOption({ label: "5" });
  await panel.getByLabel("Reason").fill("The published key marked the wrong option.");
  await panel.getByRole("button", { name: "Preview the impact" }).click();
  await panel.locator('[data-remedy-status="PROPOSED"]').waitFor();
  assert.equal(await panel.locator('[data-remedy-row="changes"]').count(), 2);
  assert.equal(await raw.schoolAiExamResultRevision.count({ where: { assignmentId: examId } }), 2, "the preview changes no result");
  await shot(page, "incidents-remedy-preview-en-1440");
  await panel.getByRole("button", { name: "Authorize and apply" }).click();
  await panel.locator('[data-remedy-status="APPLIED"]').waitFor();
  assert.equal(await panel.getByText("Revised to version 2").count(), 2);
  assert.equal(await raw.schoolAiExamResultRevision.count({ where: { assignmentId: examId, version: 2 } }), 2);
  await panel.locator('[data-remedy-status="APPLIED"]').scrollIntoViewIfNeeded();
  await shot(page, "incidents-remedy-applied-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});
