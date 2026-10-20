import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { USER_ROLES, dashboardPathForRole, type UserRole } from "../../src/lib/roles";
import { launchCopy } from "../../src/components/onboarding/launch-copy";
import { roleGuideCopy } from "../../src/components/onboarding/role-guide-copy";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { setupGenerationCopy } from "../../src/components/school-ai/setup-generation-copy";
import { setupQuestions, type SetupAnswers } from "../../src/lib/school-ai/onboarding";

const database = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== database || process.env.DIRECT_URL !== database) throw Error("Only the isolated local test database is allowed.");
const db = new PrismaClient();
const schoolId = `password-onboarding-${randomUUID()}`;
const campusId = `${schoolId}-campus`;
const password = "SyntheticOnboardingOnly!2026";
const c = launchCopy("en");
const sessions = new Map<UserRole, Awaited<ReturnType<BrowserContext["storageState"]>>>();
test.use({ video: process.env.ONBOARDING_RECORD_VIDEO === "1" ? { mode: "on", size: { width: 1440, height: 1000 } } : "off" });

test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Password Journey · Synthetic", slug: schoolId, regId: schoolId, city: "Lahore", contactEmail: `super_admin-${schoolId}@example.test`, status: "ACTIVE", plan: "PRO", registrationKind: "GROUP" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Password Campus · Synthetic", city: "Lahore", regId: campusId } });
  const hash = await bcrypt.hash(password, 10);
  for (const role of USER_ROLES) await db.user.create({ data: {
    id: `${schoolId}-${role}`, schoolId, campusId: ["APP_OWNER", "SUPER_ADMIN"].includes(role) ? null : campusId,
    email: `${role.toLowerCase()}-${schoolId}@example.test`, fullName: `Synthetic ${role}`, role,
    password: hash, onboardingComplete: false, mustChangePassword: false, preferredLanguage: "en", isInstitutionOwner: role === "SUPER_ADMIN",
  } });
});
test.afterAll(async () => { await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });

async function passwordLogin(page: Page, role: UserRole) {
  await page.goto("/login");
  await page.locator("#email").fill(`${role.toLowerCase()}-${schoolId}@example.test`);
  await page.locator("#password").fill(password);
  const login = page.waitForResponse(response => response.url().endsWith("/api/auth/login") && response.request().method() === "POST");
  await page.locator("form button[type=submit]").click();
  const response = await login;
  expect(response.status()).toBe(200);
  const result = await response.json();
  if (result.mfaRequired) {
    await expect(page).toHaveURL(/\/protect-account/);
    const setup = page.waitForResponse(response => response.url().endsWith("/api/auth/mfa") && response.request().postDataJSON()?.action === "setup");
    await page.getByRole("button", { name: "Set up authenticator", exact: true }).click();
    // Read the same newly issued key shown to this synthetic user and enter a real TOTP.
    const { secret } = await (await setup).json();
    await page.locator("#mfa-code").fill(totp(secret));
    await page.locator("form button[type=submit]").click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Enter workspace", exact: true }).click();
  }
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
}

for (const role of USER_ROLES) {
  test(`password login automatically opens personal onboarding for ${role}`, async ({ page, context }) => {
    await passwordLogin(page, role);
    await expect(page.getByRole("heading", { name: roleGuideCopy(role, "en").title, exact: true })).toBeVisible();
    await expect(page.locator("[data-launch-guide] [data-guide-persona]")).toHaveAttribute("data-guide-persona", role);
    if (role === "SUPER_ADMIN") await expect(page).toHaveURL(/\/onboarding$/);
    if (role === "TEACHER") await expect(page).toHaveURL(/\/teacher-onboarding$/);
    const welcome = await (await context.request.get("/api/auth/welcome")).json();
    expect(welcome.context.role).toBe(role);
    expect(welcome.context.completed).toBe(false);
    expect(welcome.context.actions.length).toBeGreaterThan(0);
    expect(await db.user.findUniqueOrThrow({ where: { id: `${schoolId}-${role}` } })).toMatchObject({ onboardingComplete: false, welcomeCompletedAt: null });
    sessions.set(role, await context.storageState());
    if (role === "CAMPUS_ADMIN") {
      await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
      await page.screenshot({ path: "test-results/launch-guide/evidence/20-password-login-campus-guide.png", animations: "disabled" });
    }
  });
}

async function restore(context: BrowserContext, page: Page, role: UserRole = "CAMPUS_ADMIN") {
  const saved = sessions.get(role);
  if (saved) await context.addCookies(saved.cookies);
  else {
    await passwordLogin(page, role);
    sessions.set(role, await context.storageState());
  }
}

test("default overview query automatically opens incomplete welcome", async ({ page, context }) => {
  await restore(context, page);
  await page.goto("/admin?view=overview");
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
});

test("initial welcome failure offers visible retry with no context and recovers", async ({ page, context }) => {
  await restore(context, page);
  await page.route("**/api/auth/welcome", route => route.fulfill({ status: 503, json: { error: "Synthetic outage" } }));
  await page.goto("/admin?view=overview");
  await expect(page.getByRole("alert").filter({ hasText: c.loadFailed })).toBeVisible();
  await page.unroute("**/api/auth/welcome");
  await page.getByRole("button", { name: c.openGuide, exact: true }).click();
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
});

test("welcome response taking longer than ten seconds still automatically opens", async ({ page, context }) => {
  await restore(context, page);
  await page.route("**/api/auth/welcome", async route => {
    await new Promise(resolve => setTimeout(resolve, 11500));
    await route.continue();
  });
  await page.goto("/admin?view=overview");
  await expect(page.getByRole("button", { name: c.loadingGuide, exact: true })).toBeVisible();
  await expect(page.locator("[data-launch-guide]")).toBeVisible({ timeout: 25000 });
});

test("meaningful workflow deep links stay uninterrupted while replay remains available", async ({ page, context }) => {
  await restore(context, page);
  await page.goto("/ai?workflow=overview");
  await expect(page.getByRole("button", { name: c.replay, exact: true })).toBeVisible();
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  await expect(page.locator("[data-ai-workflow-launchpad]")).toBeVisible();
  await page.getByRole("button", { name: c.replay, exact: true }).click();
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
});

test("completed welcome stays completed across default overview reload while role setup is separate", async ({ page, context }) => {
  await restore(context, page, "PRINCIPAL");
  await page.goto(dashboardPathForRole("PRINCIPAL"));
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
  await page.getByRole("button", { name: "Explore on my own", exact: true }).click();
  await page.goto(`${dashboardPathForRole("PRINCIPAL")}?view=overview`);
  await expect(page.getByRole("button", { name: c.replay, exact: true })).toBeVisible();
  await expect(page.locator("[data-launch-guide]")).toHaveCount(0);
  const account = await db.user.findUniqueOrThrow({ where: { id: `${schoolId}-PRINCIPAL` } });
  expect(account.welcomeCompletedAt).not.toBeNull();
  expect(account.onboardingComplete).toBe(false);
});

test("campus guide runs through every interview answer, generates scoped drafts and opens a workflow", async ({ page, context }) => {
  await restore(context, page);
  await page.goto("/admin?view=overview");
  await expect(page.locator("[data-launch-guide]")).toBeVisible();
  await page.getByRole("button", { name: c.next, exact: true }).click();
  await page.getByRole("button", { name: c.continue, exact: true }).click();
  const acknowledge = page.waitForResponse(response => response.url().endsWith("/api/auth/welcome") && response.request().method() === "POST");
  await page.locator("[data-guide-actions]").getByRole("button", { name: c.task("aiSetup"), exact: true }).click();
  const acknowledged = await acknowledge;
  expect(acknowledged.status(), acknowledged.ok() ? undefined : await acknowledged.text()).toBe(200);
  await expect(page).toHaveURL(/\/ai\?setup=1$/);
  const copy = schoolAICopy("en"), generation = setupGenerationCopy("en");
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("[data-guide-persona]")).toHaveAttribute("data-guide-persona", "CAMPUS_ADMIN");
  const answers: SetupAnswers = {
    schoolName: "Password Campus", country: "Pakistan", timezone: "Asia/Karachi", campuses: "One campus in Lahore",
    grades: "Grades 1 to 5", academicYear: "2026–2027", startDate: "2026-08-01", endDate: "2027-06-30",
    workingDays: "Monday to Friday", firstOutcome: "complete", curriculum: "Pakistan national curriculum, English and Mathematics",
    assessmentPolicy: "Monthly formative assessment and two term exams", resources: "Five classrooms and one science lab",
    staff: "Five class teachers, one principal", feePolicy: "Monthly tuition PKR 5000 due on the 10th",
    students: "100 students in grades 1 to 5", communications: "Monthly parent updates in English",
  };
  const questions = setupQuestions({ path: "new", answers });
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index];
    await expect(dialog.getByRole("heading", { name: copy[question.label], exact: true })).toBeVisible();
    if (question.type === "outcome") await dialog.getByRole("button", { name: copy.complete, exact: true }).click();
    else if (question.key !== "path") await dialog.getByLabel(copy.answer, { exact: true }).fill(answers[question.key]!);
    await dialog.getByRole("button", { name: index === questions.length - 1 ? generation.finish : copy.next, exact: true }).click();
  }
  await expect(dialog.getByText(generation.ready, { exact: true })).toBeVisible();
  await expect(dialog.getByText(generation.prototypeHint, { exact: true })).toBeVisible();
  const saved = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId, campusId, kind: "ONBOARDING" } });
  expect((saved.data as { answers: SetupAnswers }).answers).toEqual(answers);
  const drafts = await db.schoolAiRecord.findMany({ where: { schoolId, campusId, kind: { not: "ONBOARDING" } } });
  expect(drafts.length).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/launch-guide/evidence/21-password-campus-generated-drafts.png", animations: "disabled" });
  await dialog.locator("[data-setup-primary-action]").click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: copy.academicSetupTitle, exact: true })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: `${schoolId}-CAMPUS_ADMIN` } })).welcomeCompletedAt).not.toBeNull();
});
