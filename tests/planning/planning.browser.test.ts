import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";

// SKO-453 on the isolated app: the principal takes a baseline, runs a +30 intake scenario where seats
// fit but lab periods do not, runs an "add a lab" alternative and compares the two; a teacher has no
// planning access; nothing live changes. EN desktop and AR phone.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.PLANNING_TEST_APP || "http://localhost:3108";
const evidence = process.env.PLANNING_EVIDENCE_DIR || "/tmp/sko453-evidence";
const db = new PrismaClient(), password = "SyntheticPlanning453!";
const schoolId = `pl453-${randomUUID()}`, campusId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;
const live = async () => [await db.class.count({ where: { campusId } }), await db.classRoom.count({ where: { campusId } }), await db.timetableSlot.count({ where: { timetable: { campusId } } }), await db.student.count({ where: { campusId } })].join("/");

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email });
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const c = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await c.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200, `login ${key}`);
  const { secret } = await (await c.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await c.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await c.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await c.storageState());
  return c;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar North", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Cedar North", regId: campusId, city: "Riyadh" } });
  await user("principal", "PRINCIPAL"); await user("principal-ar", "PRINCIPAL", "ar"); await user("teacher", "TEACHER");
  const science = users.get("teacher")!.id;
  await db.staffProfile.create({ data: { schoolId, userId: science, contractedPeriodsPerWeek: 12 } });
  for (let n = 1; n <= 4; n++) await db.classRoom.create({ data: { schoolId, campusId, roomNumber: `R-${n}`, capacity: 30 } });
  const lab = await db.classRoom.create({ data: { schoolId, campusId, roomNumber: "LAB-1", capacity: 30, roomType: "LAB" } });
  for (let p = 1; p <= 4; p++) await db.periodDefinition.create({ data: { schoolId, campusId, periodNumber: p, startTime: `0${7 + p}:00`, endTime: `0${7 + p}:40` } });
  for (const [i, section] of ["A", "B"].entries()) {
    const cls = await db.class.create({ data: { schoolId, campusId, name: "Grade 7", section, academicYear: 2027, capacity: 30 } });
    for (let s = 0; s < 28; s++) await db.student.create({ data: { schoolId, campusId, classId: cls.id, fullName: `Synthetic pupil ${section}${s}`, rollNo: `${section}${s}`, gender: "FEMALE" } });
    const subject = await db.subject.create({ data: { schoolId, campusId, classId: cls.id, name: "Science", teacherId: science } });
    const tt = await db.timetable.create({ data: { schoolId, campusId, classId: cls.id, academicYear: 2027 } });
    for (let d = 1; d <= 4; d++) await db.timetableSlot.create({ data: { schoolId, timetableId: tt.id, dayOfWeek: d, periodNumber: i + 1, subjectId: subject.id, teacherId: science, roomId: lab.id, startTime: "08:00", endTime: "08:40" } });
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  for (const m of [db.planningHandoff, db.planningScenario, db.planningBaseline]) await (m as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("seats fit but lab periods do not; an added lab is compared side by side; nothing live changes (EN desktop)", async () => {
  const before453 = await live();
  assert.equal((await (await context("teacher")).request.get(`${base}/api/planning`)).status(), 403, "planning access is required");
  const page = await (await context("principal")).newPage();
  await page.goto(`${base}/principal?view=academic-hub`);
  const panel = page.locator('section[aria-labelledby="scenario-planner"]');
  await panel.waitFor({ timeout: 60_000 });
  await panel.getByRole("button", { name: "Take baseline" }).click();
  await panel.getByText(/Baseline 1 · taken/u).waitFor({ timeout: 30_000 });
  const scenario = async (name: string, addLab: boolean) => {
    await panel.getByLabel("Scenario name").fill(name);
    await panel.getByLabel("Grade", { exact: true }).selectOption("Grade 7");
    await panel.getByLabel("Intake change (students)").fill("30");
    await panel.getByLabel("Subject", { exact: true }).selectOption("Science");
    await panel.getByLabel("Periods per section per week").fill("6");
    await panel.getByLabel("Room type needed").selectOption("LAB");
    await panel.getByLabel("Add a teacher for").selectOption("Science");
    await panel.getByLabel("New teacher periods per week").fill("10");
    if (addLab) { await panel.getByLabel("Add rooms").selectOption("LAB"); await panel.getByLabel("Room cost per year, low (estimate)").fill("40000"); await panel.getByLabel("Room cost per year, high (estimate)").fill("60000"); }
    await panel.getByRole("button", { name: "Run constraint check" }).click();
    await panel.getByText("Scenario evaluated.").waitFor({ timeout: 30_000 });
  };
  await scenario("Intake +30", false);
  await panel.getByText(/^2 lab periods are missing: 18 needed each week, 16 available\./u).waitFor();
  await panel.getByText("Caused by").first().waitFor();
  assert.ok(await panel.getByText(/LAB-1, Grade 7 · Science · 6\/section/u).first().isVisible(), "the bottleneck names the lab and the subject requirement");
  await scenario("Intake +30 with a second lab", true);
  await panel.getByLabel("Compare Intake +30", { exact: true }).check();
  await panel.getByLabel("Compare Intake +30 with a second lab").check();
  const table = panel.locator("table");
  await table.getByRole("rowheader", { name: "Hard conflicts" }).waitFor();
  const hard = await table.getByRole("row", { name: /Hard conflicts/u }).locator("td").allTextContents();
  assert.deepEqual(hard, ["1", "0"], "the second lab clears the only hard conflict");
  const roomCost = await table.getByRole("row", { name: /Room cost/u }).locator("td").allTextContents();
  assert.equal(roomCost[0], "0 SAR", "no rooms added costs nothing");
  assert.match(roomCost[1], /40,000–60,000 SAR/u);
  const teacherCost = await table.getByRole("row", { name: /Teacher cost/u }).locator("td").allTextContents();
  assert.deepEqual(teacherCost, ["Unknown", "Unknown"], "no teacher cost entered stays unknown");
  assert.equal(await live(), before453, "no live record changed");
  await panel.getByRole("button", { name: "Intake +30", exact: true }).click();
  await panel.getByRole("heading", { name: "Hard conflicts" }).waitFor();
  await table.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/planning-en-1440.png` });
  await page.close();
});

test("the planner reads right to left on a phone (AR)", async () => {
  const page = await (await context("principal-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/principal?view=academic-hub`);
  const panel = page.locator('section[aria-labelledby="scenario-planner"]');
  await panel.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  await panel.getByText("سيناريو فقط · السجلات الفعلية لم تتغير").waitFor({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Intake +30", exact: true }).click();
  const heading = panel.getByRole("heading", { name: "تعارضات صارمة" });
  await heading.waitFor({ timeout: 30_000 });
  await heading.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/planning-ar-390.png` });
  await page.close();
});
