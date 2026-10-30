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
import { saveProfile, setProfileStatus } from "../../src/lib/school-ai/secure-browser-service";
import { sebHash } from "../../src/lib/school-ai/secure-browser";
import { assessmentFixture } from "./assessment-fixture";

// SKO-449 browser acceptance. A real SEB client adds request hashes over each URL; the "SEB" context
// below does exactly that with the approved keys, while the ordinary context sends none.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.SEB_TEST_APP || "http://localhost:3107";
const evidence = process.env.SEB_EVIDENCE_DIR || "/tmp/sko449-evidence";
const raw = new PrismaClient(), password = "SyntheticSeb449!";
const schoolId = `seb449b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const CONFIG_KEY = "3".repeat(64), EXAM_KEY = "4".repeat(64);
const people = new Map<string, AuthUser>();
const studentIds = new Map<string, string>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, examId = "";

async function person(key: string, role: AuthUser["role"], language = "en") {
  const user: AuthUser = { userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 };
  await raw.user.create({ data: { id: user.userId, email: user.email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  people.set(key, user);
  return user;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }, seb = false) {
  const saved = sessions.get(key);
  const ctx = saved ? await browser.newContext({ viewport, storageState: saved }) : await browser.newContext({ viewport });
  if (!saved) {
    assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: people.get(key)!.email, password } })).status(), 200);
    const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
    if (secret) {
      await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } });
      await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } });
    }
    sessions.set(key, await ctx.storageState());
  }
  // Like Safe Exam Browser: hash every request URL with the approved Config Key and Browser Exam Key.
  if (seb) await ctx.route(`${base}/**`, route => { const requestUrl = route.request().url().split("#")[0]; return route.continue({ headers: { ...route.request().headers(), "x-safeexambrowser-configkeyhash": sebHash(requestUrl, CONFIG_KEY), "x-safeexambrowser-requesthash": sebHash(requestUrl, EXAM_KEY) } }); });
  return ctx;
}
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }); };
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Palm School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Abu Dhabi", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Palm Main", regId: campusId, city: "Abu Dhabi" } });
  const coordinator = await person("coordinator", "CAMPUS_ADMIN"); await person("coordinator-ar", "CAMPUS_ADMIN", "ar");
  const teacher = await person("teacher", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 7", section: "B", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Science", teacherId: teacher.userId } });
  for (const [index, key] of ["learner", "learner-seb", "learner-ur"].entries()) {
    const user = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en"), id = randomUUID();
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: user.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } });
    studentIds.set(key, id);
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(coordinator, { kind: "CURRICULUM", campusId, title: "Synthetic science", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(coordinator, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(coordinator, { kind: "PAPER", campusId, title: "Science Term 1", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(coordinator, paper.id, { version: paper.version, action: "approve" });
  const profile = await saveProfile(coordinator, { name: "Science Term 1 — Windows labs", minClientVersion: "3.8", configKeys: [CONFIG_KEY], browserExamKeys: [EXAM_KEY], allowedResources: ["https://calc.example.invalid/basic"], testedDevices: [{ platform: "WINDOWS", clientVersion: "3.8.0", testedOn: new Date().toISOString().slice(0, 10), result: "PASS", assistiveTools: ["NVDA"], notes: "" }], expectedVersion: 0 });
  await setProfileStatus(coordinator, profile.id, { status: "APPROVED" });
  examId = (await runWithTenantContext({ schoolId, campusId, userId: coordinator.userId, role: coordinator.role }, () => createSchoolAiExam(coordinator, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Science Term 1", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3 * 3_600_000).toISOString(), studentIds: [...studentIds.values()], mode: "SECURE_BROWSER", secureProfileId: profile.id }))).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the coordinator records a tested profile; drafts without device evidence cannot be approved", async () => {
  const ctx = await context("coordinator"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/exam-delivery`);
  await page.getByRole("heading", { name: "Exam delivery profiles" }).waitFor();
  await page.getByRole("button", { name: "New profile" }).click();
  const form = page.getByRole("form", { name: "Exam delivery profiles" });
  await form.getByLabel("Profile name").fill("iPad trial — untested");
  await form.getByLabel("Config Keys (one per line)").fill("5".repeat(64));
  await form.getByRole("button", { name: "Save draft version" }).click();
  const draft = page.locator('ul[aria-label="Exam delivery profiles"] > li').filter({ hasText: "iPad trial" });
  await draft.getByText("Record at least one passing test on a real device", { exact: false }).waitFor();
  assert.equal(await draft.getByRole("button", { name: "Approve" }).isDisabled(), true);
  await page.locator('ul[aria-label="Exam delivery profiles"] > li').filter({ hasText: "Windows labs" }).getByText("Approved").waitFor();
  await shot(page, "seb-profiles-coordinator-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("an ordinary browser sees why it cannot enter; no timer or paper is issued", async () => {
  const ctx = await context("learner"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai/exams/${examId}`);
  const gate = page.getByRole("alert").filter({ hasText: "This exam must be opened in Safe Exam Browser" });
  await gate.waitFor();
  await gate.getByText("This browser is not Safe Exam Browser", { exact: false }).waitFor();
  await gate.getByText("No timer has started.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Start exam" }).count(), 0);
  const direct = await page.request.post(`${base}/api/school-ai/exams/${examId}/attempt`, { data: { version: 1 }, headers: { origin: base, "user-agent": "Mozilla/5.0 SEB/3.8 (spoofed)" } });
  assert.equal(direct.status(), 403, "a spoofed user agent is not admission");
  const config = await page.request.get(`${base}/api/school-ai/exams/${examId}/seb-config`);
  assert.equal(config.status(), 200);
  assert.match(await config.text(), /<key>startURL<\/key>/);
  assert.equal(await raw.schoolAiExamAttempt.count({ where: { assignmentId: examId } }), 0);
  await shot(page, "seb-gate-ordinary-browser-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the approved Safe Exam Browser configuration is admitted, starts and saves", async () => {
  const ctx = await context("learner-seb", undefined, true), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/ai/exams/${examId}`);
  await page.getByText("Opened in Safe Exam Browser with the approved configuration", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Check readiness", exact: true }).click();
  await page.getByRole("checkbox", { name: "I understand the timer, availability end, and saving requirements, and I am ready to start.", exact: true }).check();
  await page.getByRole("button", { name: "Start exam", exact: true }).click();
  await page.getByRole("button", { name: "4" }).first().click();
  await page.locator("[data-answer-status=CONFIRMED]").first().waitFor();
  assert.equal(await raw.schoolAiExamAttempt.count({ where: { assignmentId: examId, studentId: studentIds.get("learner-seb") } }), 1);
  await shot(page, "seb-admitted-exam-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the invigilator approves a recorded supervised alternative for an unsupported device", async () => {
  const ctx = await context("coordinator"), page = await ctx.newPage();
  await page.goto(`${base}/ai/exams/${examId}`);
  const panel = page.getByRole("region", { name: /accommodations|extra time/i }).first();
  await page.locator('select[id$="extra-time-student"], select[name="extra-time-student"]').first().selectOption(studentIds.get("learner")!);
  const alternative = page.locator("fieldset").filter({ hasText: "Supervised alternative" }).first();
  await alternative.getByLabel("Reason", { exact: true }).fill("Screen reader not supported in SEB on this laptop");
  await alternative.getByRole("button", { name: "Approve supervised alternative" }).click();
  await page.getByText("Supervised alternative approved", { exact: false }).first().waitFor();
  assert.equal(await raw.secureBrowserException.count({ where: { schoolId, assignmentId: examId } }), 1);
  await panel.scrollIntoViewIfNeeded().catch(() => undefined);
  await shot(page, "seb-supervised-alternative-en-1440");
  await ctx.close();
  const learner = await context("learner"), view = await learner.newPage();
  await view.goto(`${base}/ai/exams/${examId}`);
  await view.getByText("Supervised alternative approved for you", { exact: false }).waitFor();
  assert.equal(await view.getByRole("button", { name: "Check readiness", exact: true }).count(), 1, "the approved learner can proceed in a standard browser");
  await learner.close();
});

test("Urdu learner gate and Arabic coordinator profiles are RTL without overflow at 390px", async () => {
  {
    const ctx = await context("learner-ur", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/ai/exams/${examId}`);
    await page.getByText("یہ امتحان Safe Exam Browser میں کھولنا لازمی ہے").waitFor();
    assert.equal(await noOverflow(page), true);
    await shot(page, "seb-gate-ur-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
  {
    const ctx = await context("coordinator-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/exam-delivery`);
    await page.getByRole("heading", { name: "ملفات تقديم الامتحان" }).waitFor();
    await page.getByText("Windows labs", { exact: false }).first().waitFor();
    assert.equal(await page.locator("main").first().evaluate((el) => getComputedStyle(el).direction), "rtl"); // the frame sets dir on <html>, not <main>
    assert.equal(await noOverflow(page), true);
    await shot(page, "seb-profiles-ar-390");
    assert.deepEqual(errors, []); await ctx.close();
  }
});
