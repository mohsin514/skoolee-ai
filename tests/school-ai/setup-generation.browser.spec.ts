import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { setupQuestions, SETUP_ANSWER_KEYS, type SetupDraft } from "../../src/lib/school-ai/onboarding";
import { setupGenerationCopy } from "../../src/components/school-ai/setup-generation-copy";

const localDatabase = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== localDatabase || process.env.DIRECT_URL !== localDatabase) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();
const schoolId = `ai-questionnaire-browser-${randomUUID()}`;
const campusId = `${schoolId}-campus`, adminId = `${schoolId}-admin`;
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
let token = "";
const draft: SetupDraft = {
  path: "new", step: "review", confirmedKeys: [],
  answers: {
    schoolName: "Synthetic Horizon Academy", country: "Pakistan", timezone: "Asia/Karachi",
    campuses: "Learning campus", grades: "Grade 8", academicYear: "2026-2027",
    startDate: "2026-08-01", endDate: "2027-06-30", workingDays: "Monday to Friday",
    firstOutcome: "complete", curriculum: "Grade 8 Mathematics: fractions, decimals, ratios and introductory algebra.",
    assessmentPolicy: "Monthly 20-mark assessments; 50 percent pass mark; teacher reviews all generated questions.",
    resources: "Two classrooms and one science lab; eight 40-minute periods from 08:00.",
    staff: "Two mathematics teachers available Monday to Friday.", feePolicy: "Monthly tuition PKR 5000 per student; due on day 10.",
    students: "One Grade 8 section with 24 students; roster import will follow.",
    communications: "Principal reviews school updates before families receive them.",
  },
};

test.beforeAll(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic questionnaire academy", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.test`, registrationKind: "GROUP", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Learning campus", city: "Test", regId: campusId } });
  await db.user.create({ data: { id: adminId, role: "ADMIN", schoolId, campusId, email: `${adminId}@example.test`, fullName: "Synthetic setup lead", mfaEnabled: true, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
  token = await new SignJWT({ userId: adminId, schoolId, campusId, role: "ADMIN", email: `${adminId}@example.test`, accessVersion: 0, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: adminId, schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
});

test("refresh during preparation recovers the same saved package without a second generation", async ({ page }) => {
  test.skip(process.env.SCHOOL_AI_EXPECT_GENERATION_MODE === "prototype", "Immediate local preparation is covered by the complete no-key flow.");
  test.setTimeout(90000);
  const saved = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: {
    kind: "ONBOARDING", campusId, title: "Synthetic preparation recovery", idempotencyKey: randomUUID(),
    data: { ...draft, answers: { ...draft.answers, schoolName: "Synthetic Recovery Academy" }, confirmedKeys: SETUP_ANSWER_KEYS.filter(key => Boolean(draft.answers[key])), currentQuestion: "communications" },
  } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const source = (await saved.json()).record;
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/school-ai/setup/generate")) posts.push(request.url()); });
  await page.goto("/ai?setup=1");
  await page.getByRole("button", { name: setupGenerationCopy("en").generate, exact: true }).click();
  await expect.poll(() => db.schoolAiRequest.count({ where: { schoolId, actorId: adminId, feature: "SETUP_GENERATION_V1", status: "PENDING", contextRecordIds: { equals: [source.id] } } })).toBe(1);
  await page.reload();
  await expect(page.locator("[data-setup-generation]")).toHaveAttribute("data-state", "ready", { timeout: 60000 });
  await expect(page.locator("[data-setup-generated-record]")).toHaveCount(9);
  expect(posts).toHaveLength(1);
  const receipt = await db.schoolAiRequest.findFirstOrThrow({ where: { schoolId, actorId: adminId, feature: "SETUP_GENERATION_V1", contextRecordIds: { equals: [source.id] } } });
  expect(receipt.status).toBe("COMPLETED");
  expect(receipt.attempts).toBe(1);
  await capture(page, "questionnaire-refresh-recovery");
});
test.beforeEach(async ({ context }) => {
  await db.schoolAiExecution.deleteMany({ where: { schoolId } });
  await db.schoolAiRequest.deleteMany({ where: { schoolId } });
  await db.schoolAiRecord.deleteMany({ where: { schoolId } });
  await db.class.deleteMany({ where: { schoolId } });
  await db.academicCycle.deleteMany({ where: { schoolId } });
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: "en" } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
});
test.afterAll(async () => { await db.schoolAiExecution.deleteMany({ where: { schoolId } }); await db.school.deleteMany({ where: { id: schoolId } }); await db.$disconnect(); });

async function capture(page: Page, name: string) {
  await expect(page.locator('[aria-hidden="true"][class*="z-[9999]"]')).toHaveCount(0);
  await page.screenshot({ path: `test-results/ai-review/${name}.png`, animations: "disabled" });
}

test("all questionnaire answers automatically become saved drafts, reopen, and apply the prefilled academic plan", async ({ page }) => {
  test.setTimeout(180000);
  const c = schoolAICopy("en");
  const t = setupGenerationCopy("en");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ai?setup=1");
  const questions = setupQuestions(draft);
  const generationResponse = page.waitForResponse(response => response.url().endsWith("/api/school-ai/setup/generate") && response.request().method() === "POST", { timeout: 120000 });
  for (const [index, question] of questions.entries()) {
    await expect(page.getByRole("heading", { level: 1, name: c[question.label], exact: true })).toBeVisible();
    if (question.key === "path") await page.getByRole("button", { name: new RegExp(`^${c.new}`) }).click();
    else if (question.key === "firstOutcome") await page.getByRole("button", { name: c.complete, exact: true }).click();
    else await page.getByLabel(c.answer, { exact: true }).fill(draft.answers[question.key]!);
    if (index === questions.length - 1) {
      await page.getByRole("button", { name: t.finish, exact: true }).click();
    } else await page.getByRole("button", { name: c.next, exact: true }).click();
  }
  const generation = page.locator("[data-setup-generation]");
  if (process.env.SCHOOL_AI_EXPECT_GENERATION_MODE !== "prototype") {
    await expect(generation).toHaveAttribute("data-state", "generating");
    await expect(generation.getByRole("heading", { name: t.generating, exact: true })).toBeVisible();
    await capture(page, "questionnaire-generating-desktop");
  }
  const response = await generationResponse;
  expect(response.ok(), await response.text()).toBeTruthy();
  const result = await response.json();
  if (process.env.SCHOOL_AI_EXPECT_GENERATION_MODE) expect(result.mode).toBe(process.env.SCHOOL_AI_EXPECT_GENERATION_MODE);
  expect(result.records.length).toBeGreaterThanOrEqual(4);
  await expect(generation).toHaveAttribute("data-state", "ready", { timeout: 60000 });
  await expect(page.locator("[data-setup-generated-record]")).toHaveCount(result.records.length);
  await capture(page, "questionnaire-generated-desktop");
  expect(await db.class.count({ where: { schoolId } })).toBe(0);
  expect(await db.schoolAiRecord.count({ where: { schoolId, kind: "WORKFLOW" } })).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(page.locator("[data-setup-generation]")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("[data-setup-generated-record]")).toHaveCount(result.records.length);
  expect(await db.schoolAiRecord.count({ where: { schoolId } })).toBe(result.records.length + 1);
  const workflow = result.records.find((record: { kind: string; data: { proposal?: unknown } }) => record.kind === "WORKFLOW" && !record.data.proposal);
  await page.locator(`[data-setup-generated-record="${workflow.id}"]`).getByRole("button").last().click();
  await expect(page.getByRole("textbox", { name: c.goal, exact: false })).toHaveValue(workflow.data.goal);
  await page.getByRole("button", { name: c.resumeSetup, exact: true }).click();
  await expect(generation).toHaveAttribute("data-state", "ready");
  const policy = result.records.find((record: { kind: string; data: { scope?: string } }) => record.kind === "POLICY" && record.data.scope === "finance");
  await page.locator(`[data-setup-generated-record="${policy.id}"]`).getByRole("button").last().click();
  await expect(page.getByRole("textbox", { name: c.instructions, exact: false })).toHaveValue(policy.data.instructions);
  await page.getByRole("button", { name: c.resumeSetup, exact: true }).click();
  await expect(generation).toHaveAttribute("data-state", "ready");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await generation.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, `questionnaire-generated-${result.mode}-mobile`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const academic = result.records.find((record: { data: { proposal?: { operation?: string } } }) => record.data.proposal?.operation === "academics.setup_year");
  expect(academic).toBeTruthy();
  await page.locator(`[data-setup-generated-record="${academic.id}"]`).getByRole("button").last().click();
  await expect(page.getByRole("textbox", { name: /^Academic year name/ })).toHaveValue("2026-2027");
  await expect(page.getByRole("textbox", { name: /^Class name/ }).first()).toHaveValue("Grade 8");
  await page.getByRole("checkbox", { name: "I reviewed this saved version, including the campus, year, dates and each class.", exact: true }).check();
  await page.getByRole("button", { name: "Approve this plan", exact: true }).click();
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Classes to add: 1", exact: true })).toBeVisible();
  await capture(page, "questionnaire-academic-preview");
  await page.getByRole("checkbox", { name: "I reviewed these exact changes and authorize applying this version to the selected campus.", exact: true }).check();
  await page.getByRole("button", { name: "Apply to school", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Applied to school", exact: true })).toBeVisible();
  expect(await db.class.count({ where: { schoolId, name: "Grade 8" } })).toBe(1);
  expect(await db.academicCycle.count({ where: { schoolId, academicYear: 2026 } })).toBe(1);
  await capture(page, "questionnaire-academic-applied");
  await page.getByRole("button", { name: c.resumeSetup, exact: true }).click();
  await expect(generation).toHaveAttribute("data-state", "ready");
  await page.getByText(t.reviewAnswers, { exact: true }).click();
  await page.getByRole("button", { name: `${c.edit}: ${c.feePolicy}`, exact: true }).click();
  await page.getByLabel(c.answer, { exact: true }).fill("Monthly tuition PKR 6000 per student; due on day 15.");
  const updatedResponse = page.waitForResponse(response => response.url().endsWith("/api/school-ai/setup/generate") && response.request().method() === "POST");
  await page.getByRole("button", { name: t.regenerate, exact: true }).click();
  const updated = await updatedResponse;
  expect(updated.ok(), await updated.text()).toBeTruthy();
  const next = await updated.json();
  await expect(generation).toHaveAttribute("data-state", "ready");
  expect(next.replay).toBe(false);
  expect(next.records.find((record: { kind: string; data: { scope?: string } }) => record.kind === "POLICY" && record.data.scope === "finance").data.instructions).toContain("6000");
  expect(await db.schoolAiRecord.count({ where: { schoolId } })).toBe(result.records.length + next.records.length + 1);
  expect(errors).toEqual([]);
  console.log(`Questionnaire completion: ${questions.length} answers, ${result.records.length} saved drafts, mode=${result.mode}, academic plan applied.`);
});

test("prototype results and primary action fit English, Arabic and Urdu phones", async ({ page }) => {
  test.skip(process.env.SCHOOL_AI_EXPECT_GENERATION_MODE !== "prototype", "Checks the actual no-key fallback server.");
  test.setTimeout(90000);
  const saved = await page.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: {
    kind: "ONBOARDING", campusId, title: "Synthetic multilingual setup", idempotencyKey: randomUUID(),
    data: { ...draft, confirmedKeys: SETUP_ANSWER_KEYS.filter(key => Boolean(draft.answers[key])), currentQuestion: "communications" },
  } });
  expect(saved.ok(), await saved.text()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const language of ["en", "ar", "ur"] as const) {
    await db.user.update({ where: { id: adminId }, data: { preferredLanguage: language } });
    await page.goto("/ai?setup=1");
    const t = setupGenerationCopy(language);
    await page.getByRole("button", { name: t.generate, exact: true }).click();
    const generation = page.locator("[data-setup-generation]");
    await expect(generation).toHaveAttribute("data-state", "ready");
    await expect(generation.getByText(t.prototype, { exact: true })).toBeVisible();
    await expect(page.locator("[data-setup-primary-action]")).toBeInViewport();
    expect(await generation.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await capture(page, `questionnaire-${language}-prototype-mobile`);
  }
  await db.user.update({ where: { id: adminId }, data: { preferredLanguage: "en" } });
});
