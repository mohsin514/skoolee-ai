import { test, expect, type BrowserContext, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetDemoTenant, DEMO_SCHOOL_ID } from "../../scripts/demo/reset-demo-tenant";

/**
 * SKO-501 (Exam Studio slice 2) on the synthetic demo tenant, loopback database only:
 * the head moderates and signs from the teacher home; the principal seals from the Papers step and prints
 * the sealed paper (footer prefix = seal); an edit after sealing blocks printing and reads CHANGED_AFTER_APPROVAL.
 * Run: SCHOOL_AI_TEST_ORIGIN=… DATABASE_URL=… DEMO_PASSWORD=… npx playwright test --config tests/school-ai/playwright.sko501.config.ts
 */
const url = process.env.DATABASE_URL ?? "";
if (!/^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost):/.test(url)) throw new Error("Use only a loopback database for this suite.");
const password = process.env.DEMO_PASSWORD ?? "";
const shots = process.env.SKO501_SHOTS;
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
const db = new PrismaClient();
const headers = { Origin: origin };

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => { await resetDemoTenant(db, password); await db.user.updateMany({ where: { schoolId: DEMO_SCHOOL_ID }, data: { preferredLanguage: "en" } }); });
test.afterAll(async () => { await db.$disconnect(); });

async function signIn(context: BrowserContext, email: string) {
  const response = await context.request.post("/api/auth/login", { data: { email, password }, headers });
  expect(response.ok()).toBeTruthy();
  if ((await response.json()).mfaRequired) expect((await context.request.post("/api/auth/mfa", { data: { action: "defer" }, headers })).ok()).toBeTruthy();
}
async function paper(id: string) { return db.schoolAiRecord.findUniqueOrThrow({ where: { id }, select: { version: true, data: true } }); }

let slotId = "", paperId = "";
test("office requests, author writes and sends the paper for review", async ({ browser }) => {
  const office = await browser.newContext(); await signIn(office, "demo-principal@example.invalid");
  const session = await db.examSession.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } });
  expect((await office.request.post(`/api/academic/exam-sessions/${session.id}/paper-slots`, { headers, data: {} })).ok()).toBeTruthy();
  const slot = await db.examPaperSlot.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID } }); slotId = slot.id;
  await db.examPaperSlot.update({ where: { id: slotId }, data: { totalMarks: 5, durationMinutes: 20 } });
  await office.close();
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  const source = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId: DEMO_SCHOOL_ID, kind: "PAPER" }, orderBy: { createdAt: "asc" } });
  const created = await author.request.post("/api/school-ai/workspace", { headers, data: { kind: "PAPER", title: "Science Grade 7 mid-term", idempotencyKey: `s2-${Date.now()}`, data: { ...(source.data as object), slotId, examType: "MID_TERM" } } });
  expect(created.status()).toBe(201); paperId = (await created.json()).record.id;
  for (const question of ((await paper(paperId)).data as { questions: Array<{ id: string }> }).questions) {
    expect((await author.request.post(`/api/school-ai/workspace/${paperId}/item-review`, { headers, data: { version: (await paper(paperId)).version, questionId: question.id, target: "READY_FOR_REVIEW", itemRevision: 1 } })).ok()).toBeTruthy();
  }
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: (await paper(paperId)).version, action: "review" } })).ok()).toBeTruthy();
  await author.close();
});

test("the head moderates from the teacher home and signs", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await signIn(context, "demo-hod@example.invalid");
  const page = await context.newPage();
  await page.goto("/teacher");
  const queue = page.locator("[data-moderation-queue]");
  await expect(queue).toBeVisible();
  if (await page.locator("[data-guide-scroll]").count()) await page.keyboard.press("Escape");
  await queue.getByRole("button", { name: "Moderate" }).dispatchEvent("click");
  const panel = page.locator("[data-moderation-panel]");
  await expect(panel.locator("[data-check]")).toHaveCount(8);
  await expect(panel.locator('[data-check][data-ok="false"]')).toHaveCount(0);
  if (shots) await page.screenshot({ path: `${shots}/hod-moderation.png`, fullPage: true });
  await panel.locator('[data-moderation="sign"]').dispatchEvent("click");
  await expect(panel).toContainText("Signed");
  const decision = await db.examPaperModeration.findFirstOrThrow({ where: { slotId }, select: { decision: true } });
  expect(decision.decision).toBe("SIGNED");
  await context.close();
});

test("the principal seals from the Papers step and prints the sealed paper; an edit then blocks printing", async ({ browser }) => {
  const author = await browser.newContext(); await signIn(author, "demo-teacher@example.invalid");
  expect((await author.request.post(`/api/school-ai/workspace/${paperId}/rehearsal`, { headers, data: { version: (await paper(paperId)).version, findings: [] } })).ok()).toBeTruthy();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await signIn(context, "demo-principal@example.invalid");
  const page = await context.newPage();
  await page.goto("/principal?view=exam-cycles");
  await page.getByRole("button", { name: /Papers/ }).first().click();
  const step = page.locator("[data-papers-step]");
  await step.locator("[data-seal-slot]").click();
  const sheet = page.locator("[data-seal-sheet]");
  await expect(sheet).toContainText("#");
  if (shots) await page.screenshot({ path: `${shots}/principal-seal-sheet.png`, fullPage: true });
  await page.getByRole("button", { name: "Seal paper" }).click();
  await expect(step.locator('[data-slot-status="SEALED"]')).toHaveCount(1);
  const slot = await db.examPaperSlot.findUniqueOrThrow({ where: { id: slotId }, select: { sealHash: true } });
  const print = await context.request.get(`/api/academic/paper-slots/${slotId}/print`);
  expect(print.status()).toBe(200);
  expect(await print.text()).toContain(slot.sealHash!.slice(0, 16));
  if (shots) await page.screenshot({ path: `${shots}/principal-sealed.png`, fullPage: true });
  const current = await paper(paperId);
  const data = current.data as { questions: Array<{ prompt: string }> };
  data.questions[0].prompt += " (edited)";
  expect((await author.request.patch(`/api/school-ai/workspace/${paperId}`, { headers, data: { version: current.version, action: "save", data } })).ok()).toBeTruthy();
  expect((await context.request.get(`/api/academic/paper-slots/${slotId}/print`)).status()).toBe(409);
  await page.reload();
  await page.getByRole("button", { name: /Papers/ }).first().click();
  await expect(page.locator('[data-slot-status="CHANGED_AFTER_APPROVAL"]')).toHaveCount(1);
  await author.close(); await context.close();
});
