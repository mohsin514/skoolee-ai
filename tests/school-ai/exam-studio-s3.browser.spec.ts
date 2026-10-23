import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-503 (Exam Studio slice 3) on the synthetic demo tenant, loopback database only: a sealed paper sat on
 * paper. Covers equal pupils; a script is scanned once; an absent pupil cannot be scanned or marked (here or on
 * the office marks sheet) until the office reopens the entry; per-question marks are bounded.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO503_SHOTS;
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

let slotId = "";
test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } });
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const hod = await browser.newContext(); await signIn(hod, "demo-hod@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  slotId = (await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } })).id;
  await db.examPaperSlot.update({ where: { id: slotId }, data: { totalMarks: 5, durationMinutes: 20 } });
  const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER" }, orderBy: { createdAt: "asc" } });
  const paperId = (await (await author.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Science Grade 7 mid-term", idempotencyKey: `s3-${Date.now()}`, data: { ...(source.data as object), slotId, examType: "MID_TERM" } } })).json()).record.id;
  for (const question of ((await paperOf(paperId)).data as { questions: Array<{ id: string }> }).questions) await author.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paperOf(paperId)).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } });
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paperOf(paperId)).version, action: "review" } })).ok()).toBeTruthy();
  expect((await hod.request.post(`/api/academic/paper-slots/${slotId}/moderation`, { headers, data: { paperVersion: (await paperOf(paperId)).version, decision: "SIGNED" } })).ok()).toBeTruthy();
  expect((await author.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paperOf(paperId)).version, findings: [] } })).ok()).toBeTruthy();
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/seal`, { headers, data: { paperVersion: (await paperOf(paperId)).version } })).ok()).toBeTruthy();
  await office.close(); await author.close(); await hod.close();
});

test("covers equal pupils; a script is scanned once; absence blocks scanning and marking until reopened", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  const slot = await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId }, include: { schedules: { include: { exam: true } } } });
  const schedule = slot.schedules.sort((a, b) => a.exam.classId.localeCompare(b.exam.classId))[0];
  const pupils = await db.student.count({ where: { schoolId: DEMO_SCHOOL_ID, classId: schedule.exam.classId, status: "active", archivedAt: null } });
  const print = await context.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${schedule.id}`);
  expect(print.status()).toBe(200);
  const html = await print.text();
  expect((html.match(/data-cover=/g) ?? []).length).toBe(pupils);
  expect(html).toContain(slot.sealHash!.slice(0, 16));
  const scripts = await db.examPaperScript.findMany({ where: { scheduleId: schedule.id }, orderBy: { candidateNo: "asc" } });
  expect(scripts.length).toBe(pupils);

  const page = await context.newPage();
  await page.goto("/principal?view=exam-cycles");
  await page.getByRole("button", { name: /Papers/ }).first().click();
  await page.locator("[data-open-sittings]").click();
  const panel = page.locator("[data-paper-sitting]");
  await expect(panel.locator("[data-sitting-section]")).toHaveCount(2);
  // Scan the first candidate by the code printed under the QR; the second scan is refused.
  await panel.getByLabel("Code printed under the QR").fill(scripts[0].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("Scanned: candidate 1");
  await panel.getByLabel("Code printed under the QR").fill(scripts[0].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("already scanned");
  // Room sheet: the second candidate is absent.
  const section = panel.locator(`[data-sitting-section="${schedule.id}"]`);
  await section.locator(`[data-pupil="${scripts[1].studentId}"] input[type=checkbox]`).check();
  await section.locator("[data-save-room-sheet]").click();
  await expect(panel).toContainText("Room sheet saved");
  await panel.getByLabel("Code printed under the QR").fill(scripts[1].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("recorded absent");
  const subject = await db.subject.findUniqueOrThrow({ where: { id: schedule.subjectId } });
  const officeMark = await context.request.post("/api/marks", { headers, data: { examId: schedule.examId, entries: [{ studentId: scripts[1].studentId, subjectId: subject.id, marksObtained: 3 }] } });
  expect(officeMark.status()).toBe(409);
  // The office reopens (with a reason); the candidate can then be scanned.
  await section.locator(`[data-pupil="${scripts[1].studentId}"] [data-reopen]`).click();
  await section.getByLabel("Reason for reopening").fill("Arrived late with the invigilator's note");
  await section.locator("[data-reopen-confirm]").click();
  await expect(panel).toContainText("Reopened by the office");
  await panel.getByLabel("Code printed under the QR").fill(scripts[1].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("Scanned: candidate 2");
  // Marks for the first candidate, bounded per question.
  await section.locator(`[data-pupil="${scripts[0].studentId}"] [data-enter-marks]`).click();
  const form = page.locator("[data-marks-form]");
  const inputs = form.locator("input[type=number]");
  await inputs.nth(0).fill("2"); await inputs.nth(1).fill("3");
  await form.locator("[data-save-marks]").click();
  await expect(panel).toContainText("Saved: 5 of 5");
  if (shots) await page.screenshot({ path: `${shots}/office-paper-sitting.png`, fullPage: true });
  const marked = await db.examPaperScript.findUniqueOrThrow({ where: { id: scripts[0].id }, select: { total: true } });
  expect(marked.total).toBe(5);
  await context.close();
});
