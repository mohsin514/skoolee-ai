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
import { createSchoolAiExam, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R15.4 browser acceptance: a supervised pause stops the candidate's clock, resume restores it, and extra time is recorded.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-pause-evidence";
const raw = new PrismaClient(), password = "SyntheticPause408!";
const schoolId = `pau408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
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
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Birch Exam School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Islamabad", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Birch Main", regId: campusId, city: "Islamabad" } });
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
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 5 quiz", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author)(() => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Unit 5 quiz", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  for (const key of learnerKeys) { const learner = people.get(key)!; await as(learner)(() => startSchoolAiExam(learner, examId)); }
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the author pauses one candidate after checking the affected list", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Control room/);
  const panel = page.locator("[data-supervise]");
  await panel.getByText("Synthetic pupil 1").click();
  await panel.getByLabel("Reason").fill("Candidate unwell, supervised break");
  await panel.locator("[data-affected]").filter({ hasText: "Affected candidates: 1" }).waitFor();
  await panel.getByRole("button", { name: "Pause selected" }).click();
  await panel.locator("[data-supervise-result]").filter({ hasText: "Synthetic pupil 1: Paused" }).waitFor();
  await panel.locator('[data-attempt-paused="true"]').waitFor();
  await shot(page, "pause-control-room-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the Urdu candidate sees the paused panel with the clock stopped and no questions", async () => {
  const ctx = await context("learner-ur"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai/exams/${examId}`);
  const paused = page.locator("[data-exam-paused]");
  await paused.getByText("نگران نے آپ کا امتحان روک دیا ہے").waitFor();
  const first = await paused.locator("p").last().textContent();
  await page.waitForTimeout(2200);
  assert.equal(await paused.locator("p").last().textContent(), first, "the remaining time does not move while paused");
  await shot(page, "pause-candidate-ur-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the lead resumes with the paused time given back and adds recorded extra time", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Control room/);
  const panel = page.locator("[data-supervise]");
  await panel.getByText("Synthetic pupil 1").click();
  await panel.getByRole("button", { name: "Resume selected" }).click();
  await panel.locator("[data-supervise-result]").filter({ hasText: /Synthetic pupil 1: Resumed with/ }).waitFor();
  assert.equal(await raw.schoolAiExamPause.count({ where: { schoolId, endedAt: { not: null } } }), 1);
  await panel.getByText("Synthetic pupil 2").click();
  await panel.getByLabel("Reason").fill("Late start approved by the exams officer");
  await panel.getByLabel("Minutes to add").fill("10");
  await panel.getByRole("button", { name: "Add extra time" }).click();
  await panel.locator("[data-supervise-result]").filter({ hasText: "Done." }).waitFor();
  assert.equal(await raw.accommodationLiveAdjustment.count({ where: { schoolId, addedMinutes: 10 } }), 1);
  await shot(page, "pause-resumed-extra-time-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic lead reads the supervision panel right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /غرفة المتابعة/);
  const panel = page.locator("[data-supervise]");
  await panel.getByText("الإيقاف والاستئناف والوقت الإضافي").waitFor();
  assert.equal(await noOverflow(page), true);
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "pause-supervise-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
