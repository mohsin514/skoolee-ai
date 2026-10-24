import { test, expect, type BrowserContext } from "@playwright/test";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { studioShellCopy } from "../../src/components/school-ai/exam-studio/studio-shell-copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use only the isolated School AI test database.");
const db = new PrismaClient();

const admin = "school-ai-browser-a-ADMIN";
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
async function signIn(context: BrowserContext, role = "ADMIN") {
  const user = await db.user.findUniqueOrThrow({ where: { id: `school-ai-browser-a-${role}` } });
  const token = await new SignJWT({ userId: user.id, schoolId: user.schoolId, campusId: user.campusId, role, email: user.email, accessVersion: user.accessVersion, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: user.id, schoolId: user.schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
test.beforeEach(async ({ context }) => { await db.user.update({ where: { id: admin }, data: { preferredLanguage: "en" } }); await signIn(context); });
test.afterAll(async () => { await db.user.update({ where: { id: admin }, data: { preferredLanguage: "en" } }); await db.$disconnect(); });

test("real studio isolates exam work and mounts source and authoring flows", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/ai/studio");
  await expect(page.getByRole("heading", { name: "Better exams. A clearer next step." })).toBeVisible();
  await expect(page.locator("[data-studio-overview]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fee invoices", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "School operations", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add or review evidence", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add text manually", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create & review", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Curriculum & assessment studio", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New paper", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/school-ai/studio-assessment-workbench.png", fullPage: true });
  await page.getByRole("button", { name: "Studio home", exact: true }).click();
  await page.locator("[data-exam-studio]").evaluate(el => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "test-results/school-ai/studio-home-en.png", fullPage: true });
  await page.locator("#studio-journey-heading").evaluate(el => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: "test-results/school-ai/studio-journey-en.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("source draft guard protects text and saved source survives refresh", async ({ page }) => {
  const title = `Studio shell QA ${Date.now()}`;
  try {
    await page.goto("/ai/studio");
    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await page.getByRole("button", { name: "Add text manually", exact: true }).click();
    await page.getByRole("textbox", { name: /^Source title/ }).fill(title);
    await page.getByLabel("Extracted or transcribed text", { exact: true }).fill("Compare two quantities using a number line.");
    await page.screenshot({ path: "test-results/school-ai/studio-source-review.png", fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.getByRole("link", { name: /Open school messages/ }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.screenshot({ path: "test-results/school-ai/studio-unsaved-confirmation.png" });
    await page.getByRole("button", { name: "Stay on this page", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /^Source title/ })).toHaveValue(title);
    await page.getByRole("button", { name: "Studio home", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Keep editing", exact: true }).click();
    await expect(page.getByRole("textbox", { name: /^Source title/ })).toHaveValue(title);
    await page.getByRole("checkbox", { name: "I compared this text with its" }).check();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect.poll(() => db.schoolAiRecord.count({ where: { schoolId: "school-ai-browser-a", title } })).toBe(1);
    await page.reload();
    await page.getByRole("button", { name: "Evidence", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByLabel("Extracted or transcribed text", { exact: true })).toHaveValue("Compare two quantities using a number line.");
  } finally { await db.schoolAiRecord.deleteMany({ where: { schoolId: "school-ai-browser-a", title } }); }
});

test("workspace failure retains real retry and returns to the studio", async ({ page }) => {
  let fail = true;
  await page.route("**/api/school-ai/workspace", async route => fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Synthetic recovery failure" }) }) : route.continue());
  await page.goto("/ai/studio");
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("[data-studio-overview]")).toBeVisible();
});

test("Arabic and Urdu studio navigation fits a narrow phone", async ({ page }) => {
  for (const language of ["ar", "ur"] as const) {
    await db.user.update({ where: { id: admin }, data: { preferredLanguage: language } });
    const t = studioShellCopy(language);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/ai/studio");
    await expect(page.getByRole("heading", { name: t.headline })).toBeVisible();
    const studio = page.locator("[data-exam-studio]:visible");
    await expect(studio).toHaveCount(1);
    await expect(studio).toHaveAttribute("dir", "rtl");
    await expect(studio.locator("[data-studio-overview]")).toBeVisible();
    const action = await studio.getByRole("button", { name: t.sourceAction, exact: true }).boundingBox();
    expect(action && action.y + action.height <= 800).toBeTruthy();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await page.getByRole("button", { name: t.sources, exact: true }).click();
    await expect(page.getByRole("button", { name: t.sources, exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: t.overview, exact: true }).click();
    await studio.evaluate(el => el.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `test-results/school-ai/studio-home-${language}.png`, fullPage: true });
  }
});

test("candidate cannot enter staff studio", async ({ page, context }) => {
  await signIn(context, "STUDENT");
  await page.goto("/ai/studio");
  await expect(page).toHaveURL(/\/(?:student(?:\?|$)|ai\/exams\/)/);
  await expect(page.locator("[data-exam-studio]")).toHaveCount(0);
});
