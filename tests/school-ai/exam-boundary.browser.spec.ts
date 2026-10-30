import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { examProctorFixture, removeProctorFixture, type ProctorFixture } from "./exam-proctor-fixture";
const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
const baseUrl = process.env.SCHOOL_AI_TEST_ORIGIN || "http://localhost:3106";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated PG55438 only.");
const db = new PrismaClient(), fixtures: ProctorFixture[] = []; let f: ProctorFixture;
async function auth(context: BrowserContext, user: AuthUser) {
  const token = await new SignJWT({ ...user, mfaVerified: true, onboardingComplete: true, schoolStatus: "ACTIVE" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode("school-ai-isolated-browser-test-secret-only"));
  await db.loginSession.create({ data: { userId: user.userId, schoolId: user.schoolId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7200000), isActive: true } });
  await context.clearCookies(); await context.addCookies([{ name: "skoolee_token", value: token, url: baseUrl, httpOnly: true, sameSite: "Lax" }]);
}
const origin = { Origin: baseUrl };
test.beforeEach(async ({ context }) => { f = await examProctorFixture(db, { enabled: false, integrityDays: 2 }); fixtures.push(f); await auth(context, f.learner); });
test.afterAll(async () => { for (const item of fixtures) await removeProctorFixture(db, item.schoolId); await db.$disconnect(); await prisma.$disconnect(); });

test("HTTP active boundary covers pages, public URLs, APIs, dot paths and server actions then releases on submission", async ({ context }) => {
  const examUrl = `/ai/exams/${f.assignment.id}`, api = `/api/school-ai/exams/${f.assignment.id}`;
  for (const path of ["/student", "/pricing", "/ai", "/ai/exams/other"]) {
    const response = await context.request.get(path, { maxRedirects: 0 }); expect(response.status(), path).toBe(307); expect(new URL(response.headers().location, baseUrl).pathname).toBe(examUrl); expect(response.headers()["cache-control"]).toContain("no-store");
  }
  const prefetch = await context.request.get("/student?_rsc=synthetic-prefetch", { maxRedirects: 0, headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
  expect(prefetch.status()).toBe(307); expect(new URL(prefetch.headers().location, baseUrl).pathname).toBe(examUrl);
  for (const path of ["/api/ai/insights", "/api/chat/threads", "/api/chat/threads.json", `${api}/results`, "/api/school-ai/exams/other/attempt"]) {
    const response = await context.request.post(path, { headers: { ...origin, "x-user-role": "ADMIN" }, data: {} }); expect(response.status(), path).toBe(409); expect((await response.json()).code).toBe("EXAM_SESSION_ACTIVE");
  }
  const action = await context.request.post(examUrl, { headers: { ...origin, "Next-Action": "synthetic-action-id" }, data: "test", maxRedirects: 0 }); expect(action.status()).toBe(409);
  expect((await context.request.get("/favicon.ico")).status()).not.toBe(409);
  const session = await context.request.get("/api/auth/session"); expect(session.status()).toBe(200);
  expect((await session.json()).activeExamUrl).toBe(examUrl); expect(session.headers()["cache-control"]).toContain("no-store");
  expect((await context.request.get(`${api}/attempt`)).status()).toBe(200);
  const submitted = await context.request.patch(`${api}/attempt`, { headers: origin, data: { sequence: 1, responses: { q1: "a1" }, submit: true } }); expect(submitted.status()).toBe(200); expect((await submitted.json()).attempt.status).toBe("SUBMITTED");
  expect((await context.request.get("/api/school-ai/exams")).status()).toBe(200);
  expect((await (await context.request.get("/api/auth/session")).json()).activeExamUrl).toBeNull();
});

test("native history returns to a hydrated exam with server-saved answers", async ({ page }) => {
  // This fixture needs a real pre-exam history entry before the boundary starts.
  await db.schoolAiExamAttempt.delete({ where: { id: f.attempt!.id } });
  await page.goto("/student"); await expect(page.getByRole("heading").first()).toBeVisible();
  const examUrl = `/ai/exams/${f.assignment.id}`;
  await page.goto(examUrl);
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await page.getByRole("checkbox", { name: "I understand the timer, availability end, and saving requirements, and I am ready to start.", exact: true }).check();
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true }).click();
  await expect(page.getByText("Saved to server", { exact: true })).toBeVisible();
  await page.goBack();
  await expect.poll(() => new URL(page.url()).pathname).toBe(examUrl);
  await expect(page.locator("#exam-answer-q1").getByRole("button", { name: "4", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Save answers", exact: true })).toBeEnabled();
});

test("server deadline releases navigation without relying on a client timer", async ({ context }) => {
  await db.schoolAiExamAttempt.update({ where: { id: f.attempt!.id }, data: { startedAt: new Date(Date.now() - 2000), deadlineAt: new Date(Date.now() - 1000) } });
  expect((await context.request.get("/api/school-ai/exams")).status()).toBe(200);
  const receipt = await context.request.get(`/api/school-ai/exams/${f.assignment.id}/attempt`); expect(receipt.status()).toBe(200); expect((await receipt.json()).attempt.status).toBe("SUBMITTED");
});

test("revocation and stale signed role do not gain access through allowed exam routes; logout remains available", async ({ context }) => {
  await db.user.update({ where: { id: f.learner.userId }, data: { accessVersion: 1 } });
  expect((await context.request.get(`/api/school-ai/exams/${f.assignment.id}/attempt`)).status()).toBe(401);
  const logout = await context.request.post("/api/auth/logout", { headers: origin, data: {} }); expect(logout.status()).toBe(200);
  expect((await context.request.get(`/api/school-ai/exams/${f.assignment.id}/attempt`)).status()).toBe(401);
});

test("revoked, expired and stale student sessions reveal no active exam metadata on unrelated routes", async ({ context }) => {
  const signedCookies = await context.cookies();
  const account = await db.user.findUniqueOrThrow({ where: { id: f.learner.userId } });
  const scenarios = [
    { name: "revoked session", invalidate: () => db.loginSession.updateMany({ where: { userId: account.id }, data: { isActive: false } }) },
    { name: "expired session", invalidate: () => db.loginSession.updateMany({ where: { userId: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } }) },
    { name: "stale access version", invalidate: () => db.user.update({ where: { id: account.id }, data: { accessVersion: account.accessVersion + 1 } }) },
    { name: "disabled account", invalidate: () => db.user.update({ where: { id: account.id }, data: { isActive: false } }) },
    { name: "changed role", invalidate: () => db.user.update({ where: { id: account.id }, data: { role: "TEACHER" } }) },
  ];
  for (const scenario of scenarios) {
    await db.loginSession.updateMany({ where: { userId: account.id }, data: { isActive: true, expiresAt: new Date(Date.now() + 7200000) } });
    await db.user.update({ where: { id: account.id }, data: { accessVersion: account.accessVersion, isActive: true, role: account.role } });
    await scenario.invalidate();
    for (const path of ["/api/ai/insights", "/api/chat/threads.json", "/api/auth/session", `/api/school-ai/exams/${f.assignment.id}/attempt`]) {
      // Restore the captured signed cookie to exercise every request after the
      // preceding denial correctly clears it from this synthetic browser.
      await context.addCookies(signedCookies);
      const response = await context.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${scenario.name}: ${path}`).toBe(401);
      expect(await response.json()).toEqual({ error: "Invalid or expired session" });
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    for (const path of ["/student", "/pricing"]) {
      await context.addCookies(signedCookies);
      const response = await context.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${scenario.name}: ${path}`).toBe(307);
      expect(new URL(response.headers().location, baseUrl).pathname).toBe("/login");
      expect(response.headers().location).not.toContain(f.assignment.id);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  }
});

test("HTTP integrity observations remain unverified and staff review never changes marks", async ({ context }) => {
  const api = `/api/school-ai/exams/${f.assignment.id}/integrity`;
  const input = { attemptId: f.attempt!.id, clientEventId: randomUUID(), kind: "PAGE_HIDDEN", observedAt: new Date().toISOString(), details: {} };
  const saved = await context.request.post(api, { headers: origin, data: input }); expect(saved.status()).toBe(200); const eventId = (await saved.json()).id;
  expect((await context.request.get(api)).status()).toBe(409); // candidate boundary excludes the staff desk
  await auth(context, f.admin);
  const view = await context.request.get(api); expect(view.status()).toBe(200); expect((await view.json()).summary.pending).toBe(1);
  const reviewed = await context.request.patch(api, { headers: origin, data: { eventId, version: 1, decision: "DISMISSED", reason: "An approved assistive tool caused the focus change." } }); expect(reviewed.status()).toBe(200);
  expect(await db.mark.count({ where: { schoolId: f.schoolId } })).toBe(0);
  expect((await db.schoolAiExamAttempt.findUniqueOrThrow({ where: { id: f.attempt!.id } })).review).toBeNull();
});
