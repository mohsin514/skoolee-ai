import { captureEvidence } from "./screenshot-evidence";
import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";
import { publishExam } from "../../src/lib/academic/report-versions";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

/**
 * SKO-506 (Exam Studio slice 7) on the synthetic demo tenant, loopback database only. The principal opens the
 * mid-term and reads "are we ready for <day>?" with each open check named; once the date sheet is published,
 * the papers sealed and printed, the rooms staffed and every pupil seated, the same screen says Ready. An
 * exception recorded on the desk keeps the exam's report cards from publication until it is resolved.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO506_SHOTS;
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

let sessionId = "";
test.beforeAll(async ({ browser }) => {
  await resetDemoTenant(db, password);
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } });
  sessionId = (await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } })).id;
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  expect((await office.request.post(`/api/academic/exam-sessions/${sessionId}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  await office.close();
});

async function openTower(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/principal?view=exam-cycles");
  const tower = page.locator("[data-control-tower]");
  await expect(tower).toBeVisible({ timeout: 30_000 });
  return { page, tower };
}

test("the office reads 'are we ready?' with every open check named, then Ready once the ledger is complete", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  let { page, tower } = await openTower(context);
  await expect(tower).toHaveAttribute("data-ready", "no");
  await expect(tower.locator("[data-tower-rule]")).toContainText("Ready means");
  await expect(tower.locator('[data-tower-paper="open"]')).toHaveCount(2);
  await expect(tower.locator('[data-tower-check="SEALED"][data-ok="no"]')).toHaveCount(2);
  if (shots) { await page.waitForLoadState("networkidle"); await page.waitForTimeout(1500); await captureEvidence(tower, { path: `${shots}/control-tower-not-ready.png` }); }

  // The ledger, completed as the office's own steps record it (each step has its own suite): published
  // version, sealed slot, print run, a staffed room per section, and a seat for every current pupil.
  const principal = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-principal@example.invalid" } });
  const hod = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-hod@example.invalid" } });
  const teacher = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-teacher@example.invalid" } });
  const schedules = await db.examSchedule.findMany({ where: { schoolId: DEMO_SCHOOL_ID, exam: { sessionId } }, include: { exam: { include: { class: true } }, subject: true } });
  await db.examDatesheetVersion.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: schedules[0].campusId, sessionId, version: 1, seatingHash: "s7", publishedById: principal.id, snapshot: { papers: schedules.map(row => ({ scheduleId: row.id, examId: row.examId, examTitle: row.exam.title, classId: row.exam.classId, classLabel: `${row.exam.class.name} ${row.exam.class.section}`, subjectId: row.subjectId, subjectName: row.subject.name, totalMarks: row.subject.totalMarks, date: row.date.toISOString().slice(0, 10), startTime: null, endTime: null, rooms: [], candidates: 6, seated: 6 })) } } });
  const seals = new Map<string, string>();
  for (const [index, row] of schedules.entries()) {
    // One paper request can serve several class sections. Seal that shared paper once;
    // re-sealing it here would correctly invalidate the first section's print evidence.
    let sealHash = seals.get(row.paperSlotId!);
    if (!sealHash) {
      sealHash = `S7${index}-synthetic-seal`.padEnd(64, "0");
      await db.examPaperSlot.update({ where: { id: row.paperSlotId! }, data: { sealedAt: new Date(), sealHash } });
      seals.set(row.paperSlotId!, sealHash);
    }
    const sealPrefix = sealHash.slice(0, 16);
    await db.examPrintRun.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, slotId: row.paperSlotId!, scheduleId: row.id, groupLabel: row.exam.class.section ?? "", candidates: 6, copies: 7, sealPrefix, createdById: principal.id } });
    const hall = await db.classRoom.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, roomNumber: `Hall ${index + 1}` } as never });
    const room = await db.examRoom.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, examScheduleId: row.id, roomId: hall.id, isPrimary: true } });
    await db.examInvigilation.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, examRoomId: room.id, teacherId: index ? hod.id : teacher.id, createdById: principal.id } });
    const pupils = await db.student.findMany({ where: { schoolId: DEMO_SCHOOL_ID, classId: row.exam.classId, status: "active", archivedAt: null } });
    for (const [seat, pupil] of pupils.entries()) {
      await db.examSeat.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, examScheduleId: row.id, examRoomId: room.id, studentId: pupil.id, seatNumber: seat + 1 } });
      await db.examPaperScript.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: row.campusId, slotId: row.paperSlotId!, scheduleId: row.id, studentId: pupil.id, candidateNo: seat + 1, sealPrefix } });
    }
  }
  await page.close();
  ({ page, tower } = await openTower(context));
  await expect(tower).toHaveAttribute("data-ready", "yes");
  await expect(tower.locator("[data-tower-answer]")).toContainText("Ready");
  await expect(tower.locator('[data-tower-paper="ready"]')).toHaveCount(2);
  if (shots) { await page.waitForLoadState("networkidle"); await page.waitForTimeout(1500); await captureEvidence(tower, { path: `${shots}/control-tower-ready.png` }); }
  const firstSlotId = schedules[0].paperSlotId!;
  await db.examPaperSlot.update({ where: { id: firstSlotId }, data: { compromisedAt: new Date() } });
  const compromised = await context.request.get(`/api/academic/exam-sessions/${sessionId}/readiness`);
  expect(compromised.ok()).toBeTruthy();
  const compromisedData = (await compromised.json()).data;
  expect(compromisedData.ready).toBe(false);
  expect(compromisedData.papers.find((paper: { scheduleId: string }) => paper.scheduleId === schedules[0].id).checks).toEqual(expect.arrayContaining([{ check: "SEALED", ok: false }, { check: "DELIVERY", ok: false }]));
  await db.examPaperSlot.update({ where: { id: firstSlotId }, data: { compromisedAt: null } });
  await context.close();
});

test("no report card can be published while an exception is open", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  const { page, tower } = await openTower(context);
  await page.locator("nav[aria-label=\"Exam steps\"] button", { hasText: "Results" }).click();
  const desk = page.locator("[data-exceptions-desk]");
  await expect(desk).toBeVisible();
  const exam = await db.exam.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, sessionId, class: { section: "A" } } });
  await desk.locator("[data-exception-exam]").selectOption(exam.id);
  await desk.locator("[data-exception-student]").selectOption({ index: 1 });
  await desk.locator("[data-exception-kind]").selectOption("ABSENT_MEDICAL");
  await desk.locator("[data-exception-note]").fill("Fever on the day; medical note received.");
  await desk.locator("[data-exception-add]").click();
  await expect(desk.locator('[data-exception="OPEN"]')).toHaveCount(1);
  await expect(tower.locator("[data-tower-exceptions]")).toBeVisible();
  if (shots) await captureEvidence(desk, { path: `${shots}/exceptions-desk.png` });

  // The report-card publication path itself refuses while the exception is open.
  const principal = await db.user.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, email: "demo-principal@example.invalid" } });
  await db.exam.update({ where: { id: exam.id }, data: { status: "PRINCIPAL_REVIEWED" } });
  await expect(runWithTenantContext({ schoolId: DEMO_SCHOOL_ID }, () => publishExam(exam.id, principal.id))).rejects.toThrow(/open exam exceptions/);

  const exception = await db.examException.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, examId: exam.id, status: "OPEN" } });
  const otherSession = await db.examSession.create({ data: { schoolId: DEMO_SCHOOL_ID, campusId: exam.campusId, title: "[Synthetic demo] Other session", term: "other", academicYear: 2026, examType: "MID_TERM" } });
  const wrongSession = await context.request.patch(`/api/academic/exam-sessions/${otherSession.id}/exceptions/${exception.id}`, { headers, data: { version: exception.version, decision: "NO_CHANGE", resolution: "This belongs to a different session." } });
  expect(wrongSession.status()).toBe(404);
  expect((await db.examException.findUniqueOrThrow({ where: { id: exception.id } })).status).toBe("OPEN");
  await db.examSession.delete({ where: { id: otherSession.id } });

  await desk.locator("[data-exception-resolution]").fill("Re-sit on the first free day with the second form.");
  await desk.getByRole("combobox").last().selectOption("RESIT_NEW_FORM");
  await desk.locator("[data-exception-resolve]").click();
  await expect(desk.locator('[data-exception="RESOLVED"]')).toHaveCount(1);
  if (shots) await captureEvidence(desk, { path: `${shots}/exception-resolved.png` });
  // With the exception resolved the guard passes; publication now stops only on its own rule (no reports generated).
  await expect(runWithTenantContext({ schoolId: DEMO_SCHOOL_ID }, () => publishExam(exam.id, principal.id))).rejects.toThrow(/Generate reports first/);
  await context.close();
});
