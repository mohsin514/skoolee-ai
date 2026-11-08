import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-479 and SKO-480 on the isolated app: the teacher workspace names the school and campus on desktop
// and phone, in English and Arabic, and counts read "1 student" (and the right Arabic forms), with zero
// and two students checked too.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.SHELL_TEST_APP || "http://localhost:3108";
const evidence = process.env.SHELL_EVIDENCE_DIR || "/tmp/sko479-evidence";
const db = new PrismaClient(), password = "SyntheticShell479!";
const schoolId = `sh479-${randomUUID()}`, campusId = randomUUID();
const SCHOOL = "Synthetic Navigation QA International School of Excellence", CAMPUS = "QA Campus North";
const users = new Map<string, { id: string; email: string }>();
let browser: Browser, classId = "";
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `QA ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, welcomeCompletedAt: new Date(), tourProgress: { teacher: { v: 1, s: "done", at: new Date().toISOString() } }, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport: { width: number; height: number }): Promise<BrowserContext> {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, reducedMotion: "reduce", storageState: saved });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}
async function students(n: number) {
  const old = (await db.student.findMany({ where: { classId }, select: { id: true } })).map((x) => x.id);
  await db.studentEnrollment.deleteMany({ where: { studentId: { in: old } } });
  await db.student.deleteMany({ where: { classId } });
  for (let i = 0; i < n; i++) await db.student.create({ data: { schoolId, campusId, classId, fullName: `Synthetic learner ${i}`, rollNo: `L${i}`, gender: "MALE", status: "active" } });
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: SCHOOL, slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: CAMPUS, regId: campusId, city: "Riyadh" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026 QA active term", academicYear: 2026, status: "ACTIVE" } });
  await user("teacher", "TEACHER"); await user("teacher-ar", "TEACHER", "ar");
  classId = (await db.class.create({ data: { schoolId, campusId, name: "QA Class", academicYear: 2026, classTeacherId: users.get("teacher")!.id } })).id;
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the teacher workspace names the school and campus on desktop and phone; counts are singular for one", async () => {
  await students(1);
  for (const [viewport, name] of [[{ width: 1280, height: 900 }, "teacher-desktop-1280"], [{ width: 360, height: 800 }, "teacher-phone-360"]] as const) {
    const page = await (await context("teacher", viewport)).newPage();
    await page.goto(`${base}/teacher`);
    const badge = viewport.width < 640 ? page.locator('header p[title]').filter({ hasText: SCHOOL }) : page.getByTestId("scope-badge");
    await badge.waitFor({ timeout: 60_000 });
    assert.equal((await badge.textContent())?.replace(/\s+/g, " ").trim(), `${SCHOOL} · ${CAMPUS}`);
    assert.ok(await badge.isVisible(), `scope is visible at ${viewport.width}px`);
    const box = await badge.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= viewport.width + 1, "the badge stays inside the viewport");
    await page.getByText("1 student", { exact: false }).first().waitFor({ timeout: 30_000 });
    const text = await page.locator("body").innerText();
    assert.ok(!/\b1 students\b/u.test(text), "never “1 students”");
    assert.ok(text.includes("1 student in your classes"), "the register reads “1 student in your classes”");
    await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
    await page.screenshot({ path: `${evidence}/${name}.png` });
    await page.close();
  }
});

test("zero and two students, and Arabic forms on a phone", async () => {
  for (const [n, expected] of [[0, "0 students"], [2, "2 students"]] as const) {
    await students(n);
    const page = await (await context("teacher", { width: 1280, height: 900 })).newPage();
    await page.goto(`${base}/teacher`);
    await page.getByText(`${expected} in your classes`).waitFor({ timeout: 60_000 });
    await page.close();
  }
  await students(1);
  await db.class.update({ where: { id: classId }, data: { classTeacherId: users.get("teacher-ar")!.id } });
  const page = await (await context("teacher-ar", { width: 360, height: 800 })).newPage();
  await page.goto(`${base}/teacher`);
  await page.locator('header p[title]').filter({ hasText: SCHOOL }).waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await page.getByText("طالب واحد", { exact: false }).first().waitFor({ timeout: 30_000 });
  await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
    await page.screenshot({ path: `${evidence}/teacher-phone-ar-360.png` });
  await page.close();
});


test("attendance lookup errors offer retry, not a false check-in action, using the school's day", async () => {
  const ctx = await context("teacher", { width: 390, height: 844 });
  const page = await ctx.newPage(); let fail = true; let requestedDay = "";
  await page.route("**/api/teacher-attendance?*", async route => {
    requestedDay = new URL(route.request().url()).searchParams.get("date") || "";
    await route.fulfill({ status: fail ? 503 : 200, json: fail ? { success: false } : { success: true, data: [{ checkInTime: "08:15" }] } });
  });
  await page.goto(`${base}/teacher`);
  const check = page.locator('[data-tour="teacher.today.checkin"]');
  await check.getByText("Check-in status unavailable").waitFor();
  assert.equal(await check.getByRole("button", { name: "Check in for today", exact: true }).count(), 0);
  assert.match(requestedDay, /^\d{4}-\d{2}-\d{2}$/);
  await page.locator('div.pointer-events-none.fixed.inset-0[aria-hidden="true"]').waitFor({ state: "hidden" });
  await page.screenshot({ path: `${evidence}/teacher-checkin-retry-390.png` });
  fail = false;
  await check.getByRole("button", { name: "Try again" }).click();
  await check.getByText("Checked in", { exact: false }).waitFor();
  assert.match(await check.innerText(), /08:15/);
  await ctx.close();
});
