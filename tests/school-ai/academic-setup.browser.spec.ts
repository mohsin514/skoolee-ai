import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";

const localDatabase = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== localDatabase || process.env.DIRECT_URL !== localDatabase) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const schoolId = `ai-setup-browser-${randomUUID()}`;
const campusId = `${schoolId}-campus`, adminId = `${schoolId}-admin`, teacherId = `${schoolId}-teacher`, classId = `${schoolId}-class`, studentId = `${schoolId}-student`;
const origin = "http://localhost:3106";
let token = "";

test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic academic setup academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Synthetic setup campus", city: "Test", regId: campusId } });
  for (const [id, role] of [[adminId, "ADMIN"], [teacherId, "TEACHER"]] as const) await db.user.create({ data: { id, role, schoolId, campusId, email: `${id}@example.test`, fullName: `Synthetic ${role}`, mfaEnabled: true, isActive: true, onboardingComplete: true } });
  await db.academicCycle.create({ data: { schoolId, campusId, academicYear: 2026, label: "Academic QA 2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), status: "DRAFT" } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "A", academicYear: 2026, teachingMode: "SINGLE", classTeacherId: teacherId } });
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic retained learner", gender: "OTHER", rollNo: "RETAIN-1" } });
  token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
});
test.afterAll(async () => {
  await db.schoolAiExecution.deleteMany({ where: { schoolId } });
  await db.school.deleteMany({ where: { id: schoolId } });
  await db.$disconnect();
});
test.beforeEach(async ({ context }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: "en" } });
  await authenticate(context);
});
async function authenticate(context: BrowserContext) {
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function openNew(page: Page) {
  await page.goto("/ai");
  await page.getByRole("button", { name: "Academic setup", exact: true }).click();
  await page.getByRole("button", { name: "New academic plan", exact: true }).click();
}
async function saveAndApprove(page: Page) {
  const response = page.waitForResponse(response => response.url().endsWith("/api/school-ai/workspace") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  const result = await response;
  expect(result.ok(), await result.text()).toBeTruthy();
  const { record } = await result.json();
  await page.getByRole("checkbox", { name: "I reviewed this saved version, including the campus, year, dates and each class.", exact: true }).check();
  await page.getByRole("button", { name: "Approve this plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview changes", exact: true })).toBeEnabled();
  return record.id as string;
}

test("approved year plan changes no school records until explicit apply, preserves memberships and safely retries a lost response", async ({ page }) => {
  await openNew(page);
  await page.getByRole("combobox", { name: "Start from an existing year", exact: true }).selectOption({ label: "Academic QA 2026 · Draft" });
  await expect(page.getByRole("textbox", { name: /^Academic year name/ })).toHaveValue("Academic QA 2026");
  await expect(page.getByLabel("Planned start date", { exact: true })).toHaveValue("2026-01-01");
  await page.getByRole("textbox", { name: /^Class name/ }).fill("Grade 8");
  await page.getByRole("textbox", { name: "Section", exact: true }).fill("A");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await page.getByRole("textbox", { name: /^Class name/ }).nth(1).fill("Grade 9");
  await page.getByRole("textbox", { name: "Section", exact: true }).nth(1).fill("B");
  await page.getByRole("combobox", { name: "Teaching arrangement", exact: true }).nth(1).selectOption("SUBJECT");
  const id = await saveAndApprove(page);
  expect(await db.class.count({ where: { campusId } })).toBe(1);
  expect(await db.schoolAiExecution.count({ where: { schoolId } })).toBe(0);
  await expect(page.getByText("Approval records your reviewed plan. School records change only after you preview and apply it.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Classes to add: 1", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Existing classes to keep: 1", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/school-ai/academic-preview-en.png", fullPage: true });
  await expect(page.getByRole("button", { name: "Apply to school", exact: true })).toBeDisabled();
  const keys: string[] = [];
  let dropped = false;
  await page.route(`**/api/school-ai/workspace/${id}/execute`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().idempotencyKey);
    if (!dropped) {
      dropped = true;
      const result = await route.fetch();
      expect(result.ok(), await result.text()).toBeTruthy();
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("checkbox", { name: "I reviewed these exact changes and authorize applying this version to the selected campus.", exact: true }).check();
  await page.getByRole("button", { name: "Apply to school", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This action could not be completed." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply to school", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Apply to school", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applied to school", exact: true })).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect(await db.schoolAiExecution.count({ where: { schoolId, recordId: id } })).toBe(1);
  expect(await db.class.count({ where: { campusId } })).toBe(2);
  expect((await db.class.findUniqueOrThrow({ where: { id: classId } })).classTeacherId).toBe(teacherId);
  expect((await db.student.findUniqueOrThrow({ where: { id: studentId } })).classId).toBe(classId);
  expect((await db.academicCycle.findFirstOrThrow({ where: { campusId } })).status).toBe("DRAFT");
  await page.reload();
  await page.getByRole("button", { name: "Academic setup", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applied to school", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: /^Class name/ }).first().fill("An unsaved class change");
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Class name/ }).first()).toHaveValue("An unsaved class change");
});

test("an unclosed earlier year gives a localized actionable blocker and creates nothing", async ({ page }) => {
  await openNew(page);
  await page.getByRole("spinbutton", { name: /^Academic year number/ }).fill("2027");
  await page.getByRole("textbox", { name: /^Academic year name/ }).fill("Blocked 2027 plan");
  await page.getByRole("textbox", { name: /^Class name/ }).fill("Grade 1");
  await saveAndApprove(page);
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "An earlier academic year still needs to be closed." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply to school", exact: true })).toHaveCount(0);
  expect(await db.academicCycle.count({ where: { campusId, academicYear: 2027 } })).toBe(0);
  expect(await db.class.count({ where: { campusId, academicYear: 2027 } })).toBe(0);
});

test("duplicate class identities are rejected before save and draft navigation is guarded", async ({ page }) => {
  await openNew(page);
  await page.getByRole("textbox", { name: /^Academic year name/ }).fill("Unsaved duplicate proposal");
  await page.getByRole("textbox", { name: /^Class name/ }).fill("Grade 8");
  await page.getByRole("button", { name: "Add class", exact: true }).click();
  await page.getByRole("textbox", { name: /^Class name/ }).nth(1).fill(" grade 8 ");
  const before = await db.schoolAiRecord.count({ where: { schoolId } });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the highlighted fields." })).toBeVisible();
  expect(await db.schoolAiRecord.count({ where: { schoolId } })).toBe(before);
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Keep your changes?" })).toBeVisible();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "What is ready?", exact: true })).toBeVisible();
});

test("a changed school preview requires fresh confirmation before creating a new draft year", async ({ page }) => {
  await db.academicCycle.updateMany({ where: { campusId, academicYear: 2026 }, data: { status: "ENDED" } });
  await openNew(page);
  await page.getByRole("spinbutton", { name: /^Academic year number/ }).fill("2027");
  await page.getByRole("textbox", { name: /^Academic year name/ }).fill("Academic QA 2027");
  await page.getByRole("textbox", { name: /^Class name/ }).fill("Grade 10");
  await saveAndApprove(page);
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByText("Create a draft academic year", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Classes to add: 1", exact: true })).toBeVisible();
  await db.class.create({ data: { schoolId, campusId, name: "Grade 10", academicYear: 2027, teachingMode: "SINGLE" } });
  await page.getByRole("checkbox", { name: "I reviewed these exact changes and authorize applying this version to the selected campus.", exact: true }).check();
  await page.getByRole("button", { name: "Apply to school", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "School records changed after the preview." })).toBeVisible();
  expect(await db.academicCycle.count({ where: { campusId, academicYear: 2027 } })).toBe(0);
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Existing classes to keep: 1", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "I reviewed these exact changes and authorize applying this version to the selected campus.", exact: true })).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Apply to school", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: "I reviewed these exact changes and authorize applying this version to the selected campus.", exact: true }).check();
  await page.getByRole("button", { name: "Apply to school", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applied to school", exact: true })).toBeVisible();
  expect((await db.academicCycle.findFirstOrThrow({ where: { campusId, academicYear: 2027 } })).status).toBe("DRAFT");
  expect(await db.class.count({ where: { campusId, academicYear: 2027 } })).toBe(1);
});

test("the review inbox opens the requested academic proposal rather than the newest plan", async ({ page }) => {
  await page.goto("/ai");
  const create = async (title: string) => {
    const response = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "WORKFLOW", title, campusId, idempotencyKey: randomUUID(), data: { goal: "Synthetic review routing", steps: [{ id: "academic", title: "Review the academic structure", status: "ready", module: "academics" }], sourceIds: [], missingInformation: [], proposal: { operation: "academics.setup_year", academicYear: 2028, label: title, startDate: null, endDate: null, classes: [{ id: "grade-1", name: "Grade 1", section: null, teachingMode: "SINGLE" }] } } } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).record;
  };
  const review = await create("The requested review plan");
  const submitted = await page.request.patch(`/api/school-ai/workspace/${review.id}`, { headers: { Origin: origin }, data: { version: review.version, action: "review" } });
  expect(submitted.ok(), await submitted.text()).toBeTruthy();
  await create("A more recent unrelated plan");
  await page.reload();
  await page.getByRole("button", { name: "Work & review", exact: true }).click();
  await page.getByRole("button", { name: "Review this record", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Academic year name/ })).toHaveValue("The requested review plan");
});

for (const language of ["ar", "ur"] as const) test(`${language} academic form uses translated controls and fits a 360px viewport`, async ({ page }) => {
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ai");
  const c = schoolAICopy(language);
  await page.getByRole("button", { name: c.academicSetup, exact: true }).click();
  await page.getByRole("button", { name: c.newAcademicPlan, exact: true }).click();
  await expect(page.getByRole("textbox", { name: new RegExp(`^${c.academicYearLabel}`) })).toBeVisible();
  await expect(page.getByRole("combobox", { name: c.teachingMode, exact: true })).toBeVisible();
  const geometry = await page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth, dir: document.documentElement.dir }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width); expect(geometry.dir).toBe("rtl");
});
