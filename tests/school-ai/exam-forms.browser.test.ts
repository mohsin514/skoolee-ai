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
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { recordRehearsal } from "../../src/lib/school-ai/exam-release-service";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R10 browser acceptance: create parallel forms, see structural parity with no difficulty claim, assign the set, each candidate on one form.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-forms-evidence";
const raw = new PrismaClient(), password = "SyntheticForms408!";
const schoolId = `frm408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, paperId = "";

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
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
async function openForms(page: Page, name: RegExp) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو/ }).getByRole("button", { name }).click();
  const space = page.locator("[data-forms-space]");
  await space.waitFor();
  await space.locator("select").first().selectOption(paperId);
  return space;
}
const member = async (label: string) => (await raw.schoolAiRecord.findMany({ where: { schoolId, kind: "PAPER" } })).find(row => paperDataSchema.parse(row.data).formSet?.label === label)!;

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cypress Forms School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Multan", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cypress Main", regId: campusId, city: "Multan" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "D", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, key] of ["learner1", "learner2", "learner3"].entries()) {
    const learner = await person(key, "STUDENT");
    await raw.student.create({ data: { id: randomUUID(), schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  paperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "End of term", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() })).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the author creates parallel forms; an unedited copy is flagged and no difficulty claim is made", async () => {
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /Blueprint/);
  await space.locator('[data-difficulty-claim="NOT_MEASURED"]').waitFor();
  await space.getByRole("button", { name: "Create parallel forms" }).click();
  await space.locator('[data-form="B"]').waitFor();
  assert.equal(await space.locator("[data-identical-items] li").count(), 3);
  await space.locator("[data-identical-items]").scrollIntoViewIfNeeded();
  await shot(page, "forms-created-identical-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("after the author changes form B and both forms are approved and rehearsed, the set is assigned whole", async () => {
  const author = people.get("author")!, lead = people.get("lead")!;
  const b = await member("B");
  const data = paperDataSchema.parse(b.data);
  await updateWorkspaceRecord(author, b.id, { version: b.version, data: { ...data, questions: data.questions.map(question => ({ ...question, prompt: question.id === "q1" ? "What is 3 + 1?" : question.id === "q2" ? "Choose the total of one and three." : "Describe how you would add two numbers." })) } as unknown as Record<string, unknown> });
  for (const label of ["A", "B"]) {
    const row = await member(label);
    const reviewed = await updateWorkspaceRecord(author, row.id, { version: row.version, action: "review" });
    const approved = await updateWorkspaceRecord(lead, row.id, { version: reviewed.version, action: "approve" });
    await recordRehearsal(author, row.id, { version: approved.version, findings: [] });
  }
  const ctx = await context("author"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /Blueprint/);
  const assign = space.locator("[data-assign-set]");
  await assign.waitFor();
  assert.equal(await space.locator("[data-identical-items]").count(), 0);
  await assign.getByLabel("Exam title").fill("End of term");
  await assign.getByText("Synthetic pupil 3").waitFor();
  await assign.getByLabel("Select everyone").check();
  await assign.getByRole("button", { name: "Assign the set" }).click();
  await space.getByRole("status").filter({ hasText: /^The set is assigned\. Form A · candidates: 2 Form B · candidates: 1$/ }).waitFor();
  await space.getByText("This set is sealed and assigned.").waitFor();
  assert.equal(await raw.schoolAiExamFormAllocation.count({ where: { schoolId } }), 3);
  assert.equal(await raw.schoolAiExamAssignment.count({ where: { schoolId, formSetId: { not: null } } }), 2);
  await shot(page, "forms-assigned-en-1440");
  assert.deepEqual(errors, []); await ctx.close();

  // Each candidate opens exactly their own form.
  const allocation = await raw.schoolAiExamFormAllocation.findFirstOrThrow({ where: { schoolId, formLabel: "B" } });
  const student = await raw.student.findUniqueOrThrow({ where: { id: allocation.studentId } });
  const key = [...people.entries()].find(([, user]) => user.userId === student.studentUserId)![0];
  const learnerCtx = await context(key), learnerPage = await learnerCtx.newPage();
  const list = await (await learnerPage.request.get(`${base}/api/school-ai/exams`)).json();
  assert.deepEqual(list.exams.map((exam: { id: string }) => exam.id), [allocation.assignmentId], "the candidate is assigned only their form");
  await learnerPage.goto(`${base}/ai/exams/${allocation.assignmentId}`);
  await learnerPage.getByText("End of term · Form B").first().waitFor();
  await shot(learnerPage, "forms-candidate-form-b-en-1440");
  await learnerCtx.close();
});

test("Arabic lead reads the sealed set right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const space = await openForms(page, /مخطط التقييم/);
  await space.getByText("هذه المجموعة مختومة ومكلَّفة.").waitFor();
  assert.equal(await noOverflow(page), true);
  await space.locator('[data-form="B"]').scrollIntoViewIfNeeded();
  await shot(page, "forms-sealed-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
