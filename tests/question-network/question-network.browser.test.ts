import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import type { AuthUser } from "../../src/lib/auth";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-454 on the isolated app: a teacher shares an approved question from the Tests page (it stays in
// review); a teacher at another school sees a published question with its rights, review record and
// suppressed statistics, opens the key, adopts it and reviews a pending one; learners get no access.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.NETWORK_TEST_APP || "http://localhost:3108";
const evidence = process.env.NETWORK_EVIDENCE_DIR || "/tmp/sko454-evidence";
const db = new PrismaClient(), password = "SyntheticNetwork454!";
const A = { id: `qnb-a-${randomUUID()}`, campusId: randomUUID() }, B = { id: `qnb-b-${randomUUID()}`, campusId: randomUUID() };
const users = new Map<string, AuthUser>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
let browser: Browser;

async function user(key: string, s: typeof A, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId: s.id, campusId: s.campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { userId: id, email, schoolId: s.id, campusId: s.campusId, role: role as AuthUser["role"] });
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
const item = (status: string, version: number, prompt: string) => ({
  shareKey: `Q-${randomUUID().slice(0, 6).toUpperCase()}`, version, contributorSchoolId: A.id, contributorCampusId: A.campusId, contributedById: users.get("teacher-a")!.userId,
  source: { paperId: "p", paperVersion: 2, questionId: "q1", paperTitle: "Synthetic fractions paper", approvedAt: "2026-09-01T00:00:00.000Z" }, audience: "PUBLIC",
  rights: { basis: "OPEN_LICENCE", holder: null, licence: "CC BY 4.0", attribution: "Synthetic Cedar School maths department", permits: "PUBLIC" },
  tags: { subject: "Mathematics", grade: "Grade 5", curriculum: "", language: "en" },
  content: { type: "SINGLE_CHOICE", prompt, marks: 2, options: [{ id: "a1", text: "3/4" }, { id: "a2", text: "2/3" }], outcomes: [{ title: "Compare fractions", source: "Synthetic syllabus" }] },
  answerKey: { correctOptionId: "a1", modelAnswer: "3/4 is larger because 9/12 > 8/12." }, status, publishedAt: status === "PUBLISHED" ? new Date() : null,
});

before(async () => {
  for (const s of [A, B]) {
    await db.school.create({ data: { id: s.id, name: s === A ? "Synthetic Cedar School" : "Synthetic Palm School", slug: s.id, regId: s.id, contactEmail: `${s.id}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
    await db.campus.create({ data: { id: s.campusId, schoolId: s.id, name: "Main", regId: s.campusId, city: "Riyadh" } });
    await db.academicCycle.create({ data: { schoolId: s.id, campusId: s.campusId, label: "2026", academicYear: 2026, status: "ACTIVE" } });
  }
  await user("admin-a", A, "CAMPUS_ADMIN"); await user("teacher-a", A, "TEACHER"); await user("student-a", A, "STUDENT");
  await user("teacher-b", B, "TEACHER"); await user("teacher-b-ar", B, "TEACHER", "ar");
  const classId = randomUUID(), subjectId = randomUUID();
  await db.class.create({ data: { id: classId, schoolId: A.id, campusId: A.campusId, name: "Grade 5", section: "A", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId: A.id, campusId: A.campusId, classId, name: "Mathematics", teacherId: users.get("teacher-a")!.userId } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(users.get("admin-a")!, { kind: "CURRICULUM", campusId: A.campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(users.get("admin-a")!, curriculum.id, { version: curriculum.version, action: "approve" });
  const paper = await createWorkspaceRecord(users.get("teacher-a")!, { kind: "PAPER", campusId: A.campusId, title: "Synthetic addition paper", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  await updateWorkspaceRecord(users.get("admin-a")!, paper.id, { version: paper.version, action: "approve" });
  const published = await db.questionNetworkItem.create({ data: item("PUBLISHED", 1, "Which fraction is larger: 3/4 or 2/3?") });
  for (const [i, decision] of ["APPROVE", "APPROVE", "REQUEST_CHANGES"].entries()) await db.questionNetworkReview.create({ data: { itemId: published.id, version: 1, reviewerId: randomUUID(), reviewerSchoolId: i ? B.id : randomUUID(), expertise: { subject: "Mathematics", language: "en" }, decision, issues: decision === "APPROVE" ? [] : [{ code: "AMBIGUOUS", detail: "Say 'greater' instead of 'larger'." }] } });
  await db.questionNetworkItem.update({ where: { id: published.id }, data: { adjudication: { reason: "Both words are taught in Grade 5; wording kept.", approvals: 2, objections: 1, conflicts: 0 } } });
  await db.questionNetworkStat.create({ data: { shareKey: published.shareKey, version: 1, reporterSchoolId: A.id, reportedById: users.get("teacher-a")!.userId, sampleSize: 12, meanScore: 0.7, context: "Grade 5 term 1" } });
  await db.questionNetworkItem.create({ data: item("IN_REVIEW", 1, "Order 1/2, 2/5 and 3/4 from smallest to largest.") });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  const items = await db.questionNetworkItem.findMany({ where: { contributorSchoolId: A.id }, select: { id: true } });
  await db.questionNetworkReview.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } });
  await db.questionNetworkStat.deleteMany({ where: { reporterSchoolId: { in: [A.id, B.id] } } });
  await db.questionNetworkAdoption.deleteMany({ where: { adopterSchoolId: { in: [A.id, B.id] } } });
  await db.questionNetworkItem.deleteMany({ where: { contributorSchoolId: A.id } });
  await db.school.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("a teacher shares an approved question; it stays in review and learners have no access", async () => {
  assert.equal((await (await context("student-a")).request.get(`${base}/api/question-network`)).status(), 403);
  const page = await (await context("teacher-a")).newPage();
  await page.goto(`${base}/teacher/tests`);
  const panel = page.locator('section[aria-labelledby="question-network"]');
  await panel.waitFor({ timeout: 60_000 });
  const source = panel.getByLabel("Approved question");
  await source.selectOption({ index: 1 });
  await panel.getByLabel("Audience", { exact: true }).selectOption("SCHOOL");
  await panel.getByLabel("The rights permit sharing with").selectOption("SCHOOL");
  await panel.getByRole("button", { name: "Submit for review" }).click();
  await panel.getByText("Confirm the rights before sharing.").waitFor({ timeout: 30_000 });
  await panel.getByLabel("I confirm my school may share this question with the chosen audience").check();
  await panel.getByRole("button", { name: "Submit for review" }).click();
  await panel.getByText("Question submitted for review. It stays a draft until reviewed and published.").waitFor({ timeout: 30_000 });
  assert.equal(await db.questionNetworkItem.count({ where: { contributorSchoolId: A.id, audience: "SCHOOL", status: "IN_REVIEW" } }), 1);
  await page.close();
});

test("another school reads provenance and review record, opens the key, adopts and reviews (EN desktop)", async () => {
  const page = await (await context("teacher-b")).newPage();
  await page.goto(`${base}/teacher/tests`);
  const panel = page.locator('section[aria-labelledby="question-network"]');
  await panel.waitFor({ timeout: 60_000 });
  const card = panel.locator("article", { hasText: "Which fraction is larger" });
  await card.getByText("Reviews: 2 approvals · 1 objections · 0 conflicts declared").waitFor({ timeout: 30_000 });
  assert.ok(await card.getByText(/Both words are taught in Grade 5/u).isVisible(), "the adjudication is visible");
  assert.ok(await card.getByText("Not enough responses to show results (minimum 30).").isVisible(), "a 12-learner cohort is suppressed");
  assert.equal(await card.getByText(/9\/12 > 8\/12/u).isVisible(), false, "the key is closed by default");
  await card.getByText("Show answer key (teaching staff only)").click();
  await card.getByText(/9\/12 > 8\/12/u).waitFor();
  await card.getByRole("button", { name: "Adopt for my school" }).click();
  await panel.getByText("Question adopted. Your copy stays on this version until you accept a correction.").waitFor({ timeout: 30_000 });
  const pending = panel.locator("article", { hasText: "Order 1/2, 2/5 and 3/4" });
  await pending.getByLabel("Decision").selectOption("REQUEST_CHANGES");
  await pending.getByLabel("Issue detail").fill("Ask learners to show a common denominator.");
  await pending.getByRole("button", { name: "Submit review" }).click();
  await panel.getByText("Review recorded.").waitFor({ timeout: 30_000 });
  assert.equal(await db.questionNetworkReview.count({ where: { reviewerId: users.get("teacher-b")!.userId, decision: "REQUEST_CHANGES" } }), 1);
  await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/network-en-1440.png` });
  await page.close();
});

test("the library reads right to left on a phone (AR)", async () => {
  const page = await (await context("teacher-b-ar", { width: 390, height: 844 })).newPage();
  await page.goto(`${base}/teacher/tests`);
  const panel = page.locator('section[aria-labelledby="question-network"]');
  await panel.waitFor({ timeout: 60_000 });
  assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
  const card = panel.locator("article", { hasText: "Which fraction is larger" });
  await card.waitFor({ timeout: 30_000 });
  await card.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${evidence}/network-ar-390.png` });
  await page.close();
});
