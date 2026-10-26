import { captureEvidence } from "./screenshot-evidence";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-504 (Exam Studio slice 5) on the synthetic demo tenant, loopback database only. Two released classroom
 * sittings of the photosynthesis check for Grade 7 A: the teacher reads the Mistake Map, ticks the outcome and
 * gets three practice proposals, confirms them, drafts the family notes and sends Student 01's in Arabic; the
 * guardian (Arabic) reads it in Results; the head of department upholds an appeal, which becomes a correction the
 * principal approves; the
 * mark already sent to the gradebook is flagged as drifted.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO504_SHOTS;
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
const db = new PrismaClient();
const headers = { Origin: origin };
test.describe.configure({ mode: "serial" });
test.afterAll(async () => { await db.$disconnect(); });
async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/login", { data: { email, password }, headers });
  expect(response.ok()).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { data: { action: "defer" }, headers })).ok()).toBeTruthy();
}

// q1 is single choice (2 marks, key o1); q2 is short text (3 marks). Student 01 is partly secure.
const SCRIPTS = [{ q1: "o1", q2: "Light and water", marks: [2, 2] }, { q1: "o1", q2: "Light, water and carbon dioxide", marks: [2, 3] }, { q1: "o2", q2: "Soil", marks: [0, 0] }, { q1: "o2", q2: "Water and air", marks: [0, 2] }];
let earlierId = "", examId = "", student01AttemptId = "";
test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } });
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-guardian@example.invalid" }, data: { preferredLanguage: "ar" } });
  const studentUser = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-student@example.invalid" } });
  const pupils = await db.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID, classId: (await db.student.findFirstOrThrow({ where: { studentUserId: studentUser.id } })).classId }, orderBy: { rollNo: "asc" }, take: 4 });
  // Synthetic accounts for Students 02–04, so every script belongs to a learner account as online attempts do.
  for (const pupil of pupils.slice(1)) {
    const user = await db.user.create({ data: { email: `demo-s5-${pupil.rollNo}@example.invalid`.toLowerCase(), password: studentUser.password, fullName: pupil.fullName, role: "STUDENT", schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
    await db.student.update({ where: { id: pupil.id }, data: { studentUserId: user.id } });
  }
  const teacher = await browser.newContext(); await signIn(teacher, "demo-teacher@example.invalid");
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const paper = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER", status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  const ids: string[] = [];
  for (const title of ["Photosynthesis check · week 1", "Photosynthesis check · week 2"]) {
    const created = await office.request.post("/api/school-ai/exams", { headers, data: { idempotencyKey: randomUUID(), paperId: paper.id, title, startsAt: new Date(Date.now() - 120_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: pupils.map(row => row.id), mode: "STANDARD" } });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).exam.id; ids.push(id);
    // Seed only submitted responses; actual teacher requests perform every initial review.
    await db.schoolAiExamAssignment.update({ where: { id }, data: { endsAt: new Date(Date.now() - 60_000) } });
    for (const [index, pupil] of pupils.entries()) {
      const script = SCRIPTS[index], user = await db.student.findUniqueOrThrow({ where: { id: pupil.id } });
      const review = { marks: [{ questionId: "q1", marks: script.marks[0], feedback: script.marks[0] ? "Correct gas." : "Plants take in carbon dioxide." }, { questionId: "q2", marks: script.marks[1], feedback: "Inputs named." }], note: "Marked against the rubric." };
      const attempt = await db.schoolAiExamAttempt.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, assignmentId: id, studentId: pupil.id, userId: user.studentUserId!, startedAt: new Date(Date.now() - 110_000), deadlineAt: new Date(Date.now() - 60_000), submittedAt: new Date(Date.now() - 90_000), sequence: 2, status: "SUBMITTED", responses: { q1: script.q1, q2: script.q2 } } });
      if (index === 0 && ids.length === 2) student01AttemptId = attempt.id;
      else {
        const marked = await teacher.request.patch(`/api/school-ai/exams/${id}/attempts`, { headers, data: { attemptId: attempt.id, review } });
        expect(marked.ok(), await marked.text()).toBeTruthy();
      }
    }
    if (ids.length === 1) {
      const released = await office.request.post(`/api/school-ai/exams/${id}/results-release`, { headers });
      expect(released.ok(), await released.text()).toBeTruthy();
    }
  }
  [earlierId, examId] = ids;
  await teacher.close(); await office.close();
});

test("the subject teacher marks a submitted script; results wait for release and revoked teaching access closes", async ({ browser }) => {
  const teacher = await browser.newContext(); await signIn(teacher, "demo-teacher@example.invalid");
  const learner = await browser.newContext(); await signIn(learner, "demo-student@example.invalid");
  const { improvement: before } = await (await learner.request.get(`/api/school-ai/exams/${examId}/improvement`)).json();
  expect(before.released).toBe(false);
  expect(before.feedback).toBeNull();
  const marking = await (await teacher.request.get(`/api/school-ai/exams/${examId}/attempts`)).json();
  expect(marking.capabilities).toEqual({ canMark: true, canManage: false, canRevise: false, canRelease: false, canApproveAccommodation: false, canSendGradebook: false });
  const keyChange = await teacher.request.patch(`/api/school-ai/exams/${examId}/attempts`, { headers, data: { attemptId: student01AttemptId, review: { marks: [{ questionId: "q1", marks: 0, feedback: "Proposed different key." }, { questionId: "q2", marks: 2, feedback: "Two inputs." }], note: "Initial marking cannot authorize a key correction.", keyCorrections: [{ questionId: "q1", correctOptionId: "o2" }] } } });
  expect(keyChange.status()).toBe(403);
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: student01AttemptId } })).reviewVersion).toBe(0);
  const page = await teacher.newPage();
  await page.goto(`/ai/exams/${examId}`);
  await page.getByLabel("Students with an active login").selectOption(student01AttemptId);
  await expect(page.getByRole("button", { name: "Release results to learners", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Extra time approvals", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Send moderated marks to gradebook", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Recording retention (days)")).toHaveCount(0);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save moderated marks", exact: true }) });
  await form.getByRole("spinbutton").nth(0).fill("2");
  await form.getByRole("spinbutton").nth(1).fill("2");
  await form.getByLabel("Reviewer feedback").nth(0).fill("Correct gas.");
  await form.getByLabel("Reviewer feedback").nth(1).fill("Two inputs named; add carbon dioxide.");
  await form.getByLabel("Moderation note").fill("Marked against the rubric.");
  if (shots) await captureEvidence(page, { path: `${shots}/teacher-marking-rubric.png`, fullPage: true });
  await form.getByRole("button", { name: "Save moderated marks", exact: true }).click();
  await expect.poll(async () => (await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: student01AttemptId } })).status).toBe("REVIEWED");
  const saved = await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: student01AttemptId } });
  expect(saved.reviewVersion).toBe(1);
  expect((saved.review as { total: number }).total).toBe(4);
  expect(await db.schoolAiExamResultRevision.count({ where: { attemptId: saved.id, version: 1 } })).toBe(1);
  await page.getByLabel("Students with an active login").selectOption(student01AttemptId);
  if (shots) await captureEvidence(page, { path: `${shots}/teacher-marking-saved.png`, fullPage: true });
  expect((await teacher.request.post(`/api/school-ai/exams/${examId}/results-release`, { headers })).status()).toBe(403);
  const assignment = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } });
  const subjectId = (assignment.paperSnapshot as { subjectId: string }).subjectId;
  const subject = await db.subject.findUniqueOrThrow({ where: { id: subjectId } });
  // Even the sitting's author loses access when their subject allocation is revoked.
  await db.schoolAiExamAssignment.update({ where: { id: examId }, data: { createdById: saved.reviewedById! } });
  const ownMarking = await (await teacher.request.get(`/api/school-ai/exams/${examId}/attempts`)).json();
  expect(ownMarking.capabilities.canSendGradebook, "teachers retain transfer for their own classroom assessment").toBe(true);
  await db.subject.update({ where: { id: subjectId }, data: { teacherId: null } });
  try { expect([403, 404]).toContain((await teacher.request.get(`/api/school-ai/exams/${examId}/attempts`)).status()); }
  finally {
    await db.subject.update({ where: { id: subjectId }, data: { teacherId: subject.teacherId } });
    await db.schoolAiExamAssignment.update({ where: { id: examId }, data: { createdById: assignment.createdById } });
  }
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const officeMarking = await (await office.request.get(`/api/school-ai/exams/${examId}/attempts`)).json();
  expect(officeMarking.capabilities).toMatchObject({ canMark: true, canManage: true, canRevise: true, canRelease: true, canApproveAccommodation: true, canSendGradebook: true });
  const released = await office.request.post(`/api/school-ai/exams/${examId}/results-release`, { headers });
  expect(released.ok(), await released.text()).toBeTruthy();
  await teacher.close(); await learner.close(); await office.close();
});

test("release → Mistake Map → tick the outcome → three proposals → confirmed practice → one Arabic sentence sent", async ({ browser }) => {
  const context = await browser.newContext(); await signIn(context, "demo-teacher@example.invalid");
  const page = await context.newPage();
  await page.goto("/ai/studio#space=improve");
  const select = page.locator("[data-improve-space] select").first();
  await expect(select).toBeVisible({ timeout: 30_000 });
  await select.selectOption({ label: "Photosynthesis check · week 2" });
  const map = page.locator("[data-mistake-map]");
  await expect(map).toBeVisible();
  const row = map.locator('[data-map-reading="MEASURED"]');
  await expect(row).toHaveCount(1);
  await expect(row.locator("td")).toHaveCount(4);
  if (shots) await captureEvidence(map, { path: `${shots}/mistake-map.png` });
  await row.locator("[data-plan-outcome]").check();
  const plan = map.locator("[data-next-ten-minutes]");
  await expect(plan.locator("[data-proposal]")).toHaveCount(3);
  await plan.locator("[data-confirm-plan]").click();
  await expect(map.locator("[data-plan-notice]")).toBeVisible();
  const practice = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PRACTICE" }, orderBy: { createdAt: "desc" } });
  expect(((practice.data as { items: unknown[] }).items).length).toBe(3);
  expect(practice.status, "the teacher approves practice under the classroom tier").toBe("APPROVED");
  if (shots) await captureEvidence(plan, { path: `${shots}/next-lesson.png` });

  const desk = page.locator("[data-family-notes-desk]");
  await desk.locator("[data-draft-notes]").click();
  const rows = desk.locator("[data-family-note-row]");
  await expect(rows).toHaveCount(4);
  const arabic = rows.filter({ hasText: "العربية" });
  await expect(arabic).toHaveCount(1);
  await expect(arabic.locator("textarea")).toHaveValue(/الخطوة التالية/);
  await arabic.locator("[data-send-note]").click();
  await expect(desk.locator('[data-family-note-row="SENT"]')).toHaveCount(1);
  if (shots) await captureEvidence(desk, { path: `${shots}/family-notes.png` });
  await context.close();
});

test("the Arabic guardian reads the note in Results", async ({ browser }) => {
  const context = await browser.newContext(); await signIn(context, "demo-guardian@example.invalid");
  const page = await context.newPage();
  const student01 = await db.student.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, rollNo: "D7-01" } });
  await page.goto(`/parent/results?studentId=${student01.id}`);
  const note = page.locator("[data-family-note] p[lang=ar]");
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toContainText("الخطوة التالية");
  await expect(page.locator("[data-family-notes] h2")).toHaveText(/ملاحظات المعلمين/);
  if (shots) await captureEvidence(page, { path: `${shots}/guardian-results-ar.png`, fullPage: true });
  await context.close();
});

test("a sent mark is flagged when an upheld appeal's correction changes the result", async ({ browser }) => {
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  // Send the week 2 marks to the gradebook first.
  const target = await db.exam.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, title: { contains: "unit test" } } });
  const preview = await (await office.request.get(`/api/school-ai/exams/${examId}/gradebook?examId=${target.id}&conversion=PROPORTIONAL_WHOLE`)).json();
  expect(preview.preview?.blockers, JSON.stringify(preview)).toEqual([]);
  const sent = await office.request.post(`/api/school-ai/exams/${examId}/gradebook`, { headers, data: { examId: target.id, conversion: "PROPORTIONAL_WHOLE", version: preview.preview.assignmentVersion, previewHash: preview.preview.previewHash, idempotencyKey: randomUUID() } });
  expect(sent.ok(), await sent.text()).toBeTruthy();

  // Student 01 asks for a re-check; the teacher upholds it with corrected marks; the principal approves.
  const student = await browser.newContext(); await signIn(student, "demo-student@example.invalid");
  const appeal = await student.request.post(`/api/school-ai/exams/${examId}/results`, { headers, data: { action: "appeal", data: { version: 1, reason: "I named light and water, which are two inputs.", disputedQuestionIds: ["q2"] } } });
  expect(appeal.ok(), await appeal.text()).toBeTruthy();
  const appealId = (await appeal.json()).result.id;
  // The head of Science decides the re-check (plan §5: HOD or office); the principal is the second reviewer.
  const hod = await browser.newContext(); await signIn(hod, "demo-hod@example.invalid");
  const review = { marks: [{ questionId: "q1", marks: 2, feedback: "Correct gas." }, { questionId: "q2", marks: 3, feedback: "Two inputs named." }], note: "Marked against the rubric." };
  const upheld = await hod.request.post(`/api/school-ai/exams/${examId}/results`, { headers, data: { action: "resolve", data: { appealId, version: 1, status: "UPHELD", resolution: "Two correct inputs were named.", review } } });
  expect(upheld.ok(), await upheld.text()).toBeTruthy();
  const correctionId = (await upheld.json()).result.correctionId;
  expect(correctionId, "an upheld appeal reaches a correction").toBeTruthy();
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: student01AttemptId } })).reviewVersion, "the result waits for the second reviewer").toBe(1);
  const decided = await office.request.post(`/api/school-ai/exams/${examId}/moderation`, { headers, data: { action: "decide", data: { correctionId, version: 1, decision: "APPROVE", note: "Rubric criterion met." } } });
  expect(decided.ok(), await decided.text()).toBeTruthy();
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: student01AttemptId } })).reviewVersion).toBe(2);
  expect((await db.schoolAiExamAppeal.findUniqueOrThrow({ where: { id: appealId } })).status).toBe("RESOLVED");

  const page = await office.newPage();
  await page.goto(`/ai/exams/${examId}`);
  const drift = page.locator('[data-drift-kind="RESULT_CORRECTED"]');
  await expect(drift).toHaveCount(1, { timeout: 30_000 });
  if (shots) await captureEvidence(page.locator("[data-gradebook-drift]"), { path: `${shots}/gradebook-drift.png` });
  await office.close(); await student.close(); await hod.close();
  void earlierId;
});
