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
import { createSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-411 browser acceptance: per-answer save state, offline retry, unsent-edit recovery,
// the application boundary during an attempt and one receipt for duplicate submits.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.EXAM_TEST_APP || "http://localhost:3107";
const evidence = process.env.EXAM_EVIDENCE_DIR || "/tmp/sko411-evidence";
const raw = new PrismaClient(), password = "SyntheticExam411!";
const schoolId = `exam411-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const exams = new Map<string, string>();
let browser: Browser;

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
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const status = (page: Page, number: number) => page.locator("[id^=exam-question-]").nth(number - 1).locator("[data-answer-status]");

async function startExam(page: Page, key: string) {
  await page.goto(`${base}/ai/exams/${exams.get(key)}`);
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await page.getByRole("checkbox", { name: "I understand the timer, availability end, and saving requirements, and I am ready to start.", exact: true }).check();
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await page.getByText("Saved to server", { exact: true }).waitFor();
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Olive School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Olive Main", regId: campusId, city: "Lahore" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); const teacher = await person("teacher", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 5", section: "C", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: teacher.userId } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Synthetic mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(lead, { kind: "PAPER", campusId, title: "Synthetic arithmetic check", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  // One exam per learner so each scenario starts from a fresh attempt.
  for (const [index, key] of ["learner", "learner-retry", "learner-ur", "other"].entries()) {
    const user = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en"), id = randomUUID();
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: user.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "MALE", status: "active" } });
    const exam = await runWithTenantContext({ schoolId, campusId, userId: lead.userId, role: lead.role }, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId: paper.id, title: `Synthetic arithmetic check ${index + 1}`, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), studentIds: [id], mode: "STANDARD" }));
    exams.set(key, exam.id);
  }
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("each answer shows its own save state; offline edits are retried automatically when the connection returns", async () => {
  const ctx = await context("learner-retry"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await startExam(page, "learner-retry");
  await page.getByRole("button", { name: "4" }).first().click();
  await status(page, 1).filter({ hasText: /^Saved$/ }).waitFor();
  await ctx.setOffline(true);
  await page.locator("[id^=exam-question-]").nth(2).locator("textarea").fill("Combine both groups and count them.");
  await page.getByText("Connection lost.", { exact: false }).waitFor();
  await status(page, 3).filter({ hasText: /Not saved yet|Saving/ }).waitFor();
  assert.equal(await status(page, 1).innerText(), "Saved", "an acknowledged answer stays confirmed while offline");
  await shot(page, "exam-offline-pending-en-1440");
  await ctx.setOffline(false);
  await status(page, 3).filter({ hasText: /^Saved$/ }).waitFor({ timeout: 40_000 });
  const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exams.get("learner-retry") } });
  assert.equal((attempt.responses as Record<string, string>).q3, "Combine both groups and count them.");
  assert.deepEqual(errors, []); await ctx.close();
});

test("unsent edits survive a refresh and are restored only when the learner chooses", async () => {
  const ctx = await context("learner"), page = await ctx.newPage();
  await startExam(page, "learner");
  await page.getByRole("button", { name: "4" }).first().click();
  await status(page, 1).filter({ hasText: /^Saved$/ }).waitFor();
  // Block saves, type, then reload before the server acknowledges.
  await page.route("**/attempt", route => route.request().method() === "PATCH" ? route.abort() : route.continue());
  await page.locator("[id^=exam-question-]").nth(2).locator("textarea").fill("Unsent explanation typed before a crash.");
  await page.waitForTimeout(400);
  await page.unroute("**/attempt");
  await page.reload();
  const prompt = page.getByRole("alertdialog", { name: "Unsent answers found on this device" });
  await prompt.waitFor();
  assert.equal((await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exams.get("learner") } }).then(row => (row.responses as Record<string, string>).q3)) ?? "", "", "nothing reached the server");
  await shot(page, "exam-restore-unsent-en-1440");
  await prompt.getByRole("button", { name: "Restore and send" }).click();
  await status(page, 3).filter({ hasText: /^Saved$/ }).waitFor();
  const saved = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exams.get("learner") } });
  assert.equal((saved.responses as Record<string, string>).q3, "Unsent explanation typed before a crash.");
  await ctx.close();
});

test("during the attempt other Skoolee pages and APIs are refused; duplicate submits give one receipt and release the boundary", async () => {
  const ctx = await context("learner"), page = await ctx.newPage();
  await page.goto(`${base}/student`);
  await page.waitForURL(url => url.pathname === `/ai/exams/${exams.get("learner")}`);
  const blocked = await page.request.get(`${base}/api/resources`);
  assert.equal(blocked.status(), 409);
  assert.equal((await blocked.json()).code, "EXAM_SESSION_ACTIVE");
  const other = await page.request.get(`${base}/api/school-ai/exams/${exams.get("other")}/attempt`);
  assert.equal(other.status(), 409, "another candidate's exam is outside the active-attempt exception");
  await page.getByRole("button", { name: "Submit final answers", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Submit final answers", exact: true }).dblclick();
  await page.getByText("Submission received", { exact: true }).waitFor();
  const attempts = await raw.schoolAiExamAttempt.findMany({ where: { assignmentId: exams.get("learner") } });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].status, "SUBMITTED");
  assert.equal(await raw.auditLog.count({ where: { schoolId, tableName: "school_ai_exam_attempts", recordId: attempts[0].id, newValue: { path: ["status"], equals: "SUBMITTED" } } }), 1, "exactly one final submission");
  await shot(page, "exam-receipt-en-1440");
  assert.notEqual((await page.request.get(`${base}/api/resources`)).status(), 409, "the boundary is released after the receipt");
  await ctx.close();
});

test("the Urdu exam shell keeps save state and timer readable at 390px", async () => {
  const ctx = await context("learner-ur", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai/exams/${exams.get("learner-ur")}`);
  await page.locator("button").filter({ hasText: /تیاری|Check readiness/ }).first().click();
  await page.getByRole("checkbox").first().check();
  await page.locator("button").filter({ hasText: /شروع|Start exam/ }).last().click();
  await page.locator("[data-answer-status]").first().waitFor();
  await page.locator("[id^=exam-question-]").nth(0).getByRole("button").nth(1).click();
  await page.locator("[data-answer-status=CONFIRMED]").first().waitFor();
  assert.equal(await noOverflow(page), true);
  await shot(page, "exam-shell-ur-390");
  assert.deepEqual(errors, []); await ctx.close();
});
