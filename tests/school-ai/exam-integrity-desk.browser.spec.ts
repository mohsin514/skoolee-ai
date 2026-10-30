import { test, expect, type BrowserContext } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, type ProctorFixture } from "./exam-proctor-fixture";
import { examIntegrityCopy } from "../../src/components/school-ai/exam-integrity-copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), fixtures: ProctorFixture[] = [];
let f: ProctorFixture;
const endpoint = () => `/api/school-ai/exams/${f.assignment.id}/integrity`;
async function signIn(context: BrowserContext, user: AuthUser) {
  const token = await new SignJWT({ ...user, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: user.userId, schoolId: user.schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.clearCookies();
  await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
async function observation(index = 0, pending = true) {
  return db.schoolAiExamIntegrityEvent.create({ data: {
    schoolId: f.schoolId, campusId: f.campusId, assignmentId: f.assignment.id, attemptId: f.attempt!.id,
    userId: f.learner.userId, clientEventId: randomUUID(), kind: "PAGE_HIDDEN", observedAt: new Date(Date.now() - index * 1000), receivedAt: new Date(Date.now() - index * 1000), details: {}, retentionUntil: new Date(Date.now() + 86400000),
    ...(pending ? {} : { decision: "NOTED", reviewReason: "Synthetic previously reviewed observation.", reviewedById: f.admin.userId, reviewedAt: new Date(), version: 2 }),
  } });
}
test.beforeEach(async ({ context }) => {
  f = await examProctorFixture(db, { enabled: false, integrityDays: 2 }); fixtures.push(f);
  await signIn(context, f.admin);
});
test.afterAll(async () => { for (const fixture of fixtures) await removeProctorFixture(db, fixture.schoolId); await db.$disconnect(); await prisma.$disconnect(); });

test("staff saves a scoped observation review without changing marks or answers", async ({ page, context }) => {
  const event = await observation();
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const desk = page.getByRole("region", { name: "Session observations", exact: true });
  await desk.getByRole("button", { name: "Review observation", exact: true }).click();
  await desk.getByLabel("Disposition", { exact: true }).selectOption("DISMISSED");
  await desk.getByLabel("Context and reason for this decision", { exact: true }).fill("Learner used an approved accessibility tool; no further action.");
  await desk.getByRole("button", { name: "Save review", exact: true }).click();
  await expect(desk.getByRole("status")).toHaveText("Review saved. Academic marks are unchanged.");
  const saved = await db.schoolAiExamIntegrityEvent.findUniqueOrThrow({ where: { id: event.id } });
  expect(saved.decision).toBe("DISMISSED"); expect(saved.version).toBe(2); expect(saved.reviewedById).toBe(f.admin.userId);
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } })).responses).toEqual({});
  expect(await db.mark.count({ where: { schoolId: f.schoolId } })).toBe(0);
  await signIn(context, f.teacher);
  expect((await page.request.get(endpoint())).status()).toBe(404);
  expect((await page.request.patch(endpoint(), { data: { eventId: event.id, version: 2, decision: "FOLLOW_UP", reason: "Unauthorized reviewer" } })).status()).toBe(404);
});

test("409 keeps a review draft and requires comparing the latest decision before retry", async ({ page }) => {
  const event = await observation();
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const t = examIntegrityCopy("en"), desk = page.getByRole("region", { name: t.title, exact: true });
  await desk.getByRole("button", { name: t.select, exact: true }).click();
  const draft = "My interview notes remain available after a competing review.";
  await desk.getByLabel(t.reason, { exact: true }).fill(draft);
  const external = await page.request.patch(endpoint(), { data: { eventId: event.id, version: 1, decision: "FOLLOW_UP", reason: "Another review requires a contextual conversation." } });
  expect(external.ok()).toBeTruthy();
  await desk.getByRole("button", { name: t.save, exact: true }).click();
  await expect(desk.getByRole("alert")).toContainText("reviewed by someone else");
  await expect(desk.getByLabel(t.reason, { exact: true })).toHaveValue(draft);
  await expect(desk.getByRole("button", { name: t.save, exact: true })).toBeDisabled();
  await desk.getByRole("button", { name: t.loadLatest, exact: true }).click();
  await expect(desk.getByText("Another review requires a contextual conversation.", { exact: true })).toBeVisible();
  await desk.getByRole("button", { name: t.keepDraft, exact: true }).click();
  await expect(desk.getByLabel(t.reason, { exact: true })).toHaveValue(draft);
  await desk.getByRole("button", { name: t.save, exact: true }).click();
  await expect.poll(async () => (await db.schoolAiExamIntegrityEvent.findUniqueOrThrow({ where: { id: event.id } })).version).toBe(3);
  expect((await db.schoolAiExamIntegrityEvent.findUniqueOrThrow({ where: { id: event.id } })).reviewReason).toBe(draft);
});

test("pagination reaches older pending observations and refresh preserves their draft", async ({ page }) => {
  const old = await observation(1000);
  await db.schoolAiExamIntegrityEvent.createMany({ data: Array.from({ length: 200 }, (_, index) => ({
    schoolId: f.schoolId, campusId: f.campusId, assignmentId: f.assignment.id, attemptId: f.attempt!.id, userId: f.learner.userId,
    clientEventId: randomUUID(), kind: "PAGE_VISIBLE", observedAt: new Date(Date.now() - index * 1000), receivedAt: new Date(Date.now() - index * 1000), details: {}, retentionUntil: new Date(Date.now() + 86400000), decision: "NOTED", reviewReason: "Synthetic reviewed observation.", reviewedById: f.admin.userId, reviewedAt: new Date(), version: 2,
  })) });
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const t = examIntegrityCopy("en"), desk = page.getByRole("region", { name: t.title, exact: true });
  await expect(desk.getByRole("button", { name: t.select, exact: true })).toHaveCount(0);
  await desk.getByRole("button", { name: t.older, exact: true }).click();
  await expect(desk.getByRole("button", { name: t.select, exact: true })).toHaveCount(1);
  await desk.getByRole("button", { name: t.select, exact: true }).click();
  await desk.getByLabel(t.reason, { exact: true }).fill("Older-page draft remains after refreshing the queue.");
  await desk.getByRole("button", { name: t.refresh, exact: true }).click();
  await expect(desk.getByLabel(t.reason, { exact: true })).toHaveValue("Older-page draft remains after refreshing the queue.");
  await desk.getByRole("button", { name: t.save, exact: true }).click();
  await expect.poll(async () => (await db.schoolAiExamIntegrityEvent.findUniqueOrThrow({ where: { id: old.id } })).decision).toBe("NOTED");
});

test("changing observation asks before discarding entered context and denial clears protected data", async ({ page }) => {
  await observation(); await observation(1);
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const t = examIntegrityCopy("en"), desk = page.getByRole("region", { name: t.title, exact: true });
  await desk.getByRole("button", { name: t.select, exact: true }).first().click();
  await desk.getByLabel(t.reason, { exact: true }).fill("Unsaved context from the learner.");
  await desk.getByRole("button", { name: t.select, exact: true }).last().click();
  await expect(page.getByRole("alertdialog", { name: t.discardTitle })).toBeVisible();
  await page.getByRole("button", { name: t.keepEditing, exact: true }).click();
  await expect(desk.getByLabel(t.reason, { exact: true })).toHaveValue("Unsaved context from the learner.");
  await db.rolePermission.create({ data: { schoolId: f.schoolId, role: "ADMIN", module: "exams", canView: false } });
  await desk.getByRole("button", { name: t.refresh, exact: true }).click();
  await expect(desk.getByRole("alert")).toBeVisible();
  await expect(desk.getByText("Capture learner 1", { exact: true })).toHaveCount(0);
  await expect(desk.getByLabel(t.reason, { exact: true })).toHaveCount(0);
});

for (const locale of ["en", "ar", "ur"] as const) test(`${locale} review is usable on a narrow phone`, async ({ page }) => {
  await observation();
  await db.user.update({ where: { id: f.admin.userId }, data: { preferredLanguage: locale } });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const t = examIntegrityCopy(locale), desk = page.getByRole("region", { name: t.title, exact: true });
  await expect(desk).toHaveAttribute("dir", locale === "en" ? "ltr" : "rtl");
  await desk.getByRole("button", { name: t.select, exact: true }).click();
  await desk.getByLabel(t.reason, { exact: true }).fill(locale === "en" ? "Approved device context." : locale === "ar" ? "تمت مراجعة سياق الجهاز مع الطالب." : "طالب علم کے ساتھ آلے کا سیاق دیکھا گیا۔");
  await desk.screenshot({ path: test.info().outputPath(`integrity-review-${locale}.png`) });
  await desk.getByRole("button", { name: t.save, exact: true }).click();
  await expect(desk.getByRole("status")).toHaveText(t.saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await desk.screenshot({ path: test.info().outputPath(`integrity-desk-${locale}.png`) });
});

test("a stalled observation request times out, retries its identity, and leaves answer saving available", async ({ page, context }) => {
  await signIn(context, f.learner);
  const bodies: Array<{ clientEventId: string; kind: string }> = [];
  await page.route(`**${endpoint()}`, async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().kind !== "WINDOW_BLURRED") return route.continue();
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) return; // Hold the first response past the client timeout.
    await route.continue();
  });
  await page.goto(`/ai/exams/${f.assignment.id}`);
  await expect(page.locator("fieldset#exam-answer-q1")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.locator("fieldset#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  await expect.poll(() => bodies.length, { timeout: 15000 }).toBe(2);
  expect(bodies[1].clientEventId).toBe(bodies[0].clientEventId);
  await expect.poll(() => db.schoolAiExamIntegrityEvent.count({ where: { schoolId: f.schoolId, clientEventId: bodies[0].clientEventId } })).toBe(1);
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } })).responses).toEqual({ q1: "a1" });
});
