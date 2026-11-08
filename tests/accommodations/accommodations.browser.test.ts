import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-410 browser acceptance against the isolated database and app.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.ACCESS_TEST_APP || "http://localhost:3107";
const evidence = process.env.ACCESS_EVIDENCE_DIR || "/tmp/sko410-evidence";
const raw = new PrismaClient(), password = "SyntheticAccess410!";
const schoolId = `acc410b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function person(key: string, role: AuthUser["role"], language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await raw.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved });
  const ctx = await browser.newContext({ viewport });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) {
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
    await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
  }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
async function open(key: string, path: string, viewport?: { width: number; height: number }) {
  const ctx = await context(key, viewport), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(base + path);
  return { ctx, page, errors };
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Maple School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Jeddah", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Maple Main", regId: campusId, city: "Jeddah" } });
  const coordinator = await person("coordinator", "CAMPUS_ADMIN"); await person("coordinator-ar", "CAMPUS_ADMIN", "ar");
  const teacher = await person("teacher", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Science", teacherId: teacher.userId } });
  const studentIds: string[] = [];
  for (const [index, key] of ["learner", "learner-ur"].entries()) {
    const user = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en"), id = randomUUID();
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: user.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
    studentIds.push(id);
  }
  // The Urdu learner already has an approved plan; the English learner's plan is created in the browser.
  await raw.accommodationPlan.create({ data: { schoolId, campusId, studentId: studentIds[1], version: 1, validFrom: new Date(Date.now() - 86_400_000), validUntil: new Date(Date.now() + 120 * 86_400_000), assessmentTypes: ["EXAM", "PRACTICE"], extraMinutes: 10, extraPercent: 0, breakMinutes: 5, capabilities: { highContrast: true, largeText: true }, instructions: "Allow a short supervised break after the first section.", approvedById: coordinator.userId } });
  const fixture = assessmentFixture(subjectId, classId);
  fixture.paper.blueprint.durationMinutes = 45;
  let curriculum = await createWorkspaceRecord(coordinator, { kind: "CURRICULUM", campusId, title: "Synthetic science curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(coordinator, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(coordinator, { kind: "PAPER", campusId, title: "Demo science test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(coordinator, paper.id, { version: paper.version, action: "approve" });
  const startsAt = new Date(Date.now() + 2 * 86_400_000);
  await runWithTenantContext({ schoolId, campusId, userId: coordinator.userId, role: coordinator.role }, () => createSchoolAiExam(coordinator, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Demo science test", startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 3 * 3_600_000).toISOString(), studentIds, mode: "STANDARD" }));
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the coordinator approves a plan, sees the effective-time calculation and keeps supporting records restricted", async () => {
  const { ctx, page, errors } = await open("coordinator", "/accommodations");
  // Framed in the coordinator's own shell (RoleFrame); the PageHeader title is the registry label.
  await page.getByRole("heading", { level: 1, name: "Access plans", exact: true }).waitFor();
  const pupil = page.locator('ul[aria-label="Assessment access plans"] > li').filter({ hasText: "Synthetic pupil 1" });
  await pupil.getByRole("button", { name: "Create access plan" }).click();
  const form = page.getByRole("form", { name: "Review access plan" });
  await form.getByLabel("Valid until").fill(new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10));
  await form.getByLabel("Extra minutes").fill("15");
  await form.getByLabel("Reader", { exact: true }).check();
  await form.getByLabel("Large text", { exact: true }).check();
  await form.getByLabel("Instructions for staff").fill("Has a dyslexia diagnosis");
  await form.getByRole("button", { name: "Approve plan version" }).click();
  await page.getByRole("status").filter({ hasText: "supporting record" }).waitFor();
  await form.getByLabel("Instructions for staff").fill("Read questions aloud on request.");
  await form.getByText("Effective time").waitFor();
  await form.getByRole("button", { name: "Approve plan version" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await pupil.getByText("Active plan · Version 1", { exact: false }).waitFor();
  assert.ok((await pupil.locator("dl").first().innerText()).includes("60 min"), "45 + 15 = 60 minutes");
  await pupil.getByText("Supporting records (restricted)").click();
  await pupil.getByLabel("Note").fill("Synthetic supporting context for the coordinator only.");
  await pupil.getByRole("button", { name: "Add supporting note" }).click();
  await pupil.getByText("Synthetic supporting context for the coordinator only.", { exact: false }).waitFor();
  await shot(page, "access-coordinator-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("a teacher sees operational adjustments only, never supporting records", async () => {
  const { ctx, page, errors } = await open("teacher", "/teacher/accommodations");
  const card = page.getByRole("listitem").filter({ hasText: "Synthetic pupil 1" }).first();
  await card.getByText("Read questions aloud on request.").waitFor();
  assert.equal(await page.getByText("Synthetic supporting context", { exact: false }).count(), 0);
  assert.equal(await page.getByText("Supporting records", { exact: false }).count(), 0);
  assert.equal((await page.request.get(base + `/api/accommodations/${(await raw.accommodationPlan.findFirstOrThrow({ where: { schoolId, version: 1, extraMinutes: 15 } })).id}/support`)).status(), 403);
  await shot(page, "access-teacher-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the learner sees the exact entitlement and completes a practice check", async () => {
  const { ctx, page, errors } = await open("learner", "/student/access");
  await page.getByText("Your assessment includes 15 additional minutes.").waitFor();
  const upcoming = page.getByRole("region", { name: "Upcoming assessments" });
  assert.ok((await upcoming.innerText()).includes("60 min"));
  await page.getByRole("button", { name: "This works for me" }).click();
  await page.getByText("Practice check completed", { exact: false }).waitFor();
  assert.equal(await raw.accommodationRehearsal.count({ where: { schoolId } }), 1);
  await shot(page, "access-learner-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic coordinator and Urdu learner layouts are RTL without overflow at 390px", async () => {
  {
    const { ctx, page, errors } = await open("coordinator-ar", "/accommodations", { width: 390, height: 860 });
    await page.getByRole("heading", { level: 1, name: "خطط التسهيلات", exact: true }).waitFor();
    await page.getByText("Synthetic pupil 2").waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl");
    assert.equal(await noOverflow(page), true);
    await shot(page, "access-coordinator-ar-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
  {
    const { ctx, page, errors } = await open("learner-ur", "/student/access", { width: 390, height: 860 });
    await page.getByText("آپ کی جانچ میں 15 اضافی منٹ شامل ہیں۔").waitFor();
    assert.equal(await noOverflow(page), true);
    await shot(page, "access-learner-ur-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
});
