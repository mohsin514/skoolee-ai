import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { schoolSetupCopy } from "../../src/components/school-ai/school-setup-copy";
import type { Language } from "../../src/lib/locale/package";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated setup browser PG55438.");
const db = new PrismaClient(), schoolIds: string[] = [], origin = "http://localhost:3106";
let schoolId = "", campusId = "", adminId = "", classId = "", studentId = "", teacherId = "", newTeacherId = "";
async function signIn(context: BrowserContext) {
  const token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
test.afterAll(async () => { await db.paymentAllocation.deleteMany({ where: { schoolId: { in: schoolIds } } }); await db.school.deleteMany({ where: { id: { in: schoolIds } } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  schoolId = `ai-setup-academics-browser-${randomUUID()}`; schoolIds.push(schoolId); campusId = randomUUID(); adminId = randomUUID(); classId = randomUUID(); studentId = randomUUID();
  await db.school.create({ data: { id: schoolId, name: "Synthetic setup academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Setup campus", city: "Test", regId: campusId } });
  await db.user.create({ data: { id: adminId, schoolId, campusId, email: `${adminId}@example.invalid`, role: "ADMIN", fullName: "Setup reviewer", isActive: true, onboardingComplete: true, mfaEnabled: true, canManageMemberships: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Setup Grade 8", section: "A", academicYear: 2026 } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026 cycle", academicYear: 2026, status: "ACTIVE", startDate: new Date("2026-01-01Z"), endDate: new Date("2026-12-31Z") } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Reviewed learner", rollNo: "1", gender: "OTHER", enrollmentDate: new Date("2026-01-01Z") } });
  teacherId = randomUUID(); newTeacherId = randomUUID();
  await db.user.createMany({ data: [teacherId,newTeacherId].map((id,index) => ({ id, schoolId, campusId, fullName: index ? "New teacher" : "Current teacher", role: "TEACHER" as const, email: `${id}@example.invalid`, isActive: true })) });
  await db.class.update({ where: { id: classId }, data: { teachingMode: "SINGLE", classTeacherId: teacherId } });
  await signIn(context);
});
async function draft(page: Page, language: Language = "en") {
  const t = schoolSetupCopy(language), c = schoolAICopy(language); await page.goto("/ai"); await page.getByRole("button", { name: c.schoolSetup, exact: true }).click(); await page.getByRole("button", { name: t.newPlan, exact: true }).click();
  await page.getByRole("textbox", { name: new RegExp(`^${t.name}`) }).fill("Verified campus resources"); await page.getByRole("textbox", { name: new RegExp(`^${t.sourceReference}`) }).fill("Signed school register reviewed by campus manager");
}
async function saveApprove(page: Page, language: Language = "en") {
  const t = schoolSetupCopy(language), c = schoolAICopy(language), saved = page.waitForResponse(response => /\/api\/school-ai\/workspace$/.test(response.url()) && response.request().method() === "POST"); await page.getByRole("button", { name: c.save, exact: true }).click(); const response = await saved; expect(response.ok(), await response.text()).toBeTruthy();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled(); await page.getByRole("checkbox", { name: t.review, exact: true }).check(); await page.getByRole("button", { name: t.approve, exact: true }).click(); await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeEnabled();
}
async function apply(page: Page, language: Language = "en") {
  const t = schoolSetupCopy(language); await page.getByRole("button", { name: t.preview, exact: true }).click(); const preview = page.getByRole("region", { name: t.preview, exact: true }); await expect(preview).toBeVisible(); await expect(preview.getByRole("button", { name: t.apply, exact: true })).toBeDisabled(); await preview.getByRole("checkbox", { name: t.confirm, exact: true }).check(); await preview.screenshot({ path: test.info().outputPath(`setup-preview-${language}.png`) }); await preview.getByRole("button", { name: t.apply, exact: true }).click(); await expect(page.getByRole("region", { name: t.completed, exact: true })).toBeVisible();
}
async function subjectForm(page: Page, language: Language = "en") {
  const t = schoolSetupCopy(language); await draft(page,language); await page.getByRole("button",{name:t.SUBJECTS,exact:true}).click(); await page.getByRole("combobox",{name:new RegExp(`^${t.classId}`)}).selectOption({label:"Setup campus · Setup Grade 8 A · 2026"}); await page.getByRole("textbox",{name:new RegExp(`^${t.subjectName}`)}).fill("Mathematics"); await page.getByRole("spinbutton",{name:new RegExp(`^${t.totalMarks}`)}).fill("100");
}
async function allocationForm(page:Page, language:Language="en") {
  const t=schoolSetupCopy(language); await draft(page,language); await page.getByRole("button",{name:t.TEACHER_ALLOCATIONS,exact:true}).click(); await page.getByRole("combobox",{name:new RegExp(`^${t.allocationType}`)}).selectOption("CLASS"); await page.getByRole("combobox",{name:new RegExp(`^${t.classId}`)}).selectOption(classId); await expect(page.getByRole("combobox",{name:t.expectedTeacherId,exact:true})).toBeDisabled(); await expect(page.getByRole("combobox",{name:t.expectedTeacherId,exact:true})).toHaveValue(teacherId); await page.getByRole("combobox",{name:t.teacherId,exact:true}).selectOption({label:"New teacher"});
}
test("named subjects and exact class teacher preview produce persistent synchronized lessons",async({page})=>{
  const t=schoolSetupCopy("en"); await subjectForm(page); await saveApprove(page); await apply(page); const subject=await db.subject.findFirstOrThrow({where:{schoolId}}); expect(subject.teacherId).toBe(teacherId);
  const timetable=await db.timetable.create({data:{schoolId,campusId,classId,academicYear:2026,status:"PUBLISHED",term:"TERM_1",slots:{create:{schoolId,subjectId:subject.id,teacherId,dayOfWeek:1,periodNumber:1,startTime:"08:00",endTime:"08:40",slotType:"CLASS"}}},include:{slots:true}});
  await allocationForm(page); await saveApprove(page); await page.getByRole("button",{name:t.preview,exact:true}).click(); const preview=page.getByRole("region",{name:t.preview,exact:true}); await expect(preview.getByText(`${t.before}: Current teacher`,{exact:true}).first()).toBeVisible(); await expect(preview.getByText(`${t.synchronizedSlots}: 1`,{exact:true})).toBeVisible(); await expect(preview).not.toContainText(newTeacherId); await preview.getByRole("checkbox",{name:t.confirm,exact:true}).check(); await preview.getByRole("button",{name:t.apply,exact:true}).click(); await expect(page.getByRole("region",{name:t.completed,exact:true})).toBeVisible(); expect((await db.timetableSlot.findUniqueOrThrow({where:{id:timetable.slots[0].id}})).teacherId).toBe(newTeacherId); await page.reload(); await page.getByRole("button",{name:schoolAICopy("en").schoolSetup,exact:true}).click(); await expect(page.getByRole("region",{name:t.completed,exact:true})).toBeVisible();
});
test("holiday create update and delete use named calendar records and reviewed date changes",async({page})=>{
  const t=schoolSetupCopy("en"); await draft(page); await page.getByRole("button",{name:t.HOLIDAYS,exact:true}).click(); await page.getByRole("combobox",{name:new RegExp(`^${t.calendarYear}`)}).selectOption({label:"2026 cycle · 2026"}); await page.getByRole("textbox",{name:new RegExp(`^${t.holidayName}`)}).fill("Winter break"); await page.locator('input[type="date"]').nth(0).fill("2026-12-20"); await page.locator('input[type="date"]').nth(1).fill("2026-12-25"); await saveApprove(page); await apply(page); const holiday=await db.holiday.findFirstOrThrow({where:{schoolId}});
  for(const action of ["UPDATE","DELETE"] as const){await draft(page);await page.getByRole("button",{name:t.HOLIDAYS,exact:true}).click();await page.getByRole("combobox",{name:new RegExp(`^${t.calendarAction}`)}).selectOption(action);await page.getByRole("combobox",{name:new RegExp(`^${t.calendarYear}`)}).selectOption("2026");await page.getByRole("combobox",{name:new RegExp(`^${t.holidayId}`)}).selectOption(holiday.id);if(action==="UPDATE"){await expect(page.getByRole("textbox",{name:new RegExp(`^${t.holidayName}`)})).toHaveValue("Winter break");await page.locator('input[type="date"]').nth(1).fill("2026-12-27");}await saveApprove(page);await apply(page);if(action==="UPDATE")expect((await db.holiday.findUniqueOrThrow({where:{id:holiday.id}})).toDate.toISOString().slice(0,10)).toBe("2026-12-27");}
  expect(await db.holiday.findUnique({where:{id:holiday.id}})).toBeNull();
});
test("weekly closures show every day and persist the selected usable set",async({page})=>{
  const t=schoolSetupCopy("en");await draft(page);await page.getByRole("button",{name:t.WEEKENDS,exact:true}).click();await expect(page.getByRole("button",{name:t.addRow,exact:true})).toBeDisabled();await page.getByRole("checkbox",{name:t.fridayClosed,exact:true}).check();await saveApprove(page);await apply(page);expect((await db.weekend.findMany({where:{schoolId}})).map(row=>row.dayOfWeek)).toEqual([5]);
});
for(const language of ["ar","ur"] as const)test(`${language} narrow academic form and teacher review are localized and remain within viewport`,async({page})=>{
  await db.user.update({where:{id:adminId},data:{preferredLanguage:language}});await db.subject.create({data:{schoolId,campusId,classId,name:"Mathematics",teacherId}});await page.setViewportSize({width:360,height:800});await allocationForm(page,language);await saveApprove(page,language);await apply(page,language);const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,dir:document.documentElement.dir}));expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);expect(geometry.dir).toBe("rtl");expect((await db.class.findUniqueOrThrow({where:{id:classId}})).classTeacherId).toBe(newTeacherId);
});
