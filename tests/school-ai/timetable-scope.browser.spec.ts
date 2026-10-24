import { periodChangeCopy } from "../../src/lib/timetable/editor-copy";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { timetableScopeCopy, addPeriodCopy } from "../../src/lib/timetable/editor-copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated timetable browser database.");
const db = new PrismaClient(), schoolId = `ai-scope-${randomUUID()}`, origin = "http://localhost:3106";
let campusId = "", adminId = "", teacherId = "", classId = "", subjectOne = "", subjectTwo = "", roomId = "", roomTwo = "";
test.beforeAll(async () => { await db.school.create({ data: { id: schoolId, name: "Synthetic timetable scope academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } }); });
test.afterAll(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });
test.beforeEach(async ({ context }) => {
  campusId = randomUUID(); adminId = randomUUID(); teacherId = randomUUID(); classId = randomUUID(); subjectOne = randomUUID(); subjectTwo = randomUUID(); roomId = randomUUID(); roomTwo = randomUUID();
  await db.campus.create({ data: { id: campusId, schoolId, name: "Scope campus", city: "Test", regId: campusId } });
  for (const [id, role, fullName] of [[adminId, "ADMIN", "Scope reviewer"], [teacherId, "TEACHER", "Scope teacher"]] as const) await db.user.create({ data: { id, schoolId, campusId, email: `${id}@example.test`, role, fullName, isActive: true, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Scope Grade 8", section: "A", academicYear: 2026, teachingMode: "SUBJECT" } });
  await db.subject.createMany({ data: [{ id: subjectOne, schoolId, campusId, classId, name: "First term Mathematics", teacherId }, { id: subjectTwo, schoolId, campusId, classId, name: "Second term Science", teacherId }] });
  await db.classRoom.createMany({ data: [{ id: roomId, schoolId, campusId, roomNumber: "Scope-101", capacity: 40 }, { id: roomTwo, schoolId, campusId, roomNumber: "Scope-102", capacity: 40 }] });
  await db.periodDefinition.createMany({ data: [{ schoolId, campusId, timeType: "CLASS", periodNumber: 1, startTime: "08:00", endTime: "08:40" }, { schoolId, campusId, timeType: "CLASS", periodNumber: 2, startTime: "08:40", endTime: "09:20" }] });
  const token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});
async function reviewedSchedule(page: Page, term: "TERM_1" | "TERM_2") {
  const draft = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "WORKFLOW", campusId, title: `Reviewed ${term} schedule`, idempotencyKey: randomUUID(), data: { goal: "Create the reviewed term draft", steps: [{ id: "review", title: "Review the schedule", status: "ready", module: "timetable" }], sourceIds: [], missingInformation: [], proposal: { operation: "timetable.create_draft", classId, academicYear: 2026, term, slots: [{ id: "monday", dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", slotType: "CLASS", subjectId: term === "TERM_1" ? subjectOne : subjectTwo, teacherId, roomId }] } } } });
  expect(draft.ok(), await draft.text()).toBeTruthy(); const { record } = await draft.json();
  const approved = await page.request.patch(`/api/school-ai/workspace/${record.id}`, { headers: { Origin: origin }, data: { version: record.version, action: "approve" } });
  expect(approved.ok(), await approved.text()).toBeTruthy(); const saved = (await approved.json()).record;
  const preview = await page.request.get(`/api/school-ai/workspace/${saved.id}/execute?operation=timetable.create_draft&version=${saved.version}`);
  expect(preview.ok(), await preview.text()).toBeTruthy();
  const apply = await page.request.post(`/api/school-ai/workspace/${saved.id}/execute`, { headers: { Origin: origin }, data: { operation: "timetable.create_draft", version: saved.version, previewHash: (await preview.json()).preview.previewHash, idempotencyKey: randomUUID() } });
  expect(apply.ok(), await apply.text()).toBeTruthy();
  return (await apply.json()).execution.timetableId as string;
}
async function openScope(page: Page, term = "TERM_1", language: "en" | "ar" | "ur" = "en") {
  const c = timetableScopeCopy(language);
  await page.goto("/admin?view=timetable");
  await page.getByRole("combobox", { name: c.year, exact: true }).selectOption("2026");
  await page.getByRole("combobox", { name: c.term, exact: true }).selectOption(term);
  await page.getByRole("combobox", { name: c.class, exact: true }).selectOption(classId);
}

test("two reviewed term drafts remain independently selectable, editable and publishable without changing the other", async ({ page }) => {
  const first = await reviewedSchedule(page, "TERM_1"), second = await reviewedSchedule(page, "TERM_2");
  const untouched = await db.timetable.findUniqueOrThrow({ where: { id: second }, include: { slots: true } });
  await openScope(page);
  await expect(page.getByTitle(/^First term Mathematics\nTeacher:/)).toBeVisible();
  await page.getByTitle(/^First term Mathematics\nTeacher:/).click();
  const dialog = page.getByRole("dialog", { name: "Monday — Period 1", exact: true });
  await dialog.getByRole("combobox").filter({ has: page.locator(`option[value="${subjectTwo}"]`) }).selectOption(subjectTwo);
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await page.getByRole("combobox", { name: timetableScopeCopy("en").term, exact: true }).selectOption("TERM_2");
  await expect(page.getByRole("alertdialog", { name: timetableScopeCopy("en").changeTitle, exact: true })).toBeVisible();
  await page.getByRole("button", { name: timetableScopeCopy("en").keep, exact: true }).click();
  await expect(page.getByRole("combobox", { name: timetableScopeCopy("en").term, exact: true })).toHaveValue("TERM_1");
  const save = page.waitForResponse(response => response.url().endsWith(`/api/timetable/${first}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Save Changes", exact: true }).click(); const saved = await save; expect(saved.ok(), await saved.text()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  const publish = page.waitForResponse(response => response.url().endsWith(`/api/timetable/${first}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Publish", exact: true }).click(); const published = await publish; expect(published.ok(), await published.text()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  expect(await db.timetable.findUniqueOrThrow({ where: { id: second }, include: { slots: true } })).toEqual(untouched);
  await page.getByRole("combobox", { name: timetableScopeCopy("en").term, exact: true }).selectOption("TERM_2");
  await expect(page.getByTitle(/^Second term Science\nTeacher:/)).toBeVisible();
  const publishSecond = page.waitForResponse(response => response.url().endsWith(`/api/timetable/${second}`) && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Publish", exact: true }).click(); const secondPublished = await publishSecond; expect(secondPublished.ok(), await secondPublished.text()).toBeTruthy();
  await expect(page.getByRole("button", { name: "Unpublish", exact: true })).toBeVisible();
  expect((await db.timetable.findUniqueOrThrow({ where: { id: first } })).status).toBe("PUBLISHED");
});

test("teacher and room views exclude disjoint terms and older years while retaining the selected schedule", async ({ page }) => {
  await reviewedSchedule(page, "TERM_1"); await reviewedSchedule(page, "TERM_2");
  const oldClass = await db.class.create({ data: { schoolId, campusId, name: "Old-year class", academicYear: 2025 } });
  await db.timetable.create({ data: { schoolId, campusId, classId: oldClass.id, academicYear: 2025, term: "TERM_2", slots: { create: { schoolId, dayOfWeek: 1, periodNumber: 1, startTime: "08:00", endTime: "08:40", teacherId, roomId, slotType: "CLASS" } } } });
  await openScope(page, "TERM_2");
  await page.getByRole("button", { name: "Teacher", exact: true }).click();
  await page.getByRole("combobox").filter({ has: page.locator(`option[value="${teacherId}"]`) }).selectOption(teacherId);
  await expect(page.getByText("1 slot across all classes", { exact: true })).toBeVisible();
  await expect(page.getByText("Second term Science", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("CONFLICT", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Old-year class", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Room", exact: true }).click();
  await expect(page.getByText("P1 · Scope Grade 8 - A", { exact: true })).toHaveCount(1);
  await expect(page.getByText("P1 · Old-year class", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: timetableScopeCopy("en").year, exact: true }).selectOption("2025");
  await expect(page.getByText("P1 · Old-year class", { exact: true })).toHaveCount(1);
  await expect(page.getByText("P1 · Scope Grade 8 - A", { exact: true })).toHaveCount(0);
});

test("a sparse reviewed draft can add an empty period and retry a lost response without changing populated lessons", async ({ page }) => {
  const first = await reviewedSchedule(page, "TERM_1"), second = await reviewedSchedule(page, "TERM_2");
  const original = await db.timetableSlot.findFirstOrThrow({ where: { timetableId: first } });
  const other = await db.timetable.findUniqueOrThrow({ where: { id: second }, include: { slots: true } });
  await openScope(page);
  const c = addPeriodCopy("en");
  await page.getByRole("button", { name: c.title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: c.title, exact: true });
  await dialog.getByRole("combobox", { name: c.day, exact: true }).selectOption("1");
  await dialog.getByRole("combobox", { name: c.period, exact: true }).selectOption("2");
  await expect(dialog.getByLabel(c.start, { exact: true })).toHaveValue("08:40");
  await expect(dialog.getByLabel(c.start, { exact: true })).toHaveAttribute("readonly", "");
  let dropped = false;
  await page.route(`**/api/timetable/${first}/slots`, async route => { if (!dropped) { dropped = true; const response = await route.fetch(); expect(response.ok(), await response.text()).toBeTruthy(); return route.abort("failed"); } return route.continue(); });
  await dialog.getByRole("button", { name: c.title, exact: true }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: c.failed })).toBeVisible();
  await dialog.getByRole("button", { name: c.title, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await db.timetableSlot.count({ where: { timetableId: first } })).toBe(2);
  expect(await db.timetableSlot.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
  const added = await db.timetableSlot.findFirstOrThrow({ where: { timetableId: first, periodNumber: 2, dayOfWeek: 1 } });
  expect(added.subjectId).toBeNull(); expect(added.teacherId).toBeNull(); expect(added.roomId).toBeNull();
  expect(await db.timetable.findUniqueOrThrow({ where: { id: second }, include: { slots: true } })).toEqual(other);
  await page.getByTitle("Free · Monday P2 08:40–09:20", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Monday — Period 2", exact: true })).toBeVisible();
});

for (const language of ["ar", "ur"] as const) test(`${language} timetable scope and add-period dialog expose translated controls at 360px`, async ({ page }) => {
  await reviewedSchedule(page, "TERM_1");
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 });
  await openScope(page, "TERM_1", language);
  const c = addPeriodCopy(language);
  await page.getByRole("button", { name: c.title, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: c.title, exact: true });
  await expect(dialog.getByRole("combobox", { name: c.day, exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: c.period, exact: true })).toBeVisible();
  const geometry = await dialog.evaluate(element => ({ width: window.innerWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, dir: document.documentElement.dir }));
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});

test("period settings review every removed lesson, preserve cancellation and class edits, then clear only confirmed assignments", async ({ page }) => {
  const timetableId = await reviewedSchedule(page, "TERM_1");
  await openScope(page);
  const first = await db.timetableSlot.findFirstOrThrow({ where: { timetableId } });
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  let config = page.getByRole("dialog", { name: "Configure Periods", exact: true });
  await config.locator('input[type="time"]').first().fill("08:05");
  const classSave = page.waitForResponse(response => response.url().endsWith(`/api/timetable/${timetableId}`) && response.request().method() === "PUT");
  await config.getByRole("button", { name: "Save Periods", exact: true }).click();
  expect((await classSave).ok()).toBeTruthy();
  const edited = await db.timetableSlot.findUniqueOrThrow({ where: { id: first.id } });
  expect(edited.startTime).toBe("08:05"); expect(edited.subjectId).toBe(first.subjectId); expect(edited.teacherId).toBe(first.teacherId); expect(edited.roomId).toBe(first.roomId);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  config = page.getByRole("dialog", { name: "Configure Periods", exact: true });
  await config.getByRole("combobox").first().selectOption("BREAK");
  await config.getByRole("button", { name: "Save Periods", exact: true }).click();
  const c = periodChangeCopy("en"), review = page.getByRole("dialog", { name: c.title, exact: true });
  await expect(review.getByText("First term Mathematics", { exact: true })).toBeVisible();
  await expect(review.getByText("Scope teacher", { exact: true })).toBeVisible();
  await expect(review.getByText("Scope-101", { exact: true })).toBeVisible();
  expect(await db.timetableSlot.findUniqueOrThrow({ where: { id: first.id } })).toEqual(edited);
  await review.getByRole("button", { name: c.cancel, exact: true }).click();
  await expect(config.getByRole("combobox").first()).toHaveValue("BREAK");
  expect(await db.timetableSlot.findUniqueOrThrow({ where: { id: first.id } })).toEqual(edited);
  await config.getByRole("button", { name: "Save Periods", exact: true }).click();
  let fail = true;
  await page.route(`**/api/timetable/${timetableId}`, async route => { if (route.request().method() === "PUT" && fail) { fail = false; return route.abort("failed"); } return route.continue(); });
  await review.getByRole("button", { name: c.confirm, exact: true }).click();
  await expect(review.getByRole("alert")).toHaveText(c.failed);
  expect(await db.timetableSlot.findUniqueOrThrow({ where: { id: first.id } })).toEqual(edited);
  const confirmed = page.waitForResponse(response => response.url().endsWith(`/api/timetable/${timetableId}`) && response.request().method() === "PUT");
  await review.getByRole("button", { name: c.confirm, exact: true }).click();
  expect((await confirmed).ok()).toBeTruthy(); await expect(review).toHaveCount(0);
  const cleared = await db.timetableSlot.findUniqueOrThrow({ where: { id: first.id } });
  expect(cleared.slotType).toBe("BREAK"); expect(cleared.subjectId).toBeNull(); expect(cleared.teacherId).toBeNull(); expect(cleared.roomId).toBeNull(); expect(cleared.roomNumber).toBeNull();
  expect(await db.subject.count({ where: { id: subjectOne } })).toBe(1); expect(await db.user.count({ where: { id: teacherId } })).toBe(1); expect(await db.classRoom.count({ where: { id: roomId } })).toBe(1);
});

for (const language of ["ar", "ur"] as const) test(`${language} period removal review remains accessible at 360px and Escape preserves assignments`, async ({ page }) => {
  const timetableId = await reviewedSchedule(page, "TERM_1");
  const before = await db.timetableSlot.findMany({ where: { timetableId } });
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 }); await openScope(page, "TERM_1", language);
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  const config = page.getByRole("dialog", { name: "Configure Periods", exact: true });
  await config.getByRole("combobox").first().selectOption("PRAYER"); await config.getByRole("button", { name: "Save Periods", exact: true }).click();
  const c = periodChangeCopy(language), review = page.getByRole("dialog", { name: c.title, exact: true });
  await expect(review.getByRole("button", { name: c.confirm, exact: true })).toBeVisible();
  const geometry = await review.evaluate(element => ({ width: window.innerWidth, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, dir: document.documentElement.dir }));
  expect(geometry.left).toBeGreaterThanOrEqual(0); expect(geometry.right).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
  await page.keyboard.press("Escape"); await expect(config.getByRole("combobox").first()).toHaveValue("PRAYER");
  expect(await db.timetableSlot.findMany({ where: { timetableId } })).toEqual(before);
});
