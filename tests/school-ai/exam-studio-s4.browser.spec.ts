import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-502 (Exam Studio slice 4) on the synthetic demo tenant, loopback database only: the calm control room.
 * A sealed paper is released online for Grade 7 A; the candidate saves; the on-duty invigilator of Hall 2 (a
 * teacher who neither wrote nor teaches the paper) opens the board through the room roster; a 10-minute
 * extension reaches the candidate's clock; 20 minutes is refused for a teacher; a clarification is acknowledged;
 * the principal sees the board move in the Control room without a reload.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO502_SHOTS;
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
const paperOf = (id: string) => db.schoolAiRecord.findUniqueOrThrow({ where: { id }, select: { version: true, data: true } });

let examId = "", attemptId = "";
test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } });
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const hod = await browser.newContext(); await signIn(hod, "demo-hod@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  const slotId = (await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } })).id;
  await db.examPaperSlot.update({ where: { id: slotId }, data: { totalMarks: 5, durationMinutes: 20 } });
  const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER" }, orderBy: { createdAt: "asc" } });
  const paperId = (await (await author.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Science Grade 7 mid-term", idempotencyKey: `s4-${Date.now()}`, data: { ...(source.data as object), slotId, examType: "MID_TERM" } } })).json()).record.id;
  for (const question of ((await paperOf(paperId)).data as { questions: Array<{ id: string }> }).questions) await author.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paperOf(paperId)).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } });
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paperOf(paperId)).version, action: "review" } })).ok()).toBeTruthy();
  expect((await hod.request.post(`/api/academic/paper-slots/${slotId}/moderation`, { headers, data: { paperVersion: (await paperOf(paperId)).version, decision: "SIGNED" } })).ok()).toBeTruthy();
  expect((await author.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paperOf(paperId)).version, findings: [] } })).ok()).toBeTruthy();
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf(paperId)).version } })).ok()).toBeTruthy();
  // Hall 2 for Grade 7 A's sitting, with the head of Science on duty.
  const paper = (await paperOf(paperId)).data as { classId: string };
  const schedule = await db.examSchedule.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, paperSlotId: slotId, exam: { classId: paper.classId } } });
  const hall = await db.classRoom.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: schedule.campusId, roomNumber: "Hall 2" } as never });
  const examRoom = await db.examRoom.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: schedule.campusId, examScheduleId: schedule.id, roomId: hall.id, isPrimary: true } });
  const hodUser = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-hod@example.invalid" } });
  await db.examInvigilation.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: schedule.campusId, examRoomId: examRoom.id, teacherId: hodUser.id, createdById: hodUser.id } });
  // Online candidates need an account; the demo class has one.
  const pupils = await db.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID, classId: paper.classId, status: "active", archivedAt: null, studentUserId: { not: null } }, select: { id: true } });
  const created = await office.request.post("/api/school-ai/exams", { headers, data: { idempotencyKey: randomUUID(), paperId, title: "Science mid-term (online)", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: pupils.map(row => row.id), mode: "STANDARD", examScheduleId: schedule.id } });
  expect(created.status(), await created.text()).toBe(201);
  examId = (await created.json()).exam.id;
  await office.close(); await author.close(); await hod.close();
});

test("candidate saves; the on-duty invigilator opens the board and extends within the bound; the clock grows", async ({ browser }) => {
  const student = await browser.newContext(); await signIn(student, "demo-student@example.invalid");
  const assignment = await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } });
  const started = await student.request.post(`/api/school-ai/exams/${examId}/attempt`, { headers, data: { version: assignment.version } });
  expect(started.ok(), await started.text()).toBeTruthy();
  const attempt = (await started.json()).attempt; attemptId = attempt.id;
  const saved = await student.request.patch(`/api/school-ai/exams/${examId}/attempt`, { headers, data: { sequence: attempt.sequence + 1, responses: { q2: "Light and water" } } });
  expect(saved.ok(), await saved.text()).toBeTruthy();

  const hod = await browser.newContext(); await signIn(hod, "demo-hod@example.invalid");
  const board = await hod.request.get(`/api/school-ai/exams/${examId}/board`);
  expect(board.ok(), await board.text()).toBeTruthy();
  const body = await board.json();
  expect(body.extendLimit).toBe(15);
  expect(body.rows.find((row: { attemptId: string | null }) => row.attemptId === attemptId).state).toBe("SAVED");
  const before = (await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptId } })).deadlineAt.getTime();
  expect((await hod.request.post(`/api/school-ai/exams/${examId}/extend`, { headers, data: { attemptIds: [attemptId], minutes: 20, reason: "Fire drill", idempotencyKey: randomUUID() } })).status()).toBe(403);
  const key = randomUUID();
  const extended = await hod.request.post(`/api/school-ai/exams/${examId}/extend`, { headers, data: { attemptIds: [attemptId], minutes: 10, reason: "Fire drill", idempotencyKey: key } });
  expect((await extended.json()).outcomes[0].outcome).toBe("EXTENDED");
  const again = await hod.request.post(`/api/school-ai/exams/${examId}/extend`, { headers, data: { attemptIds: [attemptId], minutes: 10, reason: "Fire drill", idempotencyKey: key } });
  expect((await again.json()).outcomes[0].outcome).toBe("ALREADY_APPLIED");
  const after = (await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: attemptId } })).deadlineAt.getTime();
  expect(after - before).toBe(10 * 60_000);
  // The candidate's notice poll carries the new deadline, so an idle clock grows too.
  const notices = await (await student.request.get(`/api/school-ai/exams/${examId}/clarifications`)).json();
  expect(new Date(notices.deadlineAt).getTime()).toBe(after);
  // One clarification, acknowledged by the candidate.
  expect((await hod.request.post(`/api/school-ai/exams/${examId}/clarifications`, { headers, data: { text: "Question 1: choose one gas only.", audience: { kind: "SITTING" } } })).ok()).toBeTruthy();
  const studentNotices = await (await student.request.get(`/api/school-ai/exams/${examId}/clarifications`)).json();
  const ack = await student.request.post(`/api/school-ai/exams/${examId}/clarifications`, { headers, data: { acknowledge: studentNotices.notices[0].id } });
  expect(ack.ok(), await ack.text()).toBeTruthy();
  const staffNotices = await (await hod.request.get(`/api/school-ai/exams/${examId}/clarifications`)).json();
  expect(staffNotices.notices[0].acknowledged).toBe(1);
  await student.close(); await hod.close();
});

test("the principal's Control room board moves without a reload", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  const page = await context.newPage();
  await page.goto("/ai/studio#space=control-room");
  const board = page.locator("[data-room-board]");
  await expect(board).toBeVisible({ timeout: 30_000 });
  await expect(board.locator('[data-board-row="SAVED"]')).toHaveCount(1);
  // Pause the candidate through the API; the board shows it within the polling interval, without a reload.
  const paused = await context.request.post(`/api/school-ai/exams/${examId}/supervision`, { headers, data: { action: "pause", attemptIds: [attemptId], reason: "Candidate unwell" } });
  expect(paused.ok(), await paused.text()).toBeTruthy();
  await expect(board.locator('[data-board-row="PAUSED"]')).toHaveCount(1, { timeout: 12_000 });
  if (shots) await page.screenshot({ path: `${shots}/control-room-board.png`, fullPage: true });
  await context.close();
});
