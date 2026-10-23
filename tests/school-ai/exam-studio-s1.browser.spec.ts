import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-500 (Exam Studio slice 1) on the synthetic demo tenant, against a loopback database only.
 * Run with SCHOOL_AI_TEST_ORIGIN pointing at a dev server on the same database and DEMO_PASSWORD set:
 *   SCHOOL_AI_TEST_ORIGIN=http://localhost:3500 DATABASE_URL=… DIRECT_URL=… DEMO_PASSWORD=… \
 *   npx playwright test --config tests/school-ai/playwright.config.ts exam-studio-s1
 * Screenshots go to SKO500_SHOTS (a scratch folder), never into the repository.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO500_SHOTS;
const db = new PrismaClient();
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await resetDemoTenant(db, password);
});
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(context: BrowserContext, email: string, language: "en" | "ar" | "ur" = "en") {
  // A signed-in page renders in the person's preferred language.
  await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID, email }, data: { preferredLanguage: language } });
  const response = await context.request.post("/api/auth/login", { data: { email, password }, headers: { Origin: origin } });
  expect(response.ok()).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { data: { action: "defer" }, headers: { Origin: origin } })).ok()).toBeTruthy();
  // After sign-in, which writes the school's default language cookie.
  await context.addCookies([{ name: "skoolee-lang", value: language, url: origin }]);
}
const shot = async (page: Page, name: string) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true }); };

for (const language of ["en", "ar"] as const) {
  test(`teacher at 390px (${language}): drop a syllabus, approve it, move the Teaching Line, see the next step`, async ({ browser }) => {
    if (language === "ar") await resetDemoTenant(db, password);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    await signIn(context, "demo-teacher@example.invalid", language);
    const page = await context.newPage();
    await page.goto("/ai/studio#space=brief");
    await expect(page.locator("[data-exam-studio]")).toHaveAttribute("dir", language === "en" ? "ltr" : "rtl");
    await page.locator("select").filter({ hasText: "Mathematics" }).first().selectOption({ label: "Grade 7 · A · Mathematics" });
    const drop = page.locator("[data-syllabus-drop]");
    await expect(drop).toHaveAttribute("data-syllabus-drop", "drop");
    await drop.locator("textarea").fill("Unit 1: Number\n1.1 Read and write numbers up to one million\n1.2 Round whole numbers\nUnit 2: Fractions\n2.1 Compare and order fractions");
    await drop.locator('[data-drop-action="paste"]').click();
    await expect(drop).toHaveAttribute("data-syllabus-drop", "review");
    await shot(page, `teacher-outline-${language}`);
    await drop.locator('[data-drop-action="accept"]').click();
    await expect(drop).toHaveAttribute("data-syllabus-drop", "draft");
    await drop.locator('[data-drop-action="approve"]').click();
    const map = page.locator("[data-syllabus-map]");
    await expect(map).toBeVisible();
    await shot(page, `teacher-map-${language}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    const maths = await db.subject.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, name: "Mathematics" }, select: { id: true } });
    const record = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "CURRICULUM", subjectId: maths.id }, select: { status: true, data: true } });
    expect(record.status).toBe("APPROVED");
    await page.goto("/ai/studio");
    await expect(page.locator("[data-next-step]")).toBeVisible();
    await shot(page, `teacher-next-step-${language}`);
    await context.close();
  });
}

test("office at 1440px: request papers, see one per grade, remind the author", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await signIn(context, "demo-principal@example.invalid");
  const page = await context.newPage();
  await page.goto("/principal?view=exam-cycles");
  await page.getByRole("button", { name: /Papers/ }).first().click();
  const step = page.locator("[data-papers-step]");
  await step.getByRole("button", { name: "Request papers" }).click();
  await expect(step.locator("[data-slot-status]")).toHaveCount(1);
  await expect(step.locator("[data-slot-status]").first()).toContainText("Grade 7 A, Grade 7 B");
  await step.getByRole("button", { name: "Remind author" }).click();
  await expect(step).toContainText("Reminder sent");
  await shot(page, "office-papers-1440");
  const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID }, select: { nudgeCount: true, authorUserId: true, moderatorUserId: true } });
  expect(slot.nudgeCount).toBe(1);
  expect(slot.authorUserId).not.toBe(slot.moderatorUserId);
  await context.close();
});

test("head of department approves a syllabus a member sent for review", async ({ browser }) => {
  const teacher = await browser.newContext();
  await signIn(teacher, "demo-teacher@example.invalid");
  const subject = await db.subject.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, name: "Mathematics" }, select: { id: true, classId: true } });
  const created = await teacher.request.post("/api/school-ai/workspace", { headers: { Origin: origin }, data: { kind: "SOURCE", title: "Maths extra", idempotencyKey: `hod-${Date.now()}`, data: { extractedText: "Unit 9: Shapes\n9.1 Draw quadrilaterals", documentKind: "syllabus", fileName: "t.txt", mimeType: "text/plain", subjectId: subject.id, classId: subject.classId, origin: "manual", extractionStatus: "manual" } } });
  const source = (await created.json()).record;
  const proposal = (await (await teacher.request.post(`/api/school-ai/workspace/${source.id}/outcomes/propose`, { headers: { Origin: origin }, data: {} })).json()).proposal;
  const accepted = (await (await teacher.request.post(`/api/school-ai/workspace/${source.id}/outcomes/accept`, { headers: { Origin: origin }, data: { academicYear: "2026-27", board: "Federal", accepted: proposal.suggestions.map((row: { id: string; title: string; unit: string; page: string }) => ({ suggestionId: row.id, title: row.title, unit: row.unit, page: row.page })) } })).json()).record;
  expect((await teacher.request.patch(`/api/school-ai/workspace/${accepted.id}`, { headers: { Origin: origin }, data: { version: accepted.version, action: "review" } })).ok()).toBeTruthy();
  await teacher.close();
  const hod = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(hod, "demo-hod@example.invalid");
  const page = await hod.newPage();
  await page.goto("/teacher");
  const queue = page.locator("[data-department-queue]");
  await expect(queue).toContainText("Maths extra");
  await shot(page, "hod-queue");
  // The first-sign-in guide opens over the page; close it as a person would.
  if (await page.locator("[data-guide-scroll]").count()) await page.keyboard.press("Escape");
  await queue.getByRole("button", { name: "Approve" }).first().dispatchEvent("click");
  await expect(queue).toContainText("Approved");
  const approved = await db.schoolAiRecord.findFirstOrThrow({ where: { id: accepted.id }, select: { status: true } });
  expect(approved.status).toBe("APPROVED");
  await hod.close();
});
