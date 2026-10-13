import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { examSessionPlanCopy } from "../../src/components/school-ai/exam-session-plan-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI database.");
const db = new PrismaClient(), schoolId = `exam-plan-browser-${randomUUID()}`, origin = "http://localhost:3106";
let campusId = "", classId = "", roomId = "", teacherId = "", alternateId = "", actorId = "", periodId = "";
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic exam operations", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO" } }); });
test.afterAll(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  campusId = randomUUID(); classId = randomUUID(); roomId = randomUUID(); teacherId = randomUUID(); alternateId = randomUUID(); actorId = randomUUID(); periodId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Exam QA campus", regId: campusId, city: "Test" } });
  for (const [id, role, fullName] of [[actorId, "ADMIN", "Exam planner"], [teacherId, "TEACHER", "Exam invigilator"], [alternateId, "TEACHER", "Alternative invigilator"]] as const) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, role, fullName, isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", academicYear: 2026 } });
  await db.subject.create({ data: { schoolId, campusId, classId, name: "Mathematics", totalMarks: 100 } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "Exam-101", capacity: 30 } });
  await db.periodDefinition.create({ data: { id: periodId, schoolId, campusId, timeType: "EXAM", periodNumber: 1, startTime: "09:00", endTime: "10:00" } });
  await db.student.create({ data: { schoolId, campusId, classId, fullName: "Synthetic candidate", rollNo: "1", gender: "MALE" } });
  const token = await new SignJWT({ userId: actorId, schoolId, campusId, role: "ADMIN", email: `${actorId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: actorId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});
async function openPlan(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = examSessionPlanCopy(language);
  await page.goto("/ai"); await page.getByRole("button", { name: c.examPlanning, exact: true }).click();
  await page.getByRole("button", { name: t.newPlan, exact: true }).click();
  await page.getByRole("textbox", { name: new RegExp(`^${t.titleField}`) }).fill("Reviewed exam session");
  await page.getByRole("combobox", { name: t.class, exact: true }).selectOption(classId);
  await page.getByRole("button", { name: t.addClass, exact: true }).click();
  await page.getByLabel(new RegExp(`^${t.date}`)).fill("2026-10-14");
  await page.getByRole("combobox", { name: new RegExp(`^${t.period}`) }).selectOption(periodId);
  await page.getByRole("combobox", { name: t.room, exact: true }).selectOption(roomId);
  await page.getByRole("combobox", { name: new RegExp(`^${t.invigilator}`) }).selectOption(teacherId);
}
async function approve(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = examSessionPlanCopy(language);
  const response = page.waitForResponse(response => response.url().endsWith("/api/school-ai/workspace") && response.request().method() === "POST");
  await page.getByRole("button", { name: c.save, exact: true }).click(); const saved = await response; expect(saved.ok(), await saved.text()).toBeTruthy();
  const { record } = await saved.json(); await page.getByRole("checkbox", { name: t.review, exact: true }).check(); await page.getByRole("button", { name: t.approve, exact: true }).click();
  await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeEnabled(); return record.id as string;
}
test("connected exam plan previews candidates, retries a lost creation response once and edits live duties", async ({ page }) => {
  const t = examSessionPlanCopy("en"), c = schoolAICopy("en"); await openPlan(page); const recordId = await approve(page);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.previewTitle, exact: true })).toBeVisible();
  await page.getByText(t.showSeats, { exact: true }).click(); await expect(page.getByText(/S1 · 1 · Synthetic candidate/)).toBeVisible();
  const keys: string[] = []; let dropped = false;
  await page.route(`**/api/school-ai/workspace/${recordId}/execute`, async route => {
    if (route.request().method() !== "POST") return route.continue(); keys.push(route.request().postDataJSON().idempotencyKey);
    if (!dropped) { dropped = true; const response = await route.fetch(); expect(response.ok()).toBeTruthy(); return route.abort("failed"); } return route.continue();
  });
  await page.getByRole("checkbox", { name: t.confirm, exact: true }).check(); await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: c.failed })).toBeVisible(); await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.receipt, exact: true })).toBeVisible(); expect(keys.length).toBe(2); expect(keys[0]).toBe(keys[1]);
  expect(await db.examSession.count({ where: { campusId, status: "PLANNING" } })).toBe(1); expect(await db.exam.count({ where: { campusId, status: "DRAFT" } })).toBe(1);
  const duties = page.locator("section").filter({ has: page.getByRole("heading", { name: t.duties, exact: true }) }).last();
  await duties.getByRole("combobox", { name: t.invigilator, exact: true }).selectOption(alternateId); await duties.getByRole("button", { name: c.save, exact: true }).click();
  await expect(duties.getByText(t.dutySaved, { exact: true })).toBeVisible(); expect((await db.examInvigilation.findFirstOrThrow({ where: { campusId } })).teacherId).toBe(alternateId);
  await duties.getByRole("combobox", { name: t.invigilator, exact: true }).selectOption(""); await duties.getByRole("button", { name: c.save, exact: true }).click();
  await expect(duties.getByText(t.dutySaved, { exact: true })).toBeVisible(); expect(await db.examInvigilation.count({ where: { campusId } })).toBe(0);
});
test("reviewed accessibility controls change the actual physical seating allocation",async({page})=>{const t=examSessionPlanCopy("en");await db.classRoom.update({where:{id:roomId},data:{rows:3,benchesPerRow:3,seatsPerBench:3,examSeatsPerBench:1}});const student=await db.student.findFirstOrThrow({where:{campusId}});await openPlan(page);await page.getByText(`${t.supportTitle} (0)`,{exact:true}).click();await page.getByRole("button",{name:t.loadCandidates,exact:true}).click();await expect(page.getByRole("button",{name:t.addSupport,exact:true})).toBeEnabled();await page.getByRole("button",{name:t.addSupport,exact:true}).click();await page.getByRole("combobox",{name:t.supportCandidate,exact:true}).selectOption(student.id);await page.getByRole("checkbox",{name:t.frontRow,exact:true}).check();await page.getByRole("checkbox",{name:t.edgeSeat,exact:true}).check();await page.getByRole("checkbox",{name:t.extraSpacing,exact:true}).check();await page.getByRole("textbox",{name:t.supportReference,exact:true}).fill("School approval SEAT-1");await page.getByRole("checkbox",{name:t.supportConfirm,exact:true}).check();await approve(page);await page.getByRole("button",{name:t.preview,exact:true}).click();await page.getByText(t.showSeats,{exact:true}).click();await expect(page.getByText(/R1-B1 · 1 · Synthetic candidate/)).toBeVisible();await expect(page.getByText(/School approval SEAT-1/)).toBeVisible();await page.getByRole("checkbox",{name:t.confirm,exact:true}).check();await page.getByRole("button",{name:t.apply,exact:true}).click();await expect(page.getByRole("heading",{name:t.receipt,exact:true})).toBeVisible();const seat=await db.examSeat.findFirstOrThrow({where:{campusId,studentId:student.id}});expect(seat.rowNo).toBe(1);expect(seat.benchNo).toBe(1);});
test("dirty edits and changed candidates cannot apply an old exam preview", async ({ page }) => {
  const t = examSessionPlanCopy("en"); await openPlan(page); await approve(page); await page.getByRole("button", { name: t.preview, exact: true }).click();
  await page.getByRole("checkbox", { name: t.confirm, exact: true }).check();
  await page.getByRole("textbox", { name: new RegExp(`^${t.titleField}`) }).fill("Unsaved edit"); await expect(page.getByRole("button", { name: t.apply, exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: new RegExp(`^${t.titleField}`) }).fill("Reviewed exam session");
  await db.student.updateMany({ where: { campusId }, data: { fullName: "Corrected candidate" } });
  await page.getByRole("button", { name: t.apply, exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: t.STALE_EXECUTION_PREVIEW })).toBeVisible();
  expect(await db.examSession.count({ where: { campusId } })).toBe(0);
  await page.getByRole("button", { name: t.preview, exact: true }).click(); await expect(page.getByRole("checkbox", { name: t.confirm, exact: true })).not.toBeChecked();
});
for (const language of ["ar", "ur"] as const) test(`${language} exam planning and exact seats fit the shared mobile RTL layout`, async ({ page }) => {
  await db.user.update({ where: { id: actorId }, data: { preferredLanguage: language } }); await page.setViewportSize({ width: 360, height: 800 });
  await db.classRoom.update({where:{id:roomId},data:{rows:3,benchesPerRow:3,seatsPerBench:3,examSeatsPerBench:1}});
  await openPlan(page, language); const t = examSessionPlanCopy(language),student=await db.student.findFirstOrThrow({where:{campusId}});await page.getByText(`${t.supportTitle} (0)`,{exact:true}).click();await page.getByRole("button",{name:t.loadCandidates,exact:true}).click();await page.getByRole("button",{name:t.addSupport,exact:true}).click();await page.getByRole("combobox",{name:t.supportCandidate,exact:true}).selectOption(student.id);await page.getByRole("checkbox",{name:t.frontRow,exact:true}).check();await page.getByRole("textbox",{name:t.supportReference,exact:true}).fill("SEAT-RTL-1");await page.getByRole("checkbox",{name:t.supportConfirm,exact:true}).check();await approve(page, language);await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.previewTitle, exact: true })).toBeVisible(); await page.getByText(t.showSeats, { exact: true }).click();
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
  await page.screenshot({path:`test-results/school-ai/seating-support-${language}.png`,fullPage:true});
});
test("owner without selected campus can edit owned plans while locked papers and mismatched campus are refused", async ({ page, context }) => {
  const t = examSessionPlanCopy("en"); await openPlan(page); await approve(page); await page.getByRole("button", { name: t.preview, exact: true }).click(); await page.getByRole("checkbox", { name: t.confirm, exact: true }).check(); await page.getByRole("button", { name: t.apply, exact: true }).click(); await expect(page.getByRole("heading", { name: t.receipt, exact: true })).toBeVisible();
  const schedule = await db.examSchedule.findFirstOrThrow({ where: { campusId }, include: { exam: true } });
  await db.user.update({ where: { id: actorId }, data: { role: "SUPER_ADMIN", campusId: null } });
  const token = await new SignJWT({ userId: actorId, schoolId, campusId: null, role: "SUPER_ADMIN", email: `${actorId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: actorId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
  for (const url of [`/api/academic/exam-schedule?examId=${schedule.examId}`, `/api/academic/exam-schedule/rooms?scheduleId=${schedule.id}`, `/api/academic/exam-sessions/${schedule.exam.sessionId}`, `/api/academic/exam-schedule/bulk?sessionId=${schedule.exam.sessionId}`]) { const response = await page.request.get(url); expect(response.status(), await response.text()).toBe(200); }
  let response = await page.request.patch("/api/academic/exam-schedule", { data: { id: schedule.id, date: "2026-10-14" } }); expect(response.status(), await response.text()).toBe(200);
  response = await page.request.patch("/api/academic/exam-sessions", { data: { id: schedule.exam.sessionId, title: "Owner reviewed session" } }); expect(response.status(), await response.text()).toBe(200);
  response = await page.request.patch("/api/academic/exam-schedule", { data: { id: schedule.id, campusId: randomUUID(), date: "2026-10-14" } }); expect(response.status()).toBe(403);
  await db.exam.update({ where: { id: schedule.examId }, data: { isLocked: true } });
  response = await page.request.patch("/api/academic/exam-schedule", { data: { id: schedule.id, date: "2026-10-14" } }); expect(response.status()).toBe(409);
  response = await page.request.delete(`/api/academic/exam-schedule?id=${schedule.id}`); expect(response.status()).toBe(409);
  response = await page.request.post("/api/academic/exam-schedule/bulk", { data: { sessionId: schedule.exam.sessionId, subjectName: "Mathematics", date: "2026-10-14", periodDefinitionId: periodId, mode: "check" } }); expect(response.status()).toBe(409);
  expect(await db.examSeat.count({ where: { examScheduleId: schedule.id } })).toBe(1);
});
test("locking and returning an exam coordinate with datesheet writes and preserve report totals", async ({ page }) => {
  const subject = await db.subject.findFirstOrThrow({ where: { classId } }), student = await db.student.findFirstOrThrow({ where: { classId } });
  await db.subject.create({ data: { schoolId, campusId, classId, name: "Unrelated Science", totalMarks: 100 } });
  const exam = await db.exam.create({ data: { schoolId, campusId, classId, subjectId: subject.id, title: "Subject specific exam", term: "TERM_1", academicYear: 2026, examType: "MID_TERM", totalMarks: 100, status: "MARKS_ENTRY" } });
  const schedule = await db.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: subject.id, date: new Date("2026-10-14"), periodDefinitionId: periodId } });
  await db.mark.create({ data: { schoolId, campusId, examId: exam.id, subjectId: subject.id, studentId: student.id, marksObtained: 80 } });
  const [locked, scheduled] = await Promise.all([page.request.post(`/api/exams/${exam.id}/lock`), page.request.patch("/api/academic/exam-schedule", { data: { id: schedule.id, date: "2026-10-14" } })]);
  expect(locked.status(), await locked.text()).toBe(200); expect([200, 409]).toContain(scheduled.status());
  const report = await db.reportCard.findFirstOrThrow({ where: { examId: exam.id } }); expect(report.totalMarks).toBe(100); expect(report.obtainedMarks).toBe(80);
  expect((await db.exam.findUniqueOrThrow({ where: { id: exam.id } })).isLocked).toBe(true);
  const results = await Promise.all([1, 2].map(() => page.request.post(`/api/exams/${exam.id}/reject`, { data: { reason: "Check this mark again" } })));
  expect(results.map(result => result.status()).sort()).toEqual([200, 409]);
  expect(await db.reportCard.count({ where: { examId: exam.id } })).toBe(0); expect((await db.exam.findUniqueOrThrow({ where: { id: exam.id } })).rejectionCount).toBe(1);
  await db.exam.update({ where: { id: exam.id }, data: { status: "PUBLISHED", isLocked: true } });
  expect((await page.request.post(`/api/exams/${exam.id}/reject`, { data: { reason: "Cannot alter published results" } })).status()).toBe(409);
});
test("reactivating a cancelled exam cannot restore conflicting reservations", async ({ page }) => {
  const subject = await db.subject.findFirstOrThrow({ where: { classId } });
  const exams = await Promise.all(["CANCELLED", "ACTIVE"].map((status, n) => db.exam.create({ data: { schoolId, campusId, classId, title: `Term ${n}`, term: `TERM_${n + 1}`, academicYear: 2026, examType: "MID_TERM", totalMarks: 100, status } })));
  for (const exam of exams) await db.examSchedule.create({ data: { schoolId, campusId, examId: exam.id, subjectId: subject.id, date: new Date("2026-10-14"), periodDefinitionId: periodId } });
  let response = await page.request.patch("/api/exams", { data: { id: exams[0].id, status: "ACTIVE" } }); expect(response.status(), await response.text()).toBe(409);
  expect((await db.exam.findUniqueOrThrow({ where: { id: exams[0].id } })).status).toBe("CANCELLED");
  await db.exam.delete({ where: { id: exams[1].id } });
  response = await page.request.patch("/api/exams", { data: { id: exams[0].id, status: "ACTIVE" } }); expect(response.status(), await response.text()).toBe(200);
});
