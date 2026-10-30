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
import { recordRehearsal, reviewItem } from "../../src/lib/school-ai/exam-release-service";
import { contentHash, contentHashPrefix } from "../../src/lib/school-ai/release";
import { paperDataSchema } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 browser acceptance: item review desk, rehearsal blockers, sealed exam and explicit result release.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-evidence";
const raw = new PrismaClient(), password = "SyntheticRelease408!";
const schoolId = `rel408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, draftPaperId = "", examId = "", sealedHash = "";

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
const shotOf = async (page: Page, target: ReturnType<Page["locator"]>, name: string) => { await settled(page); await target.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${evidence}/${name}.png` }); };
async function openPanel(page: Page, tab: string) {
  await page.goto(`${base}/ai`);
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.locator('select[id$="assessment-record"]').selectOption(draftPaperId);
  return page.getByRole("region", { name: /Review, rehearse and release|المراجعة والتجربة والإصدار|جائزہ، مشق اور اجرا/ });
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cedar Studio School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Karachi", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Karachi" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  const learner = await person("learner", "STUDENT"); await person("learner-ur", "STUDENT", "ur");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const learnerIds: string[] = [];
  for (const [index, key] of ["learner", "learner-ur"].entries()) { const id = randomUUID(); learnerIds.push(id); await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: people.get(key)!.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } }); }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  const paperData = { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>;
  const reviewAll = async (paperId: string, by: AuthUser, target: "READY_FOR_REVIEW" | "APPROVED", ids = ["q1", "q2", "q3"]) => { for (const id of ids) { const row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: paperId } }); const question = paperDataSchema.parse(row.data).questions.find(item => item.id === id)!; await reviewItem(by, paperId, { version: row.version, questionId: id, target, itemRevision: question.review?.itemRevision ?? 1 }); } };
  // A draft in review: two items approved, one ready for the lead to approve in the browser.
  draftPaperId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 3 check — in review", data: paperData, idempotencyKey: randomUUID() })).id;
  await reviewAll(draftPaperId, author, "READY_FOR_REVIEW");
  await reviewAll(draftPaperId, lead, "APPROVED", ["q1", "q2"]);
  // A released paper: reviewed, approved, rehearsed clean and assigned.
  const releasedId = (await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 2 test", data: paperData, idempotencyKey: randomUUID() })).id;
  await reviewAll(releasedId, author, "READY_FOR_REVIEW"); await reviewAll(releasedId, lead, "APPROVED");
  let row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: releasedId } });
  await updateWorkspaceRecord(author, releasedId, { version: row.version, action: "review" });
  row = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: releasedId } });
  const approved = await updateWorkspaceRecord(lead, releasedId, { version: row.version, action: "approve" });
  await recordRehearsal(author, releasedId, { version: approved.version, findings: [] });
  sealedHash = contentHash(paperDataSchema.parse(approved.data));
  examId = (await runWithTenantContext({ schoolId, campusId, userId: lead.userId, role: lead.role }, () => createSchoolAiExam(lead, { idempotencyKey: randomUUID(), paperId: releasedId, title: "Unit 2 test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: learnerIds, mode: "STANDARD" }))).id;
  // The first learner submits and is moderated; results stay unreleased.
  const ctx = (user: AuthUser) => <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
  const attempt = await ctx(learner)(() => startSchoolAiExam(learner, examId));
  await ctx(learner)(() => saveSchoolAiAttempt(learner, examId, { sequence: 1, responses: { q1: attempt!.paper.questions[0].options[0].id, q3: "Combine both groups and count them." }, submit: true }));
  const submitted = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId } });
  await ctx(lead)(() => reviewSchoolAiAttempt(lead, examId, submitted.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: 3, feedback: "Clear method." }], note: "Moderated." }));
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the lead approves the last item and a rehearsal defect shows as a release blocker", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = await openPanel(page, "Curriculum & papers");
  await panel.getByText("Ready for review").waitFor();
  const approve = panel.getByRole("button", { name: "Approve item" });
  await approve.waitFor();
  const reviewed = page.waitForResponse(response => response.url().endsWith("/item-review") && response.request().method() === "POST");
  await approve.click();
  assert.equal((await reviewed).status(), 200);
  await panel.locator('[data-item-state="APPROVED"]').nth(2).waitFor();
  await panel.getByRole("combobox", { name: "Question", exact: true }).selectOption({ index: 2 });
  await panel.getByLabel("What is wrong").fill("Option text is ambiguous for learners.");
  await panel.getByRole("button", { name: "Add finding" }).click();
  await panel.getByRole("button", { name: "Record rehearsal" }).click();
  await panel.locator('[data-blocker="REHEARSAL_BLOCKER"]').getByText("Blocking · Reported defect · Question 2").waitFor();
  assert.equal(await raw.schoolAiRehearsal.count({ where: { schoolId, recordId: draftPaperId, blocking: 1 } }), 1);
  await shotOf(page, panel, "release-review-rehearsal-blocker-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the learner's exam shows the sealed version and hash; results appear only after the lead releases them", async () => {
  const learnerCtx = await context("learner-ur", { width: 1440, height: 1000 }), page = await learnerCtx.newPage();
  await page.goto(`${base}/ai/exams/${examId}`);
  await page.getByText(`#${contentHashPrefix(sealedHash)}`, { exact: false }).waitFor();
  await shotOf(page, page.locator("header").first(), "release-sealed-learner-ur-1440");
  await learnerCtx.close();

  await raw.schoolAiExamAssignment.update({ where: { id: examId }, data: { endsAt: new Date(Date.now() - 1000) } });
  const learner = await context("learner"), view = await learner.newPage();
  const before = await view.request.get(`${base}/api/school-ai/exams/${examId}/results`);
  assert.equal((await before.json()).attempt ?? null, null, "moderated results are hidden before release");
  const staffCtx = await context("lead"), staff = await staffCtx.newPage();
  await staff.goto(`${base}/ai/exams/${examId}`);
  const release = staff.getByRole("region", { name: "Release results to learners" });
  await release.getByRole("button", { name: "Release results to learners" }).click();
  await release.getByText("Results released").waitFor();
  assert.ok((await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } })).resultsReleasedAt);
  await shotOf(staff, release, "release-results-staff-en-1440");
  const afterRelease = await view.request.get(`${base}/api/school-ai/exams/${examId}/results`);
  assert.ok((await afterRelease.json()).attempt?.id, "released results reach the learner");
  await view.goto(`${base}/ai/exams/${examId}`);
  await view.getByText("Submission received", { exact: true }).waitFor();
  await settled(view); await view.screenshot({ path: `${evidence}/release-learner-result-en-1440.png`, fullPage: true });
  await staffCtx.close(); await learner.close();
});

test("Arabic lead sees the review desk right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const panel = await openPanel(page, "المناهج والأوراق");
  await panel.getByText("معتمد", { exact: true }).first().waitFor();
  assert.equal(await noOverflow(page), true);
  await shotOf(page, panel, "release-review-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a reviewer compares a regenerated item beside the current one and keeps the current one (R5.5, R5.7)", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const record = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: draftPaperId } });
  const first = (record.data as { questions: Array<{ id: string; prompt: string; marks: number; options: Array<{ id: string; text: string }>; modelAnswer: string; correctOptionId: string | null }> }).questions[0];
  // The provider is not configured in this isolated environment, so only the candidate is synthetic;
  // the server path (receipt, pinning, acceptance) is covered by exam-item-regenerate.database.test.ts.
  await page.route("**/regenerate", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    key: randomUUID(), version: record.version,
    previous: { prompt: first.prompt, marks: first.marks, options: first.options, modelAnswer: first.modelAnswer, correctOptionId: first.correctOptionId },
    candidate: { prompt: `${first.prompt} Show how you know.`, marks: first.marks, options: first.options, modelAnswer: first.modelAnswer, correctOptionId: first.correctOptionId },
    differingFields: ["prompt"],
  }) }));
  const panel = await openPanel(page, "Curriculum & papers");
  await panel.locator(`[data-regenerate="${first.id}"]`).click();
  const compare = panel.locator("[data-item-compare]");
  await compare.waitFor();
  assert.match(await compare.locator('[data-compare-side="candidate"]').innerText(), /Show how you know\./);
  assert.match(await compare.innerText(), /Changed: Question/);
  await shotOf(page, compare, "release-item-compare-en-1440");
  await compare.getByRole("button", { name: "Keep the current item" }).click();
  await compare.waitFor({ state: "detached" });
  assert.equal((await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: draftPaperId } })).version, record.version, "keeping the current item writes nothing");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the paper editor reads streamed generation frames and applies the completed draft (R5.1, R5.2)", async () => {
  const record = await raw.schoolAiRecord.findUniqueOrThrow({ where: { id: draftPaperId } });
  const paper = record.data as { questions: unknown[]; blueprint: { sections: Array<{ questionCount: number }> } };
  const requested = paper.blueprint.sections.reduce((sum, section) => sum + section.questionCount, 0);
  const frames = [
    { type: "stage", stage: "BLUEPRINT", produced: 0, requested }, { type: "stage", stage: "ITEMS", produced: 0, requested },
    ...paper.questions.map(item => ({ type: "item", item })),
    { type: "stage", stage: "KEYS", produced: paper.questions.length, requested }, { type: "stage", stage: "REVIEW", produced: paper.questions.length, requested },
    { type: "complete", paper: record.data },
  ];
  let requestBody: Record<string, unknown> = {};
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  // No approved provider runs here; the route's frames are recorded exactly as the server writes them.
  await page.route("**/api/school-ai/generate-paper/stream", route => { requestBody = route.request().postDataJSON(); return route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: frames.map(frame => JSON.stringify(frame)).join("\n") + "\n" }); });
  await openPanel(page, "Curriculum & papers");
  await page.getByRole("button", { name: /Generate proposed questions/ }).click();
  await page.getByText(/AI output is an editable draft/).first().waitFor();
  assert.ok(typeof requestBody.idempotencyKey === "string" && typeof requestBody.curriculumVersion === "number", "the request now carries the idempotency key and curriculum version the server requires");
  assert.deepEqual(errors, []); await ctx.close();
});
