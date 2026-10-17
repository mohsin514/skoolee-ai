import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 R19 browser acceptance: the evidence pack panel produces a pack, lists it after a reload and serves a verifiable ZIP.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-evidence-pack";
const raw = new PrismaClient(), password = "SyntheticEvidence408!";
const schoolId = `evp408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, examId = "";
const learnerKeys = ["learner-ur", "learner2"];

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
const settled = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined))));
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = async (page: Page, name: string, fullPage = false) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png`, fullPage }); };
async function openSpace(page: Page, name: RegExp) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو|اسٹوڈیو/ }).getByRole("button", { name }).click();
}
const as = (user: AuthUser) => <T>(fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Cedar Evidence School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Islamabad", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Cedar Main", regId: campusId, city: "Islamabad" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "C", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  const studentIds: string[] = [];
  for (const [index, key] of learnerKeys.entries()) {
    const learner = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en");
    const id = randomUUID(); studentIds.push(id);
    await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "MALE", status: "active" } });
  }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title: "Unit 6 quiz", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
  await updateWorkspaceRecord(lead, paper.id, { version: paper.version, action: "approve" });
  examId = (await as(author)(() => createSchoolAiExam(author, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Unit 6 quiz", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds, mode: "STANDARD" }))).id;
  for (const key of learnerKeys) { const learner = people.get(key)!; await as(learner)(() => startSchoolAiExam(learner, examId)); }
  for (const [index, key] of learnerKeys.entries()) {
    const learner = people.get(key)!;
    const attempt = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId, userId: learner.userId } });
    await as(learner)(() => saveSchoolAiAttempt(learner, examId, { sequence: attempt.sequence + 1, responses: { q1: "a1", q3: index ? "I count them." : "Put both groups together, then count every object." }, submit: true }));
    await as(lead)(() => reviewSchoolAiAttempt(lead, examId, attempt.id, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: 2, feedback: "Partly explained." }], note: "Moderated." }));
  }
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the lead produces an evidence pack, sees it listed after a reload, and the ZIP verifies independently", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Results and improvement/);
  const panel = page.getByTestId("evidence-pack-panel");
  await panel.getByText("No evidence pack has been produced for this assessment yet.").waitFor();
  await panel.getByRole("button", { name: "Produce evidence pack" }).click();
  await panel.getByText(/Evidence pack produced: \d+ files, \d+ records\./).waitFor();
  await page.reload();
  await page.keyboard.press("Shift");
  await openSpace(page, /Results and improvement/);
  await panel.getByRole("link", { name: "Download ZIP" }).first().waitFor();
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "evidence-pack-panel-en-1440");
  const href = await panel.getByRole("link", { name: "Download ZIP" }).first().getAttribute("href");
  const response = await ctx.request.get(base + href);
  assert.equal(response.status(), 200);
  assert.equal(response.headers()["content-type"], "application/zip");
  const dir = mkdtempSync(join(tmpdir(), "evidence-ui-"));
  try {
    writeFileSync(join(dir, "pack.zip"), await response.body());
    execFileSync("unzip", ["-q", join(dir, "pack.zip"), "-d", join(dir, "out")]);
    const manifest = JSON.parse(readFileSync(join(dir, "out", "manifest.json"), "utf8"));
    for (const entry of manifest.files) assert.equal(execFileSync("shasum", ["-a", "256", join(dir, "out", entry.path)], { encoding: "utf8" }).split(" ")[0], entry.sha256, entry.path);
    assert.equal(manifest.includedKeys, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(errors, []); await ctx.close();
});

test("a learner cannot produce or download a pack", async () => {
  const ctx = await context("learner2"), pack = await raw.schoolAiEvidencePack.findFirstOrThrow({ where: { assignmentId: examId } });
  assert.ok([403, 404].includes((await ctx.request.post(`${base}/api/school-ai/exams/${examId}/evidence-pack`, { data: {}, headers: { origin: base } })).status()));
  assert.ok([403, 404].includes((await ctx.request.get(`${base}/api/school-ai/exams/${examId}/evidence-pack/${pack.id}`)).status()));
  await ctx.close();
});

test("the Arabic panel reads right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /النتائج والتحسين/);
  const panel = page.getByTestId("evidence-pack-panel");
  await panel.getByRole("link", { name: "تنزيل ملف ZIP" }).first().waitFor();
  assert.equal(await noOverflow(page), true);
  await panel.scrollIntoViewIfNeeded();
  await shot(page, "evidence-pack-panel-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
