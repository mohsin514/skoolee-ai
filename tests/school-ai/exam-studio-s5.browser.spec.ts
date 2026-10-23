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
  const teacherUser = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-teacher@example.invalid" } });
  const ids: string[] = [];
  for (const title of ["Photosynthesis check · week 1", "Photosynthesis check · week 2"]) {
    const created = await office.request.post("/api/school-ai/exams", { headers, data: { idempotencyKey: randomUUID(), paperId: paper.id, title, startsAt: new Date(Date.now() - 120_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: pupils.map(row => row.id), mode: "STANDARD" } });
    expect(created.status(), await created.text()).toBe(201);
    const id = (await created.json()).exam.id; ids.push(id);
    // The sitting is over and every script is marked (the marking desk itself is covered by earlier suites).
    await db.schoolAiExamAssignment.update({ where: { id }, data: { endsAt: new Date(Date.now() - 60_000) } });
    for (const [index, pupil] of pupils.entries()) {
      const script = SCRIPTS[index], user = await db.student.findUniqueOrThrow({ where: { id: pupil.id } });
      const review = { marks: [{ questionId: "q1", marks: script.marks[0], feedback: script.marks[0] ? "Correct gas." : "Plants take in carbon dioxide." }, { questionId: "q2", marks: script.marks[1], feedback: "Inputs named." }], note: "Marked against the rubric.", total: script.marks[0] + script.marks[1] };
      const attempt = await db.schoolAiExamAttempt.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, assignmentId: id, studentId: pupil.id, userId: user.studentUserId!, startedAt: new Date(Date.now() - 110_000), deadlineAt: new Date(Date.now() - 60_000), submittedAt: new Date(Date.now() - 90_000), sequence: 2, status: "REVIEWED", responses: { q1: script.q1, q2: script.q2 }, review, reviewVersion: 1, reviewedById: teacherUser.id, reviewedAt: new Date(Date.now() - 30_000) } });
      await db.schoolAiExamResultRevision.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, assignmentId: id, attemptId: attempt.id, version: 1, review, reason: "Initial marking", createdById: teacherUser.id } });
      if (index === 0 && ids.length === 2) student01AttemptId = attempt.id;
    }
    const released = await office.request.post(`/api/school-ai/exams/${id}/results-release`, { headers });
    expect(released.ok(), await released.text()).toBeTruthy();
  }
  [earlierId, examId] = ids;
  await teacher.close(); await office.close();
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
  await row.locator("[data-plan-outcome]").check();
  const plan = map.locator("[data-next-ten-minutes]");
  await expect(plan.locator("[data-proposal]")).toHaveCount(3);
  await plan.locator("[data-confirm-plan]").click();
  await expect(map.locator("[data-plan-notice]")).toBeVisible();
  const practice = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PRACTICE" }, orderBy: { createdAt: "desc" } });
  expect(((practice.data as { items: unknown[] }).items).length).toBe(3);
  expect(practice.status, "the teacher approves practice under the classroom tier").toBe("APPROVED");
  if (shots) await page.screenshot({ path: `${shots}/mistake-map.png`, fullPage: true });

  const desk = page.locator("[data-family-notes-desk]");
  await desk.locator("[data-draft-notes]").click();
  const rows = desk.locator("[data-family-note-row]");
  await expect(rows).toHaveCount(4);
  const arabic = rows.filter({ hasText: "العربية" });
  await expect(arabic).toHaveCount(1);
  await expect(arabic.locator("textarea")).toHaveValue(/الخطوة التالية/);
  await arabic.locator("[data-send-note]").click();
  await expect(desk.locator('[data-family-note-row="SENT"]')).toHaveCount(1);
  if (shots) await desk.screenshot({ path: `${shots}/family-notes.png` });
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
  if (shots) await page.screenshot({ path: `${shots}/guardian-results-ar.png`, fullPage: true });
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
  if (shots) await page.locator("[data-gradebook-drift]").screenshot({ path: `${shots}/gradebook-drift.png` });
  await office.close(); await student.close(); await hod.close();
  void earlierId;
});
