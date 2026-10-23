import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";
import { seedLeapArc } from "../../scripts/demo/seed-leap-arc";

/**
 * SKO-507: the LEAP five-minute arc (plan §10, docs/leap/demo-runbook.md §6) rehearsed twice from a fresh reset in
 * English and twice in Arabic, against a real local server and database — nothing stubbed. Each beat carries its
 * label from the runbook as a test annotation: LIVE beats are driven and checked here; PLANNED beats (they need the
 * AI provider or a camera) are named and skipped, never imitated. Setup that stands in for a step another slice's
 * suite already drives (paper authoring, marking the sitting's scripts) is marked FIXTURE.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO507_SHOTS;
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
const db = new PrismaClient();
const headers = { Origin: origin };
test.describe.configure({ mode: "serial" });
test.afterAll(async () => { await db.$disconnect(); });

type Label = "LIVE" | "PLANNED" | "FIXTURE";
const beat = (label: Label, time: string, what: string) => test.info().annotations.push({ type: label, description: `${time} ${what}` });
async function signIn(browser: Browser, email: string) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const response = await context.request.post("/api/auth/login", { data: { email, password }, headers });
  expect(response.ok()).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { data: { action: "defer" }, headers })).ok()).toBeTruthy();
  return context;
}
async function open(context: BrowserContext, path: string, language: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(path);
  if (language === "ar") await expect(page.locator('div[lang="ar"][dir="rtl"]').first()).toBeAttached({ timeout: 30_000 });
  return page;
}
const paperOf = (id: string) => db.schoolAiRecord.findUniqueOrThrow({ where: { id }, select: { version: true, data: true } });

for (const language of ["en", "ar"] as const) for (const run of [1, 2]) {
  test(`the five-minute arc from reset · ${language.toUpperCase()} · run ${run}`, async ({ browser }) => {
    await resetDemoTenant(db, password);
    const seeded = await seedLeapArc(db);
    await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: language } });
    const office = await signIn(browser, "demo-principal@example.invalid");
    const teacher = await signIn(browser, "demo-teacher@example.invalid");
    const hod = await signIn(browser, "demo-hod@example.invalid");
    const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });

    beat("LIVE", "0:00", "the office requests every paper in one click; the ledger lists each one");
    expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
    let page = await open(office, "/principal?view=exam-cycles", language);
    await page.locator('[data-exam-step="papers"]').click();
    await expect(page.locator('[data-slot-status="REQUESTED"]').first()).toBeVisible({ timeout: 30_000 });
    if (shots) await page.screenshot({ path: `${shots}/${language}-${run}-0000-ledger.png` });
    await page.close();

    beat("LIVE", "0:20", "the teacher's Exam Studio already knows the job");
    page = await open(teacher, "/ai/studio", language);
    await expect(page.locator("[data-next-step]")).toBeVisible({ timeout: 30_000 });
    await page.close();

    beat("PLANNED", "0:40", "Syllabus Drop from a photographed syllabus (camera and AI provider; not rehearsed here)");
    beat("PLANNED", "1:35", "Blueprint fills from the provider (AI provider; not rehearsed here)");
    beat("FIXTURE", "1:35", "the paper is authored from the approved source instead, as the slice 4 suite does");
    const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID }, orderBy: { gradeName: "asc" } });
    await db.examPaperSlot.update({ where: { id: slot.id }, data: { totalMarks: 5, durationMinutes: 20 } });
    const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER", status: "APPROVED" }, orderBy: { createdAt: "asc" } });
    const paperId = (await (await teacher.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Science Grade 7 mid-term", idempotencyKey: randomUUID(), data: { ...(source.data as object), slotId: slot.id, examType: "MID_TERM" } } })).json()).record.id;
    for (const question of ((await paperOf(paperId)).data as { questions: Array<{ id: string }> }).questions) await teacher.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paperOf(paperId)).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } });
    expect((await teacher.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paperOf(paperId)).version, action: "review" } })).ok()).toBeTruthy();

    beat("PLANNED", "2:15", "the solver flags the ambiguous option (AI provider; not rehearsed here)");
    beat("LIVE", "2:45", "the head of department signs the paper against the pattern");
    expect((await hod.request.post(`/api/academic/paper-slots/${slot.id}/moderation`, { headers, data: { paperVersion: (await paperOf(paperId)).version, decision: "SIGNED" } })).ok()).toBeTruthy();
    expect((await teacher.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paperOf(paperId)).version, findings: [] } })).ok()).toBeTruthy();

    beat("LIVE", "2:55", "one seal; the ledger reads SEALED");
    expect((await office.request.post(`/api/academic/paper-slots/${slot.id}/seal`, { headers, data: { paperVersion: (await paperOf(paperId)).version } })).ok()).toBeTruthy();
    page = await open(office, "/principal?view=exam-cycles", language);
    await page.locator('[data-exam-step="papers"]').click();
    await expect(page.locator('[data-slot-status="SEALED"]').first()).toBeVisible({ timeout: 30_000 });
    await page.close();

    beat("LIVE", "2:15", "the Exam Twin's estimate for the sitting, from this class's earlier released sittings");
    const classA = await db.class.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, section: "A" } });
    const schedule = await db.examSchedule.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, paperSlotId: slot.id, exam: { classId: classA.id } } });
    const learners = await db.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID, classId: classA.id, status: "active", archivedAt: null, studentUserId: { not: null } }, orderBy: { rollNo: "asc" } });
    expect(learners.length).toBe(seeded.learners);
    const created = await office.request.post("/api/school-ai/exams", { headers, data: { idempotencyKey: randomUUID(), paperId, title: "Science mid-term (online)", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: learners.map(row => row.id), mode: "STANDARD", examScheduleId: schedule.id } });
    expect(created.status(), await created.text()).toBe(201);
    const examId = (await created.json()).exam.id as string;
    page = await open(teacher, "/ai/studio#space=improve", language);
    const select = page.locator("[data-improve-space] select").first();
    await expect(select).toBeVisible({ timeout: 30_000 });
    await select.selectOption({ label: "Science mid-term (online)" });
    await expect(page.locator('[data-exam-twin] [data-twin-row="estimate"]').first()).toBeVisible();
    if (shots) await page.locator("[data-exam-twin]").screenshot({ path: `${shots}/${language}-${run}-0215-twin.png` });
    await page.close();

    beat("LIVE", "3:20", "the control room board for the sitting");
    page = await open(office, "/ai/studio#space=control-room", language);
    await expect(page.locator("[data-room-board]")).toBeVisible({ timeout: 30_000 });
    await page.close();
    beat("PLANNED", "3:20", "cable pull and reconnect on the candidate laptop (manual on stage)");
    beat("PLANNED", "4:00", "Script Stream of a photographed marked pile (camera and reader; not rehearsed here)");

    beat("FIXTURE", "4:30", "the sitting closes and its scripts are marked, as the slice 5 suite does");
    await db.schoolAiExamAssignment.update({ where: { id: examId }, data: { endsAt: new Date(Date.now() - 30_000) } });
    const principal = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-principal@example.invalid" } });
    for (const [index, learner] of learners.entries()) {
      const marks = { q1: index < 7 ? 2 : 0, q2: index < 3 ? 3 : index < 8 ? 1 : 0 };
      const review = { marks: [{ questionId: "q1", marks: marks.q1, feedback: "Checked." }, { questionId: "q2", marks: marks.q2, feedback: "Checked." }], note: "Marked against the rubric.", total: marks.q1 + marks.q2 };
      const attempt = await db.schoolAiExamAttempt.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: learner.campusId, assignmentId: examId, studentId: learner.id, userId: learner.studentUserId!, startedAt: new Date(Date.now() - 50_000), deadlineAt: new Date(Date.now() - 30_000), submittedAt: new Date(Date.now() - 40_000), sequence: 2, status: "REVIEWED", responses: { q1: index < 7 ? "o1" : "o2", q2: index < 3 ? "Light, water and carbon dioxide" : "Light" }, review, reviewVersion: 1, reviewedById: principal.id, reviewedAt: new Date() } });
      await db.schoolAiExamResultRevision.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: learner.campusId, assignmentId: examId, attemptId: attempt.id, version: 1, review, reason: "Initial marking", createdById: principal.id } });
    }
    expect((await office.request.post(`/api/school-ai/exams/${examId}/results-release`, { headers })).ok()).toBeTruthy();

    beat("LIVE", "4:30", "Mistake Map → tick one outcome → ten-minute plan → one family note in the guardian's language");
    page = await open(teacher, "/ai/studio#space=improve", language);
    await page.locator("[data-improve-space] select").first().selectOption({ label: "Science mid-term (online)" });
    const map = page.locator("[data-mistake-map]");
    await map.locator("[data-plan-outcome]").first().check();
    await expect(map.locator("[data-next-ten-minutes] [data-proposal]").first()).toBeVisible();
    await expect(page.locator("[data-twin-scored]").first()).toBeVisible();
    const desk = page.locator("[data-family-notes-desk]");
    await desk.locator("[data-draft-notes]").click();
    await expect(desk.locator("[data-family-note-row]").first()).toBeVisible();
    await expect(desk.locator(`textarea[lang="${language}"]`).first()).toBeVisible();
    if (shots) await page.screenshot({ path: `${shots}/${language}-${run}-0430-next-lesson.png`, fullPage: true });

    beat("LIVE", "4:30", "Item Watch on last term's Gases check names the seeded ambiguous item");
    await page.locator("[data-improve-space] select").first().selectOption({ index: (await page.locator("[data-improve-space] select").first().locator("option").allTextContents()).findIndex(text => text.includes("Gases check")) });
    await expect(page.locator('[data-item-watch] [data-watch-item*="TOP_QUARTILE_DISTRACTOR"]')).toHaveCount(1);
    await page.close();

    beat("LIVE", "4:50", "Pilot Ledger: the school joins, the product computes six footnoted tiles");
    page = await open(office, "/ai/pilot-ledger", language);
    await page.locator("[data-ledger-opt-in]").click();
    await page.locator("[data-ledger-compute]").click();
    await expect(page.locator("[data-ledger-tile]")).toHaveCount(6);
    await expect(page.locator('[data-ledger-tile="PL-6"] [data-ledger-value]')).not.toHaveText("");
    if (shots) await page.screenshot({ path: `${shots}/${language}-${run}-0450-ledger.png`, fullPage: true });
    await office.close(); await teacher.close(); await hod.close();
  });
}
