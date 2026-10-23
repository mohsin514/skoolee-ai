import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-505 (Exam Studio slice 6) on the synthetic demo tenant, loopback database only. The mid-term date sheet
 * is published (version 1), then republished with Grade 7 A's Science moved to a Thursday (version 2). Student 01
 * (Grade 7 A) sees one list with the paper and an online quiz, the next one with a countdown. The Arabic guardian
 * of Students 01 (7 A) and 07 (7 B) is asked to acknowledge the move for Student 01 only, and opens Student 01's
 * released online result.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO505_SHOTS;
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
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
/** A Thursday at least ten days away, so the move is visibly to a weekday by name. */
function thursday() { const day = new Date(); day.setUTCDate(day.getUTCDate() + 10); while (day.getUTCDay() !== 4) day.setUTCDate(day.getUTCDate() + 1); return isoDay(day); }

let student01 = "", student07 = "";
test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } });
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-guardian@example.invalid" }, data: { preferredLanguage: "ar" } });
  student01 = (await db.student.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, rollNo: "D7-01" } })).id;
  student07 = (await db.student.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, rollNo: "D7-07" } })).id;
  // The office's publication flow (checks, seating, diff) is covered by SKO-413's suite; here the two published
  // versions are written as that flow writes them, with Grade 7 A's Science moved in version 2.
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  const principal = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-principal@example.invalid" } });
  const schedules = await db.examSchedule.findMany({ where: { schoolId: DEMO_SCHOOL_ID, exam: { sessionId: session.id } }, include: { exam: { include: { class: true } }, subject: true } });
  const paperOf = (schedule: (typeof schedules)[number], date: string) => ({ scheduleId: schedule.id, examId: schedule.examId, examTitle: schedule.exam.title, classId: schedule.exam.classId, classLabel: `${schedule.exam.class.name} ${schedule.exam.class.section ?? ""}`.trim(), subjectId: schedule.subjectId, subjectName: schedule.subject.name, totalMarks: schedule.subject.totalMarks, date, startTime: "08:00", endTime: "10:00", rooms: [], candidates: 6, seated: 6 });
  const first = schedules.map(schedule => paperOf(schedule, isoDay(schedule.date)));
  const sectionA = schedules.find(schedule => schedule.exam.class.section === "A")!;
  const second = first.map(paper => paper.scheduleId === sectionA.id ? { ...paper, date: thursday() } : paper);
  await db.examDatesheetVersion.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: session.campusId, sessionId: session.id, version: 1, snapshot: { papers: first }, seatingHash: "s5", publishedById: principal.id, publishedAt: new Date(Date.now() - 86_400_000) } });
  await db.examDatesheetVersion.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: session.campusId, sessionId: session.id, version: 2, snapshot: { papers: second }, seatingHash: "s5", publishedById: principal.id, reason: "Science moved for the science fair.", changes: [{ scheduleId: sectionA.id, paper: "Grade 7 A — Science", kind: "MOVED", before: `${first.find(p => p.scheduleId === sectionA.id)!.date} 08:00–10:00`, after: `${thursday()} 08:00–10:00` }] } });

  // Two online sittings for Grade 7 A: a quiz in two days, and a released check Student 01 already sat.
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const paper = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER", status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  const studentUser = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-student@example.invalid" } });
  const create = async (title: string, startsAt: Date, endsAt: Date) => {
    const created = await office.request.post("/api/school-ai/exams", { headers, data: { idempotencyKey: randomUUID(), paperId: paper.id, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), studentIds: [student01], mode: "STANDARD" } });
    expect(created.status(), await created.text()).toBe(201);
    return (await created.json()).exam.id as string;
  };
  await create("Photosynthesis quiz", new Date(Date.now() + 2 * 86_400_000), new Date(Date.now() + 2 * 86_400_000 + 3_600_000));
  const released = await create("Photosynthesis check", new Date(Date.now() - 120_000), new Date(Date.now() + 3_600_000));
  await db.schoolAiExamAssignment.update({ where: { id: released }, data: { endsAt: new Date(Date.now() - 60_000) } });
  const review = { marks: [{ questionId: "q1", marks: 2, feedback: "Correct gas." }, { questionId: "q2", marks: 2, feedback: "Two inputs; add the third." }], note: "Good work; name all three inputs next time.", total: 4 };
  const pupil = await db.student.findUniqueOrThrow({ where: { id: student01 } });
  const attempt = await db.schoolAiExamAttempt.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, assignmentId: released, studentId: student01, userId: studentUser.id, startedAt: new Date(Date.now() - 110_000), deadlineAt: new Date(Date.now() - 60_000), submittedAt: new Date(Date.now() - 90_000), sequence: 2, status: "REVIEWED", responses: { q1: "o1", q2: "Light and water" }, review, reviewVersion: 1, reviewedById: principal.id, reviewedAt: new Date() } });
  await db.schoolAiExamResultRevision.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: pupil.campusId, assignmentId: released, attemptId: attempt.id, version: 1, review, reason: "Initial marking", createdById: principal.id } });
  expect((await office.request.post(`/api/school-ai/exams/${released}/results-release`, { headers })).ok()).toBeTruthy();
  await office.close();
});

test("a student sees one date sheet with paper and online entries and a countdown", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); await signIn(context, "demo-student@example.invalid");
  const page = await context.newPage();
  await page.goto("/student/timetable");
  const card = page.locator("[data-my-next-paper]");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.locator('[data-timeline-entry="PAPER"]').first()).toBeVisible();
  await expect(card.locator('[data-timeline-entry="ONLINE"]').first()).toBeVisible();
  await expect(card.locator("[data-countdown]")).toHaveText(/Starts in \d+ d \d+ h/);
  await expect(card.locator('[data-next-paper="ONLINE"]')).toContainText("Science");
  if (shots) { await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${shots}/my-next-paper-phone.png`, fullPage: true }); }
  await context.close();
});

test("the Arabic guardian is asked to acknowledge the move for the affected child only", async ({ browser }) => {
  const context = await browser.newContext(); await signIn(context, "demo-guardian@example.invalid");
  const inbox = await (await context.request.get("/api/parent/inbox")).json();
  const items = (inbox.data?.items ?? inbox.items ?? []) as Array<{ kind: string; childId: string; state: string }>;
  const changes = items.filter(item => item.kind === "EXAM_CHANGED");
  expect(changes.map(item => item.childId), JSON.stringify(inbox).slice(0, 400)).toEqual([student01]);
  expect(changes[0].state).toBe("ACTION");
  const page = await context.newPage();
  await page.goto(`/parent/timetable?student=${student01}`);
  const brief = page.locator("[data-family-exam-brief]");
  await expect(brief).toBeVisible({ timeout: 30_000 });
  await expect(brief.locator('[data-brief-item="MOVED"]')).toContainText("نُقل");
  await expect(brief.locator('[data-brief-item="MOVED"]')).toContainText("الخميس");
  if (shots) { await page.waitForLoadState("networkidle"); await brief.screenshot({ path: `${shots}/family-brief-ar.png` }); }
  await brief.locator("[data-acknowledge]").click();
  await expect(brief.locator('[data-brief-acknowledged="yes"]')).toHaveCount(1);
  expect(await db.examBriefReceipt.count({ where: { studentId: student01 } })).toBe(1);
  // Student 07's class did not change, so the sibling's timetable asks nothing.
  await page.goto(`/parent/timetable?student=${student07}`);
  await expect(page.locator("[data-my-next-paper]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-family-exam-brief]")).toHaveCount(0);
  await context.close();
});

test("a released online result opens for the parent", async ({ browser }) => {
  const context = await browser.newContext(); await signIn(context, "demo-guardian@example.invalid");
  const page = await context.newPage();
  await page.goto(`/parent/results?student=${student01}`);
  const results = page.locator("[data-family-exam-results]");
  await expect(results).toBeVisible({ timeout: 30_000 });
  const result = results.locator("[data-family-exam-result]").first();
  await result.locator("summary").click();
  await expect(result.locator("[data-outcome-feedback]")).toBeVisible();
  await expect(result).toContainText("name all three inputs");
  if (shots) await page.screenshot({ path: `${shots}/parent-online-result-ar.png`, fullPage: true });
  await context.close();
});
