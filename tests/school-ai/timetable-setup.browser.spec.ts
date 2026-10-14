import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { timetableSolverCopy } from "../../src/components/school-ai/timetable-solver-copy";
import { timetableSetupCopy } from "../../src/components/school-ai/timetable-setup-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI browser fixture.");
const db = new PrismaClient(), schoolId = `ai-timetable-browser-${randomUUID()}`, origin = "http://localhost:3106";
let campusId = "", adminId = "", teacherId = "", classId = "", subjectId = "", roomId = "";
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic timetable QA", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO" } }); });
test.afterAll(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.delete({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  campusId = randomUUID(); adminId = randomUUID(); teacherId = randomUUID(); classId = randomUUID(); subjectId = randomUUID(); roomId = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Timetable QA campus", city: "Test", regId: campusId } });
  for (const [id, role, fullName] of [[adminId, "ADMIN", "Timetable planner"], [teacherId, "TEACHER", "Assigned Mathematics Teacher"]] as const) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.invalid`, role, fullName, isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId } });
  await db.classRoom.create({ data: { id: roomId, schoolId, campusId, roomNumber: "QA-101", capacity: 0 } });
  await db.periodDefinition.create({ data: { schoolId, campusId, timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" } });
  const token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.invalid`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});
async function openPlan(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = timetableSetupCopy(language);
  await page.goto("/ai"); await page.getByRole("button", { name: c.timetableSetup, exact: true }).click();
  await page.getByRole("button", { name: t.newPlan, exact: true }).click();
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Reviewed weekly timetable");
  await page.getByRole("combobox", { name: new RegExp(`^${t.class}`) }).selectOption(classId);
  await page.getByRole("combobox", { name: t.period, exact: true }).selectOption("1");
  await page.getByRole("combobox", { name: new RegExp(`^${t.subject}`) }).selectOption(subjectId);
  await page.getByRole("combobox", { name: new RegExp(`^${t.room}`) }).selectOption(roomId);
  await expect(page.getByRole("textbox", { name: t.teacher, exact: true })).toHaveValue("Assigned Mathematics Teacher");
  await expect(page.getByLabel(t.start, { exact: true })).toHaveValue("08:00");
}
async function approve(page: Page, language: "en" | "ar" | "ur" = "en") {
  const c = schoolAICopy(language), t = timetableSetupCopy(language);
  const response = page.waitForResponse(response => response.url().endsWith("/api/school-ai/workspace") && response.request().method() === "POST");
  await page.getByRole("button", { name: c.save, exact: true }).click();
  const saved = await response; expect(saved.ok(), await saved.text()).toBeTruthy();
  const { record } = await saved.json();
  await expect(page.getByRole("button", { name: t.approve, exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: t.review, exact: true }).check();
  await page.getByRole("button", { name: t.approve, exact: true }).click();
  await expect(page.getByRole("button", { name: t.preview, exact: true })).toBeEnabled();
  return record.id as string;
}

test("reviewed timetable creates an unpublished draft once and retries a lost response with the same key", async ({ page }) => {
  const t = timetableSetupCopy("en");
  await openPlan(page); const recordId = await approve(page);
  expect(await db.timetable.count({ where: { campusId } })).toBe(0);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.previewTitle, exact: true })).toBeVisible();
  await expect(page.getByText(t.unknownCapacity, { exact: false }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: t.apply, exact: true })).toBeDisabled();
  const keys: string[] = []; let dropped = false;
  await page.route(`**/api/school-ai/workspace/${recordId}/execute`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (!dropped) { dropped = true; const result = await route.fetch(); expect(result.ok()).toBeTruthy(); return route.abort("failed"); }
    return route.continue();
  });
  await page.getByRole("checkbox", { name: t.applyConfirm, exact: true }).check();
  await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: schoolAICopy("en").failed })).toBeVisible();
  await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.receipt, exact: true })).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect(await db.schoolAiExecution.count({ where: { schoolId, recordId } })).toBe(1);
  const timetable = await db.timetable.findFirstOrThrow({ where: { campusId }, include: { slots: true } });
  expect(timetable.status).toBe("DRAFT"); expect(timetable.publishedAt).toBeNull(); expect(timetable.slots).toHaveLength(1); expect(timetable.slots[0].teacherId).toBe(teacherId);
  await page.reload(); await page.getByRole("button", { name: schoolAICopy("en").timetableSetup, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.receipt, exact: true })).toBeVisible();
});
test("an existing teacher/time clash blocks preview and preserves the published schedule", async ({ page }) => {
  const otherClass = await db.class.create({ data: { schoolId, campusId, name: "Other class", academicYear: 2026 } });
  const other = await db.timetable.create({ data: { schoolId, campusId, classId: otherClass.id, academicYear: 2026, status: "PUBLISHED", slots: { create: { schoolId, dayOfWeek: 1, periodNumber: 2, startTime: "08:20", endTime: "09:00", teacherId, roomId, subjectId, slotType: "CLASS" } } }, include: { slots: true } });
  await openPlan(page); await approve(page);
  const t = timetableSetupCopy("en"); await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: t.TIMETABLE_CLASH })).toBeVisible();
  await expect(page.getByRole("button", { name: t.apply, exact: true })).toHaveCount(0);
  expect(await db.timetable.count({ where: { campusId } })).toBe(1);
  expect(await db.timetable.findUniqueOrThrow({ where: { id: other.id }, include: { slots: true } })).toEqual(other);
});
test("changed capacity requires a new preview and dirty edits cannot apply or approve", async ({ page }) => {
  await openPlan(page); await approve(page);
  const t = timetableSetupCopy("en"); await page.getByRole("button", { name: t.preview, exact: true }).click();
  await page.getByRole("checkbox", { name: t.applyConfirm, exact: true }).check();
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Unsaved change");
  await expect(page.getByRole("button", { name: t.apply, exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: new RegExp(`^${t.planName}`) }).fill("Reviewed weekly timetable");
  await db.classRoom.update({ where: { id: roomId }, data: { capacity: 30 } });
  await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: schoolAICopy("en").STALE_EXECUTION_PREVIEW })).toBeVisible();
  expect(await db.timetable.count({ where: { campusId } })).toBe(0);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("checkbox", { name: t.applyConfirm, exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: t.apply, exact: true })).toBeDisabled();
});
test("campus off-days are disabled and a valid Sunday draft remains visible in the shared timetable grid", async ({ page }) => {
  await db.localePolicy.create({ data: { schoolId, campusId, scopeKey: `campus:${campusId}`, status: "ACTIVE", settings: { weekend: [5, 6] }, effectiveAt: new Date(Date.now() - 1000), createdBy: adminId } });
  await openPlan(page);
  const t = timetableSetupCopy("en"), day = page.getByRole("combobox", { name: t.day, exact: true });
  await expect(day.locator('option[value="5"]')).toBeDisabled();
  await expect(day.locator('option[value="7"]')).toBeEnabled();
  await day.selectOption("7"); await approve(page);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await page.getByRole("checkbox", { name: t.applyConfirm, exact: true }).check();
  await page.getByRole("button", { name: t.apply, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.receipt, exact: true })).toBeVisible();
  expect((await db.timetableSlot.findFirstOrThrow({ where: { schoolId, timetable: { campusId } } })).dayOfWeek).toBe(7);
  await page.goto("/admin?view=timetable");
  await page.getByRole("combobox").filter({ has: page.locator(`option[value="${classId}"]`) }).selectOption(classId);
  await expect(page.getByText("Sun", { exact: true }).first()).toBeVisible();
});
for (const language of ["ar", "ur"] as const) test(`${language} timetable controls and exact preview fit a mobile viewport`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 });
  await openPlan(page, language); await approve(page, language);
  const t = timetableSetupCopy(language); await page.getByRole("button", { name: t.preview, exact: true }).click();
  await expect(page.getByRole("heading", { name: t.previewTitle, exact: true })).toBeVisible();
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});

for (const language of ["en", "ar", "ur"] as const) test(`${language} solver reviews suggestions before replacing editable periods`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await db.classRoom.update({ where: { id: roomId }, data: { capacity: 25 } });
  if (language !== "en") await page.setViewportSize({ width: 360, height: 800 });
  await openPlan(page, language);
  const t = timetableSolverCopy(language), setup = timetableSetupCopy(language), c = schoolAICopy(language);
  await page.locator("summary").filter({ hasText: t.title }).click();
  const solver = page.locator("details").filter({ has: page.getByText(t.hint, { exact: true }) });
  await solver.getByRole("checkbox", { name: /^QA-101/ }).check();
  await solver.getByRole("spinbutton", { name: t.weekly, exact: true }).fill("2");
  await solver.getByRole("button", { name: t.solve, exact: true }).click();
  await expect(solver.getByText(t.solved, { exact: true })).toBeVisible();
  await expect(solver.getByRole("button", { name: t.use, exact: true })).toBeDisabled();
  expect(await db.timetable.count({ where: { campusId } })).toBe(0);
  await expect(page.getByRole("textbox", { name: setup.teacher, exact: true })).toHaveCount(1);
  await solver.getByRole("checkbox", { name: t.confirm, exact: true }).check();
  await solver.getByRole("button", { name: t.use, exact: true }).click();
  await expect(page.getByRole("textbox", { name: setup.teacher, exact: true })).toHaveCount(2);
  const savedResponse = page.waitForResponse(response => response.url().endsWith("/api/school-ai/workspace") && response.request().method() === "POST");
  await page.getByRole("button", { name: c.save, exact: true }).click();
  const response = await savedResponse; expect(response.ok(), await response.text()).toBeTruthy();
  expect((await response.json()).record.data.proposal.slots).toHaveLength(2);
  expect(await db.timetable.count({ where: { campusId } })).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
