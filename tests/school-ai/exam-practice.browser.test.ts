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

// SKO-408 R18 browser acceptance: practice drafted from released items, approved for learners, and an earlier/later comparison.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-practice-evidence";
const raw = new PrismaClient(), password = "SyntheticPractice408!";
const schoolId = `prc408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, earlierId = "", laterId = "";
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
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Olive Practice School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Peshawar", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Olive Main", regId: campusId, city: "Peshawar" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "E", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const studentIds: string[] = [];
  for (const [index, key] of learnerKeys.entries()) {
    const learner = await person(key, "STUDENT");
    const id = randomUUID(); studentIds.push(id);
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "MALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Addition check", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  const sit = async (title: string, offset: number, q3: [number, number]) => {
    const id = (await as(author)(() => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title, startsAt: new Date(Date.now() + offset).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
    for (const [index, key] of learnerKeys.entries()) {
      const learner = people.get(key)!;
      await as(learner)(() => startSchoolAiExam(learner, id));
      const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: id, userId: learner.userId } });
      await as(learner)(() => saveSchoolAiAttempt(learner, id, { sequence: attempt.sequence + 1, responses: { q1: "a1", q3: "Combine the groups and count." }, submit: true }));
      await as(lead)(() => reviewSchoolAiAttempt(lead, id, attempt.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: q3[index], feedback: "Name the counting step." }], note: "Moderated." }));
    }
    await raw.schoolAiExamAssignment.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await as(lead)(() => releaseResults(lead, id));
    return id;
  };
  earlierId = await sit("Addition check · September", -120_000, [1, 0]);
  laterId = await sit("Addition check · October", -60_000, [3, 2]);
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the lead drafts practice from released items, approves it, and compares with the later exam", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Results and improvement/);
  const space = page.locator("[data-improve-space]");
  await space.getByLabel("Exam", { exact: true }).selectOption(earlierId);
  const practice = space.locator("[data-practice]");
  await practice.getByRole("button", { name: "Draft practice for outcomes below 70%" }).click();
  await practice.locator('[data-practice-status="DRAFT"]').waitFor();
  await practice.getByRole("button", { name: "Send for review" }).click();
  await practice.locator('[data-practice-status="IN_REVIEW"]').waitFor();
  await practice.getByRole("button", { name: "Approve for learners" }).click();
  await practice.locator('[data-practice-status="APPROVED"]').waitFor();
  await practice.getByLabel("Later exam").selectOption(laterId);
  await practice.locator("[data-compare-row]").first().waitFor();
  await practice.getByText("35.7% · items: 3 · candidates: 2").waitFor();
  await practice.scrollIntoViewIfNeeded();
  await shot(page, "practice-approved-compare-en-1440");
  // R18.8: the approved practice schedules a formative check that starts as a draft paper.
  await practice.getByRole("button", { name: "Schedule a formative check" }).click();
  await practice.locator("[data-formative-notice]").waitFor();
  const check = await raw.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "PAPER", title: { startsWith: "Formative check" } } });
  assert.equal(check.status, "DRAFT");
  await practice.locator("[data-formative-notice]").scrollIntoViewIfNeeded();
  await shot(page, "practice-formative-scheduled-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the learner sees the approved practice beside their result feedback, without keys", async () => {
  const ctx = await context("learner2"), page = await ctx.newPage();
  await page.goto(`${base}/ai/exams/${earlierId}`);
  const section = page.locator("[data-learner-practice]");
  await section.getByText("Practice your teacher approved").waitFor();
  await section.getByText("What is 2 + 2?").waitFor();
  await section.scrollIntoViewIfNeeded();
  await shot(page, "practice-learner-en-1440");
  await ctx.close();
});

test("Arabic lead reads practice and comparison right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /النتائج والتحسين/);
  const space = page.locator("[data-improve-space]");
  await space.getByLabel("الامتحان", { exact: true }).selectOption(earlierId);
  const practice = space.locator("[data-practice]");
  await practice.locator('[data-practice-status="APPROVED"]').waitFor();
  assert.equal(await noOverflow(page), true);
  await practice.scrollIntoViewIfNeeded();
  await shot(page, "practice-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
