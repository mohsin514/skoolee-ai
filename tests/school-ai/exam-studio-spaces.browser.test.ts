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
import { recordRehearsal, releaseResults, reviewItem } from "../../src/lib/school-ai/exam-release-service";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 browser acceptance for the studio rail: Brief, Review desk evidence drawer and Results and improvement.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-spaces-evidence";
const raw = new PrismaClient(), password = "SyntheticSpaces408!";
const schoolId = `spc408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, examId = "", inReviewId = "";

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
  await page.keyboard.press("Shift"); // any key ends the studio intro (R20.6)
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو|اسٹوڈیو/ }).getByRole("button", { name }).click();
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Willow Studio School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Willow Main", regId: campusId, city: "Lahore" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "B", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const learners: AuthUser[] = [], learnerIds: string[] = [];
  for (const index of [1, 2, 3]) {
    const learner = await person(`learner${index}`, "STUDENT"); learners.push(learner);
    const id = randomUUID(); learnerIds.push(id);
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index}`, rollNo: String(index), gender: "FEMALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  const curriculumData = { ...fixture.curriculum, outcomes: [{ ...fixture.curriculum.outcomes[0], title: "Add whole numbers within 100" }], sectionCoverage: [{ section: "unit-3", outcomeIds: ["outcome-1"], taughtOn: "2026-09-14", confirmed: true }] };
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: curriculumData, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  const paperData = { ...fixture.paper, coverageSection: "unit-3", curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>;
  const reviewAll = async (paperId: string, by: AuthUser, target: "READY_FOR_REVIEW" | "APPROVED") => { for (const id of ["q1", "q2", "q3"]) { const row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } }); await reviewItem(by, paperId, { version: row.version, questionId: id, target, itemRevision: paperDataSchema.parse(row.data).questions.find(item => item.id === id)!.review?.itemRevision ?? 1, ...(target === "READY_FOR_REVIEW" ? { note: "Checked against the syllabus page." } : {}) }); } };
  const inReview = inReviewId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 3 check — in review", data: paperData, idempotencyKey: randomUUID() })).id;
  await reviewAll(inReview, author, "READY_FOR_REVIEW");
  const releasedId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 2 test", data: paperData, idempotencyKey: randomUUID() })).id;
  await reviewAll(releasedId, author, "READY_FOR_REVIEW"); await reviewAll(releasedId, lead, "APPROVED");
  let row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: releasedId } });
  await updateWorkspaceRecord(author, releasedId, { version: row.version, action: "review" });
  row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: releasedId } });
  const approved = await updateWorkspaceRecord(lead, releasedId, { version: row.version, action: "approve" });
  await recordRehearsal(author, releasedId, { version: approved.version, findings: [] });
  const as = (user: AuthUser) => <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
  examId = (await as(lead)(() => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId: releasedId, title: "Unit 2 test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: learnerIds, mode: "STANDARD" }))).id;
  // Two of three learners choose the same wrong option on question 1, so item analysis asks for an item check.
  const choices = ["a1", "a2", "a2"];
  for (const [index, learner] of learners.entries()) {
    const attempt = await as(learner)(() => startSchoolAiExam(learner, examId));
    const option = attempt!.paper.questions[0].options.find(entry => entry.id === choices[index])!.id;
    await as(learner)(() => saveSchoolAiAttempt(learner, examId, { sequence: 1, responses: { q1: option, q3: "Put both groups together and count them all." }, submit: true }));
    const submitted = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId, userId: learner.userId } });
    await as(lead)(() => reviewSchoolAiAttempt(lead, examId, submitted.id, { marks: [{ questionId: "q1", marks: index === 0 ? 2 : 0, feedback: index === 0 ? "Correct sum." : "Recount the total: two and two make four." }, { questionId: "q3", marks: index === 2 ? 1 : 3, feedback: index === 2 ? "Name the counting step." : "Clear method." }], note: "Moderated." }));
  }
  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { endsAt: new Date(Date.now() - 1000) } });
  await as(lead)(() => releaseResults(lead, examId));
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the author answers the brief one decision at a time, accepts a curriculum suggestion and sees a failed bound kept", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Welcome and brief/);
  const space = page.locator("[data-brief-space]");
  await space.getByRole("button", { name: "Start a new brief" }).click();
  const card = space.locator("[data-brief-decision]");
  await card.getByRole("heading", { name: "Is this subject what the assessment covers?" }).waitFor();
  await shot(page, "spaces-brief-first-decision-en-1440");
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByRole("heading", { name: "Is this the class that sits it?" }).waitFor();
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByRole("heading", { name: /taught section and outcomes/ }).waitFor();
  await card.getByLabel("Taught section").selectOption({ index: 1 });
  await card.getByRole("button", { name: "Suggest from the approved curriculum" }).click();
  await space.locator("[data-brief-suggestion]").waitFor();
  await shot(page, "spaces-brief-suggestion-en-1440");
  await space.locator("[data-brief-suggestion]").getByRole("button", { name: "Accept suggestion" }).click();
  await card.getByRole("heading", { name: "How long is the sitting, in minutes?" }).waitFor();
  await card.getByLabel("Duration").fill("ninety");
  await card.getByRole("button", { name: "Confirm" }).click();
  await space.getByRole("alert").filter({ hasText: "Enter a whole number of minutes between 1 and 480." }).waitFor();
  assert.equal(await space.getByText(/expected number/).count(), 0, "the validator's own words never reach the reader");
  await card.getByText("You entered: ninety").waitFor();
  assert.equal(await space.locator('[data-brief-key="taughtCoverage"]').getAttribute("data-classification"), "CONFIRMED_FACT");
  await shot(page, "spaces-brief-failed-bound-en-1440");
  await card.getByLabel("Duration").fill("45");
  await card.getByRole("button", { name: "Confirm" }).click();
  await card.getByRole("heading", { name: "How many marks does the paper carry?" }).waitFor();
  const brief = await raw.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "BRIEF" } });
  assert.equal(brief.version, 6, "create, subject, class, suggestion, acceptance and duration: six versions; the refused answer wrote none");
  assert.equal(await raw.schoolAiRevision.count({ where: { recordId: brief.id } }), 6);
  assert.deepEqual(errors, []); await ctx.close();
});

test("the review desk opens an evidence drawer with the source, outcomes and named review history", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Review desk/);
  const desk = page.locator("[data-review-desk]");
  await desk.locator("select").first().selectOption(inReviewId);
  await desk.getByRole("button", { name: "Inspect evidence" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Evidence for question 1" });
  await drawer.getByText("Why this question?").waitFor();
  await drawer.getByText("Synthetic mathematics syllabus").waitFor();
  await drawer.getByText("Add whole numbers within 100").waitFor();
  await drawer.getByText(/Ready for review by Synthetic author/).waitFor();
  await drawer.getByText("Written by staff").waitFor();
  await shot(page, "spaces-review-evidence-drawer-en-1440");
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []); await ctx.close();
});

test("results and improvement states the evidence base, flags the item to check and shows feedback per learner", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Results and improvement/);
  const space = page.locator("[data-improve-space]");
  await space.getByRole("heading", { name: "Evidence base" }).waitFor();
  assert.equal(await space.locator('[data-item-reading="CHECK_ITEM"]').count(), 1);
  await space.getByText("Wrong option chosen more often than the key").waitFor();
  await space.locator("details").nth(1).locator("summary").click();
  await space.getByText("Recount the total: two and two make four.").first().waitFor();
  await shot(page, "spaces-improve-en-1440", true);
  assert.deepEqual(errors, []); await ctx.close();
});

test("a learner sees outcome feedback from their moderated answers after release", async () => {
  const ctx = await context("learner2"), page = await ctx.newPage();
  await page.goto(`${base}/ai/exams/${examId}`);
  const section = page.locator("[data-learner-feedback]");
  await section.getByText("What this result shows").waitFor();
  await section.getByText("Recount the total: two and two make four.").waitFor();
  await section.scrollIntoViewIfNeeded();
  await shot(page, "spaces-learner-feedback-en-1440");
  await ctx.close();
});

test("Arabic lead reads the rail and improvement space right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /النتائج والتحسين/);
  await page.locator("[data-improve-space]").getByRole("heading", { name: "قاعدة الأدلة" }).waitFor();
  assert.equal(await noOverflow(page), true);
  await page.locator("[data-improve-space] [data-item-reading]").first().scrollIntoViewIfNeeded();
  await shot(page, "spaces-improve-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
