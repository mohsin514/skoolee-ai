import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { updateExamProctorPolicy } from "../../src/lib/school-ai/exam-proctor-service";
import { examProctorFixture, proctorContext, removeProctorFixture, type ProctorFixture } from "./exam-proctor-fixture";
import { examCameraCopy } from "../../src/components/school-ai/exam-camera-copy";
import { examReadinessCopy } from "../../src/components/school-ai/exam-readiness-copy";
import { examProctorCopy } from "../../src/components/school-ai/exam-proctor-copy";
import { examRoomCopy } from "../../src/components/school-ai/exam-room-copy";
import { examCopy } from "../../src/components/school-ai/exam-copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
const origin = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
process.env.SCHOOL_AI_STORAGE_DIR = "/private/tmp/skoolee-ai-test-documents";
const db = new PrismaClient(), fixtures: ProctorFixture[] = []; let f: ProctorFixture;
test.setTimeout(60000);
async function auth(context: BrowserContext, user: AuthUser) {
  const token = await new SignJWT({ ...user, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setJti(randomUUID()).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: user.userId, schoolId: user.schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.clearCookies(); await context.addCookies([{ name: "skoolee_token", value: token, url: origin, httpOnly: true, sameSite: "Lax" }]);
}
type CaptureState = { calls: number; streams: MediaStream[] };
async function mockCapture(page: Page, denyFirst = false) {
  await page.addInitScript(({ denyFirst }) => {
    const state: CaptureState = { calls: 0, streams: [] }; Object.assign(window, { requiredCameraTest: state });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      state.calls++; if (denyFirst && state.calls === 1) throw new DOMException("Synthetic denial", "NotAllowedError"); const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#6d28d9"; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = "white"; ctx.fillText("Synthetic exam camera", 20, 70);
      const stream = canvas.captureStream(5); state.streams.push(stream); return stream;
    } });
  }, { denyFirst });
}
const state = (page: Page) => page.evaluate(() => { const value = (window as unknown as { requiredCameraTest: CaptureState }).requiredCameraTest; return { calls: value.calls, live: value.streams.reduce((sum, stream) => sum + stream.getTracks().filter(track => track.readyState === "live").length, 0) }; });
async function readiness(page: Page, locale: "en" | "ar" | "ur" = "en") {
  const t = examReadinessCopy(locale);
  await page.getByRole("button", { name: t.check, exact: true }).click();
  await expect(page.getByText(t.ready, { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: t.acknowledge, exact: true }).check();
}
async function cameraStart(page: Page, locale: "en" | "ar" | "ur" = "en") {
  const c = examCameraCopy(locale), r = examReadinessCopy(locale), p = examProctorCopy(locale);
  const notice = page.locator("header").getByText(examCopy(locale).browserNotice, { exact: true });
  await expect(notice).toBeVisible();
  expect(examCopy(locale).browserNotice).not.toMatch(/optional|اختياري|اختیاری/i);
  await readiness(page, locale);
  await page.getByRole("checkbox", { name: c.consent, exact: true }).check();
  await page.getByRole("button", { name: c.preview, exact: true }).click();
  await expect(page.getByText(c.ready, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: r.start, exact: true })).toBeEnabled();
  await page.screenshot({ path: `test-results/school-ai/exam-preflight-ready-${locale}.png`, fullPage: true });
  await page.getByRole("button", { name: r.start, exact: true }).click();
  await expect(page.getByRole("button", { name: `${p.stop} · ${p.camera}`, exact: true })).toBeVisible();
}
test.beforeEach(async ({ context }) => {
  f = await examProctorFixture(db, { start: false, integrityDays: 2 }); fixtures.push(f);
  await db.schoolAiExamAssignment.update({ where: { id: f.assignment.id }, data: { title: "Required camera mathematics exam" } });
  await proctorContext(f.admin, async () => updateExamProctorPolicy(f.admin, f.assignment.id, { version: (await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: f.assignment.id } })).version, policy: { enabled: true, camera: true, screen: false, requireCamera: true, retentionDays: 1 } }));
  await auth(context, f.learner);
});
test.afterAll(async () => { for (const fixture of fixtures) { await removeProctorFixture(db, fixture.schoolId); await rm(`/private/tmp/skoolee-ai-test-documents/school-ai/${fixture.schoolId}`, { recursive: true, force: true }); } await db.$disconnect(); await prisma.$disconnect(); });

test("required camera uses consent and one stream; interruption preserves focus, answers and submission", async ({ page }) => {
  const c = examCameraCopy("en"), r = examReadinessCopy("en"), room = examRoomCopy("en");
  await mockCapture(page); await page.goto(`/ai/exams/${f.assignment.id}`);
  await expect(page.getByRole("region", { name: c.title })).toBeVisible();
  expect(await state(page)).toEqual({ calls: 0, live: 0 });
  await readiness(page);
  await expect(page.getByRole("button", { name: r.start, exact: true })).toBeDisabled();
  expect(await db.schoolAiExamAttempt.count({ where: { schoolId: f.schoolId } })).toBe(0);
  await cameraStart(page);
  expect(await state(page)).toEqual({ calls: 1, live: 1 });
  expect(await db.schoolAiProctorSession.count({ where: { schoolId: f.schoolId, status: "ACTIVE" } })).toBe(1);
  await page.getByRole("button", { name: room.focus, exact: true }).click();
  await page.getByRole("button", { name: room.flag, exact: true }).click();
  await page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: room.next, exact: true }).click();
  await expect(page.locator("#exam-question-q2")).toBeFocused();
  await expect(page.locator("#exam-answer-q2").getByRole("button", { name: "4", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: room.next, exact: true }).click();
  await page.getByRole("textbox", { name: "Your answer", exact: true }).fill("Combine the two quantities and count the total.");
  await expect(page.getByRole("progressbar", { name: room.progress })).toHaveAttribute("value", "2");
  await page.getByRole("button", { name: /Review marked questions/ }).click();
  await expect(page.locator("#exam-question-q1")).toBeFocused();
  await expect(page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: "test-results/school-ai/exam-room-en.png", fullPage: true });
  await page.evaluate(() => { const stream = (window as unknown as { requiredCameraTest: CaptureState }).requiredCameraTest.streams[0]; stream.getTracks().forEach(track => { track.stop(); track.dispatchEvent(new Event("ended")); }); });
  await expect(page.getByText(c.recovery, { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/school-ai/exam-camera-interruption-en.png", fullPage: true });
  await expect(page.getByRole("button", { name: room.saveNow, exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
  await page.screenshot({ path: "test-results/school-ai/exam-submit-review-dialog.png", fullPage: true });
  await page.getByRole("dialog").getByRole("button", { name: "Submit final answers", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submission received", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/school-ai/exam-submission-receipt.png", fullPage: true });
  const attempt = await db.schoolAiExamAttempt.findFirstOrThrow({ where: { schoolId: f.schoolId } });
  expect(attempt.status).toBe("SUBMITTED"); expect(attempt.responses).toEqual({ q1: "a1", q3: "Combine the two quantities and count the total." });
  expect(await state(page)).toEqual({ calls: 1, live: 0 });
});

test("denied camera cannot start timer and a later successful check recovers", async ({ page }) => {
  await mockCapture(page, true);
  await page.goto(`/ai/exams/${f.assignment.id}`); await readiness(page);
  const c = examCameraCopy("en"); await page.getByRole("checkbox", { name: c.consent, exact: true }).check();
  await page.getByRole("button", { name: c.preview, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: c.failure })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start exam", exact: true })).toBeDisabled();
  expect(await db.schoolAiExamAttempt.count({ where: { schoolId: f.schoolId } })).toBe(0);
  await page.getByRole("button", { name: c.preview, exact: true }).click();
  await expect(page.getByText(c.ready, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop sharing · Camera", exact: true })).toBeVisible();
});

test("initial and mid-exam wall-clock changes do not change the server timer or stop recording", async ({ page }) => {
  await mockCapture(page);
  await page.clock.setSystemTime(new Date(Date.now() + 3600000));
  await page.goto(`/ai/exams/${f.assignment.id}`); await cameraStart(page);
  const timer = page.getByRole("timer", { name: examCopy("en").time });
  await expect.poll(() => db.schoolAiExamIntegrityEvent.count({ where: { schoolId: f.schoolId, kind: "CAMERA_STARTED" } })).toBe(1);
  const seconds = async () => { const text = (await timer.innerText()).trim(); const [minutes, seconds] = text.split(":").map(Number); return minutes * 60 + seconds; };
  expect(await seconds()).toBeGreaterThan(1780);
  for (const skew of [-3600000, 3600000]) {
    const before = await seconds();
    await page.clock.setSystemTime(new Date(Date.now() + skew));
    // Observe the next real timer tick, not merely the pre-change rendered value.
    await expect.poll(seconds).toBeLessThan(before);
    expect(await seconds()).toBeGreaterThan(before - 5);
    await expect(page.getByRole("button", { name: "Stop sharing · Camera", exact: true })).toBeVisible();
    expect(await state(page)).toEqual({ calls: 1, live: 1 });
    expect((await db.schoolAiExamAttempt.findFirstOrThrow({ where: { schoolId: f.schoolId } })).status).toBe("IN_PROGRESS");
    const kind = skew < 0 ? "WINDOW_BLURRED" : "WINDOW_FOCUSED";
    const prior = await db.schoolAiExamIntegrityEvent.count({ where: { schoolId: f.schoolId, kind } });
    await page.evaluate(type => window.dispatchEvent(new Event(type)), skew < 0 ? "blur" : "focus");
    await expect.poll(() => db.schoolAiExamIntegrityEvent.count({ where: { schoolId: f.schoolId, kind } })).toBeGreaterThan(prior);
  }
  await page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
});

test("reload asks for camera consent again and retains server-saved answers", async ({ page }) => {
  await mockCapture(page); await page.goto(`/ai/exams/${f.assignment.id}`); await cameraStart(page);
  await page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText(examCameraCopy("en").recovery, { exact: true })).toBeVisible();
  expect(await state(page)).toEqual({ calls: 0, live: 0 });
  await expect(page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => db.schoolAiProctorSession.count({ where: { schoolId: f.schoolId, status: "ACTIVE" } })).toBe(0);
  await page.getByRole("checkbox", { name: examProctorCopy("en").consent, exact: true }).check();
  await page.getByRole("button", { name: "Start sharing · Camera", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop sharing · Camera", exact: true })).toBeVisible();
  expect(await state(page)).toEqual({ calls: 1, live: 1 });
});

test("active exam returns cached history and an already-open second tab to the exam", async ({ page, context }) => {
  await mockCapture(page); await page.goto("/student");
  const other = await context.newPage(); await other.goto("/student");
  await page.bringToFront(); await page.goto(`/ai/exams/${f.assignment.id}`); await cameraStart(page);
  await expect(other).toHaveURL(new RegExp(`/ai/exams/${f.assignment.id}$`));
  await page.goBack(); await expect(page).toHaveURL(new RegExp(`/ai/exams/${f.assignment.id}(?:\\?|$)`));
  await expect(page.locator("#exam-answer-q1")).toBeVisible();
  await expect(page.getByText(examCameraCopy("en").recovery, { exact: true })).toBeVisible();
  expect(await state(page)).toEqual({ calls: 0, live: 0 });
  const denied = await page.request.get("/api/notifications?limit=1");
  expect(denied.status()).toBe(409); expect((await denied.json()).code).toBe("EXAM_SESSION_ACTIVE");
  await other.close();
});

test("staff policy and a reasoned learner exception persist and permit a camera-free start", async ({ page, context }) => {
  const c = examCameraCopy("en"), r = examReadinessCopy("en"), p = examProctorCopy("en");
  await auth(context, f.admin); await page.goto(`/ai/exams/${f.assignment.id}`);
  const policy = page.getByRole("region", { name: p.console, exact: true });
  await expect(policy.getByRole("checkbox", { name: c.requireCamera, exact: true })).toBeChecked();
  await policy.getByRole("checkbox", { name: c.requireCamera, exact: true }).uncheck();
  await policy.getByRole("button", { name: p.save, exact: true }).click(); await expect(policy.getByRole("status")).toHaveText(p.saved);
  await policy.getByRole("checkbox", { name: c.requireCamera, exact: true }).check();
  await policy.getByRole("button", { name: p.save, exact: true }).click(); await expect(policy.getByRole("status")).toHaveText(p.saved);
  const approval = page.getByRole("region", { name: r.accommodations, exact: true });
  await approval.getByRole("button", { name: r.refresh, exact: true }).click();
  await approval.getByRole("combobox", { name: r.learner, exact: true }).selectOption(f.students[0].id);
  await approval.getByRole("checkbox", { name: c.cameraExempt, exact: true }).check();
  await approval.getByRole("textbox", { name: r.reason, exact: true }).fill("Approved supervised room with staff attendance record.");
  await approval.getByRole("button", { name: r.approve, exact: true }).click(); await expect(approval.getByRole("status")).toHaveText(r.approved);
  await auth(context, f.learner); await mockCapture(page); await page.goto(`/ai/exams/${f.assignment.id}`);
  await expect(page.getByText(c.exempt, { exact: true })).toBeVisible(); await expect(page.getByRole("region", { name: c.title, exact: true })).toHaveCount(0);
  await readiness(page); await page.getByRole("button", { name: r.start, exact: true }).click();
  await expect(page.locator("#exam-answer-q1")).toBeVisible(); expect(await state(page)).toEqual({ calls: 0, live: 0 });
});

for (const locale of ["ar", "ur"] as const) test(`${locale} required-camera preflight and exam fit a 320px phone`, async ({ page }) => {
  await db.user.update({ where: { id: f.learner.userId }, data: { preferredLanguage: locale } });
  await mockCapture(page); await page.setViewportSize({ width: 320, height: 800 }); await page.goto(`/ai/exams/${f.assignment.id}`);
  await expect(page.getByRole("region", { name: examCameraCopy(locale).title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: `test-results/school-ai/exam-preflight-${locale}.png`, fullPage: true });
  await cameraStart(page, locale);
  await expect(page.getByRole("timer", { name: examCopy(locale).time })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `test-results/school-ai/exam-room-${locale}.png`, fullPage: true });
});
