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
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { recordRehearsal } from "../../src/lib/school-ai/exam-release-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408 browser acceptance: the Rehearsal and Exam Room spaces.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.RELEASE_TEST_APP || "http://localhost:3107";
const evidence = process.env.RELEASE_EVIDENCE_DIR || "/tmp/sko408-room-evidence";
const raw = new PrismaClient(), password = "SyntheticRoom408!";
const schoolId = `room408b-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const people = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser, cleanId = "", unrehearsedId = "";

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
const shotOf = async (page: Page, target: ReturnType<Page["locator"]>, name: string) => { await settled(page); await target.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const shot = async (page: Page, name: string) => { await settled(page); await page.screenshot({ path: `${evidence}/${name}.png` }); };
async function openSpace(page: Page, name: RegExp) {
  await page.goto(`${base}/ai/studio`);
  await page.keyboard.press("Shift");
  await page.locator("[data-studio-intro]").waitFor({ state: "detached" }).catch(() => undefined);
  await page.getByRole("navigation", { name: /Studio spaces|مساحات الاستوديو/ }).getByRole("button", { name }).click();
}

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic Pine Exam School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Quetta", status: "ACTIVE", plan: "PRO" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Pine Main", regId: campusId, city: "Quetta" } });
  const lead = await person("lead", "CAMPUS_ADMIN"); await person("lead-ar", "CAMPUS_ADMIN", "ar");
  const author = await person("author", "TEACHER");
  await raw.academicCycle.create({ data: { schoolId, campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 8", section: "F", academicYear: 2026, classTeacherId: author.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics", teacherId: author.userId } });
  for (const [index, key] of ["learner", "learner-ur"].entries()) { const learner = await person(key, "STUDENT", key === "learner-ur" ? "ur" : "en"); await raw.student.create({ data: { id: randomUUID(), schoolId, campusId, classId, studentUserId: learner.userId, fullName: `Synthetic pupil ${index + 1}`, rollNo: String(index + 1), gender: "FEMALE", status: "active" } }); }
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId, title: "Grade 8 mathematics", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(lead, curriculum.id, { version: curriculum.version, action: "approve" });
  const approve = async (title: string) => {
    const paper = await createWorkspaceRecord(author, { kind: "PAPER", campusId, title, data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } as unknown as Record<string, unknown>, idempotencyKey: randomUUID() });
    const reviewed = await updateWorkspaceRecord(author, paper.id, { version: paper.version, action: "review" });
    return updateWorkspaceRecord(lead, paper.id, { version: reviewed.version, action: "approve" });
  };
  const clean = await approve("Term 1 test");
  await recordRehearsal(author, clean.id, { version: clean.version, findings: [] });
  cleanId = clean.id;
  unrehearsedId = (await approve("Term 1 retake")).id;
  await raw.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await raw.school.delete({ where: { id: schoolId } }).catch(() => undefined); await raw.$disconnect(); await prisma.$disconnect(); });

test("the rehearsal space shows each paper's state and rehearses the one that needs it", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Rehearsal/);
  const space = page.locator("[data-rehearsal-space]");
  await space.locator('[data-rehearsal-row="CLEAN"]').waitFor();
  await space.locator('[data-rehearsal-row="NONE"]').getByRole("button", { name: "Open" }).click();
  await space.getByRole("button", { name: "Record rehearsal" }).click();
  await space.locator('[data-rehearsal-row="CLEAN"]').nth(1).waitFor();
  assert.equal(await raw.schoolAiRehearsal.count({ where: { schoolId, recordId: unrehearsedId } }), 1);
  await shot(page, "room-rehearsal-space-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("the exam room releases a ready paper to candidates and shows its seal", async () => {
  const ctx = await context("lead"), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /Exam Room/);
  const room = page.locator("[data-exam-room]");
  await room.getByLabel("Approved paper").selectOption(cleanId);
  await room.locator('[data-room-state="ready"]').waitFor();
  await room.getByLabel("Exam title").fill("Term 1 test");
  await room.getByText("Synthetic pupil 2").waitFor();
  await room.getByLabel("Select everyone").check();
  await room.getByRole("button", { name: "Release to candidates" }).click();
  await room.locator("[data-room-result]").filter({ hasText: /^Released and sealed as #[0-9a-f]{16}$/ }).waitFor();
  await room.locator("[data-delivered-exam]").filter({ hasText: "Term 1 test" }).waitFor();
  const exam = await raw.schoolAiExamAssignment.findFirstOrThrow({ where: { schoolId, paperId: cleanId } });
  assert.match(exam.contentHash ?? "", /^[0-9a-f]{64}$/);
  await shot(page, "room-released-en-1440");
  assert.deepEqual(errors, []); await ctx.close();
});

test("Arabic lead reads the exam room right-to-left without overflow at 390px", async () => {
  const ctx = await context("lead-ar", { width: 390, height: 860 }), page = await ctx.newPage(), errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openSpace(page, /قاعة الامتحان/);
  const room = page.locator("[data-exam-room]");
  await room.locator("[data-delivered-exam]").first().waitFor();
  assert.equal(await noOverflow(page), true);
  await room.locator("[data-delivered-exam]").first().scrollIntoViewIfNeeded();
  await shot(page, "room-ar-390");
  assert.deepEqual(errors, []); await ctx.close();
});
