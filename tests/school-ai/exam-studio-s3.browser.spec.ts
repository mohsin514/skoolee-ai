import { captureEvidence } from "./screenshot-evidence";
import { test, expect, type BrowserContext, type Request } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";
import { paperGradebookCopy } from "../../src/lib/school-ai/paper-gradebook-copy";

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
  if (shots) {
    const covers = await context.newPage();
    await covers.goto(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${schedule.id}`);
    await captureEvidence(covers.locator("[data-cover]").first(), { path: `${shots}/office-candidate-cover-qr.png` });
    await covers.close();
  }

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
  if (shots) await captureEvidence(page, { path: `${shots}/office-script-scanned.png`, fullPage: true });
  await panel.getByLabel("Code printed under the QR").fill(scripts[0].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("already scanned");
  if (shots) await captureEvidence(page, { path: `${shots}/office-duplicate-scan-rejected.png`, fullPage: true });
  // Room sheet: the second candidate is absent.
  const section = panel.locator(`[data-sitting-section="${schedule.id}"]`);
  await expect(section.getByRole("columnheader", { name: "Absent", exact: true })).toBeVisible();
  await section.locator(`[data-pupil="${scripts[1].studentId}"] input[type=checkbox]`).check();
  await section.locator("[data-save-room-sheet]").click();
  await expect(panel).toContainText("Room sheet saved");
  await panel.getByLabel("Code printed under the QR").fill(scripts[1].id);
  await panel.locator("[data-scan-submit]").click();
  await expect(panel).toContainText("recorded absent");
  if (shots) await captureEvidence(page, { path: `${shots}/office-absent-script-rejected.png`, fullPage: true });
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
  await expect(section.locator(`[data-pupil="${scripts[0].studentId}"]`)).toHaveAttribute("data-state", "selected");
  await expect(inputs.first()).toBeFocused();
  await inputs.nth(0).fill("2"); await inputs.nth(1).fill("3");
  if (shots) await captureEvidence(form, { path: `${shots}/office-marks-entered.png` });
  await form.locator("[data-save-marks]").click();
  await expect(panel).toContainText("Saved: 5 of 5");
  await expect(section.locator(`[data-pupil="${scripts[0].studentId}"] [data-enter-marks]`)).toBeFocused();
  if (shots) await captureEvidence(section, { path: `${shots}/office-paper-sitting.png` });
  const marked = await db.examPaperScript.findUniqueOrThrow({ where: { id: scripts[0].id }, select: { total: true } });
  expect(marked.total).toBe(5);
  await context.close();
});

test("script custody rejects wrong slots, invalid marks and a changed seal; completed sections advance the ledger", async ({ browser }) => {
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const teacher = await browser.newContext(); await signIn(teacher, "demo-teacher@example.invalid");
  const student = await browser.newContext(); await signIn(student, "demo-student@example.invalid");
  const guardian = await browser.newContext(); await signIn(guardian, "demo-guardian@example.invalid");
  const slot = await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId }, include: { schedules: { include: { exam: true } } } });
  const scripts = await db.examPaperScript.findMany({ where: { slotId }, orderBy: { candidateNo: "asc" } });
  const marked = scripts.find(script => script.markedAt)!;
  expect((await teacher.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${marked.scheduleId}`)).status()).toBe(403);
  for (const viewer of [student, guardian]) {
    expect((await viewer.request.get(`/api/academic/paper-slots/${slotId}/sitting`)).status()).toBe(404);
    expect((await viewer.request.post("/api/academic/paper-scripts/scan", { headers, data: { code: scripts[2].id } })).status()).toBe(403);
  }
  for (const marks of [{}, { q1: 1 }, { q1: 99, q2: 1 }]) {
    expect((await office.request.post(`/api/academic/paper-scripts/${marked.id}/marks`, { headers, data: { version: marked.version, marks } })).status()).toBe(422);
  }
  expect((await db.examPaperScript.findUniqueOrThrow({ where: { id: marked.id } })).total).toBe(5);

  const candidate = scripts.find(script => !script.scannedAt)!;
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/attendance?scheduleId=${candidate.scheduleId}`, { headers, data: { absentStudentIds: [candidate.studentId] } })).ok()).toBeTruthy();
  const other = await db.examPaperSlot.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: slot.campusId, examSessionId: slot.examSessionId, subjectName: "unrelated", gradeName: slot.gradeName, requestedById: slot.requestedById, dueOn: slot.dueOn, totalMarks: 5, durationMinutes: 20 } });
  try {
    expect((await office.request.post(`/api/academic/paper-slots/${other.id}/attendance/reopen?scheduleId=${candidate.scheduleId}`, { headers, data: { studentId: candidate.studentId, reason: "Must not change another paper's attendance" } })).status()).toBe(404);
    expect((await db.examAttendance.findUniqueOrThrow({ where: { scheduleId_studentId: { scheduleId: candidate.scheduleId, studentId: candidate.studentId } } })).status).toBe("ABSENT");
  } finally { await db.examPaperSlot.delete({ where: { id: other.id } }); }

  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/attendance/reopen?scheduleId=${candidate.scheduleId}`, { headers, data: { studentId: candidate.studentId, reason: "Invigilator confirms this candidate attended" } })).ok()).toBeTruthy();
  // A second absence is locked again even though a prior reopening is retained in the audit trail.
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/attendance?scheduleId=${candidate.scheduleId}`, { headers, data: { absentStudentIds: [candidate.studentId] } })).ok()).toBeTruthy();
  expect((await teacher.request.post(`/api/academic/paper-slots/${slotId}/attendance?scheduleId=${candidate.scheduleId}`, { headers, data: { absentStudentIds: [] } })).status()).toBe(409);
  await db.examPaperScript.update({ where: { id: candidate.id }, data: { sealPrefix: "0000000000000000" } });
  try {
    expect((await office.request.post("/api/academic/paper-scripts/scan", { headers, data: { code: candidate.id } })).status()).toBe(409);
    expect((await office.request.get(`/api/academic/paper-slots/${slotId}/print-run?scheduleId=${candidate.scheduleId}`)).status()).toBe(409);
  } finally { await db.examPaperScript.update({ where: { id: candidate.id }, data: { sealPrefix: candidate.sealPrefix } }); }

  // Complete the first section's attendance and mark every remaining present script.
  const paper = (await paperOf(slot.paperRecordId!)).data as { questions: Array<{ id: string }> };
  for (const script of scripts.filter(script => script.studentId !== candidate.studentId)) {
    if (!script.scannedAt) expect((await office.request.post("/api/academic/paper-scripts/scan", { headers, data: { code: script.id } })).ok()).toBeTruthy();
    const current = await db.examPaperScript.findUniqueOrThrow({ where: { id: script.id } });
    expect((await office.request.post(`/api/academic/paper-scripts/${script.id}/marks`, { headers, data: { version: current.version, marks: Object.fromEntries(paper.questions.map(question => [question.id, 0])) } })).ok()).toBeTruthy();
  }
  // The other section is wholly absent, so no script marks are due for it.
  const otherSchedule = slot.schedules.find(schedule => schedule.id !== candidate.scheduleId)!;
  const otherPupils = await db.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID, classId: otherSchedule.exam.classId, status: "active", archivedAt: null }, select: { id: true } });
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/attendance?scheduleId=${otherSchedule.id}`, { headers, data: { absentStudentIds: otherPupils.map(pupil => pupil.id) } })).ok()).toBeTruthy();
  const summary = await office.request.get(`/api/academic/exam-sessions/${slot.examSessionId}/paper-slots`);
  expect((await summary.json()).data.slots.find((row: { id: string }) => row.id === slotId).status).toBe("MARKED");
  await office.close(); await teacher.close(); await student.close(); await guardian.close();
});

test("office reviews paper outcome evidence and explicitly transfers marks with conversion and an immutable receipt", async ({ browser }) => {
  // Four additional read-only locale/viewport passes reuse this fixture and its one transfer.
  test.setTimeout(120_000);
  const office = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(office, "demo-principal@example.invalid");
  const teacher = await browser.newContext(); await signIn(teacher, "demo-teacher@example.invalid");
  const slot = await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId } });
  const script = await db.examPaperScript.findFirstOrThrow({ where: { slotId, markedAt: { not: null } }, orderBy: { candidateNo: "asc" } });
  const schedule = await db.examSchedule.findUniqueOrThrow({ where: { id: script.scheduleId } });
  const url = `/api/academic/paper-slots/${slotId}/gradebook?scheduleId=${schedule.id}`;
  const preview = async (conversion = "PROPORTIONAL_WHOLE") => {
    const response = await office.request.get(`${url}&conversion=${conversion}`);
    expect(response.ok()).toBeTruthy();
    return (await response.json()).data;
  };
  const saveMarks = async (marks: Record<string, number>) => {
    const current = await db.examPaperScript.findUniqueOrThrow({ where: { id: script.id } });
    expect((await office.request.post(`/api/academic/paper-scripts/${script.id}/marks`, { headers, data: { version: current.version, marks } })).ok()).toBeTruthy();
  };
  await saveMarks({ q1: 1.5, q2: 2 });
  expect((await teacher.request.get(url)).status()).toBe(403);
  expect((await preview("EXACT")).blockers).toContain("CONVERSION_REQUIRED");
  let reviewed = await preview();
  expect(reviewed.blockers).toEqual([]);
  expect(reviewed.rows.find((row: { studentId: string }) => row.studentId === script.studentId)).toMatchObject({ rawTotal: 3.5, targetMark: 14, grade: "B" });
  expect(reviewed.outcomes[0].candidates).toBe(reviewed.rows.filter((row: { isAbsent: boolean }) => !row.isAbsent).length);
  expect(await db.mark.count({ where: { examId: schedule.examId, subjectId: schedule.subjectId } })).toBe(0);
  const paperRecord = await paperOf(slot.paperRecordId!);
  const paperData = paperRecord.data as { curriculumId: string; curriculumVersion: number };
  const curriculum = await db.schoolAiRecord.findUniqueOrThrow({ where: { id: paperData.curriculumId } });
  const curriculumData = curriculum.data as { outcomes: Array<{ id: string; title: string }> };
  await db.schoolAiRecord.update({ where: { id: curriculum.id }, data: { version: { increment: 1 }, data: { ...(curriculum.data as object), outcomes: curriculumData.outcomes.map(outcome => ({ ...outcome, title: `Changed after paper approval: ${outcome.title}` })) } } });
  expect((await preview()).outcomes, "outcome labels use the paper's pinned approved curriculum revision").toEqual(reviewed.outcomes);
  await db.schoolAiRecord.update({ where: { id: curriculum.id }, data: { version: curriculum.version, data: curriculum.data as Prisma.InputJsonValue } });

  const stale = { conversion: "PROPORTIONAL_WHOLE", previewHash: reviewed.previewHash, idempotencyKey: randomUUID() };
  await saveMarks({ q1: 2, q2: 2 });
  expect((await office.request.post(url, { headers, data: stale })).status()).toBe(409);
  await saveMarks({ q1: 1.5, q2: 2 });
  await db.exam.update({ where: { id: schedule.examId }, data: { isLocked: true, status: "LOCKED" } });
  const locked = await preview();
  expect(locked.blockers).toContain("TARGET_LOCKED");
  expect((await office.request.post(url, { headers, data: { ...stale, previewHash: locked.previewHash } })).status()).toBe(409);
  await db.exam.update({ where: { id: schedule.examId }, data: { isLocked: false, status: "ACTIVE" } });
  const conflict = await db.mark.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: slot.campusId, examId: schedule.examId, subjectId: schedule.subjectId, studentId: script.studentId, marksObtained: 1 } });
  const existing = await preview();
  expect(existing.blockers).toContain("MARKS_EXIST");
  expect((await office.request.post(url, { headers, data: { ...stale, previewHash: existing.previewHash } })).status()).toBe(409);
  await db.mark.delete({ where: { id: conflict.id } });

  const page = await office.newPage(); await page.goto("/principal?view=exam-cycles");
  await page.getByRole("button", { name: /Papers/ }).first().click();
  await page.locator("[data-open-sittings]").click();
  const panel = page.locator(`[data-paper-gradebook="${schedule.id}"]`);
  const desktopEvidence = async (stage: "preview" | "receipt" | "history") => {
    if (!shots) return;
    await panel.locator(":scope > header").scrollIntoViewIfNeeded();
    await captureEvidence(page, { path: `${shots}/office-paper-gradebook-${stage}.png`, fullPage: false });
    if (stage !== "history") {
      const table = panel.getByRole("table").locator("..");
      await table.scrollIntoViewIfNeeded();
      await captureEvidence(table, { path: `${shots}/office-paper-gradebook-${stage}-table.png` });
    }
    if (stage === "preview") {
      const outcomes = panel.locator("[data-paper-outcome-evidence]");
      await outcomes.scrollIntoViewIfNeeded();
      await captureEvidence(outcomes, { path: `${shots}/office-paper-outcome-evidence.png` });
    }
  };
  const reopenGradebook = async (language: "en" | "ar", width: number, transferred: boolean) => {
    await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-principal@example.invalid" }, data: { preferredLanguage: language } });
    await office.addCookies([{ name: "skoolee-lang", value: language, url: origin }]);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/principal?view=exam-cycles");
    await page.locator('[data-exam-step="papers"]').click();
    await page.locator("[data-open-sittings]").click();
    await panel.locator("[data-paper-gradebook-preview]").click();
    if (!transferred) {
      await panel.locator("[data-paper-gradebook-conversion]").selectOption("PROPORTIONAL_WHOLE");
      await expect(panel.locator("[data-paper-gradebook-send]")).toBeEnabled();
    } else await expect(panel).toContainText(paperGradebookCopy(language).sent);
    await expect(page.locator("html")).toHaveAttribute("dir", language === "ar" ? "rtl" : "ltr");
  };
  const mobileEvidence = async (transferred: boolean) => {
    const writes: string[] = [];
    const observe = (request: Request) => {
      if (!["GET", "HEAD"].includes(request.method()) && /\/api\/(academic\/paper-|marks)/.test(new URL(request.url()).pathname)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    };
    page.on("request", observe);
    try {
      for (const language of ["en", "ar"] as const) {
        await reopenGradebook(language, 390, transferred);
        const t = paperGradebookCopy(language);
        const cards = panel.locator("[data-paper-gradebook-mobile]");
        await expect(cards).toBeVisible();
        await expect(cards.locator("li")).toHaveCount(reviewed.rows.length);
        await expect(panel.getByRole("table", { name: t.title, exact: true })).toBeHidden();
        expect(await panel.evaluate(element => getComputedStyle(element).direction)).toBe(language === "ar" ? "rtl" : "ltr");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
        if (transferred) {
          await expect(panel.locator("[data-paper-gradebook-send]")).toHaveCount(0);
          await panel.locator("summary").click();
          await expect(panel.locator("details")).toHaveAttribute("open", "");
          await panel.getByRole("button", { name: t.refresh, exact: true }).click({ trial: true });
        } else await panel.locator("[data-paper-gradebook-send]").click({ trial: true });
        const firstCard = cards.locator("li").first();
        await firstCard.scrollIntoViewIfNeeded();
        await expect(firstCard).toBeInViewport({ ratio: 0.95 });
        const bounds = await firstCard.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(-1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
        await expect(firstCard).toContainText(transferred ? t.transferred : t.target);
        if (shots) await captureEvidence(page, { path: `${shots}/office-paper-gradebook-${transferred ? "receipt" : "preview"}-mobile-${language}.png`, fullPage: false });
      }
      expect(writes, "responsive evidence must not transfer, mark or change attendance").toEqual([]);
    } finally {
      page.off("request", observe);
      await reopenGradebook("en", 1440, transferred);
    }
  };
  await panel.locator("[data-paper-gradebook-preview]").click();
  await expect(panel).toContainText("Choose scaling");
  await panel.locator("[data-paper-gradebook-conversion]").selectOption("PROPORTIONAL_WHOLE");
  await expect(panel.locator("[data-paper-gradebook-send]")).toBeEnabled();
  await expect(panel.locator("[data-paper-outcome-evidence]")).toBeVisible();
  await desktopEvidence("preview");
  await mobileEvidence(false);
  reviewed = await preview();
  const sendResponse = page.waitForResponse(response => response.url().includes("/gradebook?") && response.request().method() === "POST");
  await panel.locator("[data-paper-gradebook-send]").click();
  const sent = await sendResponse;
  expect(sent.ok()).toBeTruthy();
  const sentBody = sent.request().postDataJSON();
  const receipt = (await sent.json()).data.receipt;
  await expect(panel).toContainText("Transfer receipt:");
  const sentSection = page.locator(`[data-sitting-section="${schedule.id}"]`);
  await expect(sentSection.locator("[data-save-room-sheet]")).toBeDisabled();
  await expect(sentSection.locator("[data-enter-marks]").first()).toBeDisabled();
  await expect(sentSection.locator("[data-reopen]")).toHaveCount(0);
  await expect(sentSection.locator("[data-paper-transferred]")).toContainText("gradebook correction");
  await desktopEvidence("receipt");
  await mobileEvidence(true);
  const marks = await db.mark.findMany({ where: { examId: schedule.examId, subjectId: schedule.subjectId } });
  expect(marks).toHaveLength(reviewed.rows.length);
  expect(marks.find(mark => mark.studentId === script.studentId)).toMatchObject({ marksObtained: 14, grade: "B", isAbsent: false });
  expect(marks.find(mark => mark.isAbsent)).toMatchObject({ marksObtained: 0, grade: null, isExempt: false });
  expect((await db.exam.findUniqueOrThrow({ where: { id: schedule.examId } })).status).toBe("MARKS_ENTRY");
  expect(await db.reportCard.count({ where: { examId: schedule.examId } })).toBe(0);
  expect(await db.schoolAiExamAttempt.count({ where: { schoolId: DEMO_SCHOOL_ID } })).toBe(0);
  const replay = await office.request.post(url, { headers, data: sentBody });
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).data).toMatchObject({ replayed: true, receipt: { id: receipt.id } });
  expect(await db.auditLog.count({ where: { schoolId: DEMO_SCHOOL_ID, tableName: "exam_paper_gradebook_transfers", recordId: schedule.id } })).toBe(1);
  const recalled = await preview("EXACT");
  expect(recalled.conversion).toBe("PROPORTIONAL_WHOLE");
  expect(recalled.rows.find((row: { studentId: string }) => row.studentId === script.studentId).targetMark).toBe(14);
  const transferred = marks.find(mark => mark.studentId === script.studentId)!;
  await db.mark.update({ where: { id: transferred.id }, data: { marksObtained: 13, grade: "C", correctionVersion: 1 } });
  const changed = await preview();
  expect(changed.drift).toEqual([{ studentId: script.studentId, fullName: reviewed.rows.find((row: { studentId: string }) => row.studentId === script.studentId).fullName, sent: 14, current: 13 }]);
  expect(changed.rows.find((row: { studentId: string }) => row.studentId === script.studentId).targetMark, "the receipt preserves what was sent").toBe(14);
  await panel.getByRole("button", { name: "Refresh preview", exact: true }).click();
  await expect(panel).toContainText(paperGradebookCopy("en").drift);
  const driftNote = panel.locator(`[data-paper-gradebook-drift="${script.studentId}"]:visible`);
  await expect(driftNote).toHaveText("Current gradebook: 13");
  await expect(driftNote.locator("..")).toHaveText(/^14\s*Current gradebook: 13$/);
  await driftNote.scrollIntoViewIfNeeded();
  if (shots) await captureEvidence(panel.getByRole("table").locator(".."), { path: `${shots}/office-paper-gradebook-drift.png` });
  await db.mark.update({ where: { id: transferred.id }, data: { marksObtained: 14, grade: "B", correctionVersion: 0 } });
  const current = await db.examPaperScript.findUniqueOrThrow({ where: { id: script.id } });
  expect((await office.request.post(`/api/academic/paper-scripts/${script.id}/marks`, { headers, data: { version: current.version, marks: { q1: 0, q2: 0 } } })).status()).toBe(409);
  const absent = marks.find(mark => mark.isAbsent)!;
  expect((await office.request.post(`/api/academic/paper-slots/${slotId}/attendance/reopen?scheduleId=${schedule.id}`, { headers, data: { studentId: absent.studentId, reason: "Official results now require a gradebook correction" } })).status()).toBe(409);
  const pupil = await db.student.findUniqueOrThrow({ where: { id: script.studentId } });
  await db.student.update({ where: { id: pupil.id }, data: { archivedAt: new Date(), fullName: "Renamed after transfer" } });
  await db.schoolAiRecord.update({ where: { id: slot.paperRecordId! }, data: { version: { increment: 1 } } });
  await db.examPaperSlot.update({ where: { id: slotId }, data: { compromisedAt: new Date() } });
  await db.exam.update({ where: { id: schedule.examId }, data: { status: "LOCKED", isLocked: true } });
  const historical = await preview();
  expect(historical.receipt, "the receipt remains readable after seal invalidation and exam locking").toEqual(receipt);
  expect(historical.rows, "archived or renamed pupils retain their transfer identity and scores").toEqual(receipt.rows);
  expect(historical.outcomes, "historical evidence does not shrink with the current roster").toEqual(reviewed.outcomes);
  expect(historical.drift).toEqual([]);
  expect((await office.request.post(url, { headers, data: sentBody })).ok()).toBeTruthy();
  await panel.getByRole("button", { name: "Refresh preview" }).click();
  await expect(panel).toContainText(pupil.fullName);
  await desktopEvidence("history");
  await db.student.update({ where: { id: pupil.id }, data: { archivedAt: pupil.archivedAt, fullName: pupil.fullName } });
  await db.schoolAiRecord.update({ where: { id: slot.paperRecordId! }, data: { version: paperRecord.version } });
  await db.examPaperSlot.update({ where: { id: slotId }, data: { compromisedAt: slot.compromisedAt } });
  await db.exam.update({ where: { id: schedule.examId }, data: { status: "MARKS_ENTRY", isLocked: false } });
  await office.close(); await teacher.close();
});
