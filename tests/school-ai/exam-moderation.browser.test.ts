import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext } from "playwright";
import bcrypt from "bcryptjs";
import type { AuthUser } from "../../src/lib/auth";
import { totp } from "../../src/lib/auth/mfa-crypto";
import { prisma as appPrisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, reviewSchoolAiAttempt, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-424 on the isolated app: the moderation API is staff-only and same-origin; a released result
// cannot be revised directly; the proposer cannot approve their own correction; a stale approval
// form conflicts instead of overwriting; the exam studio shows original beside proposed.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== (process.env.QA_DB_PORT || "55438") || url.pathname !== "/postgres") throw Error(`Only isolated local DB ${process.env.QA_DB_PORT || "55438"} is allowed`);
const base = process.env.MODERATION_TEST_APP || "http://localhost:3108";
const evidence = process.env.MODERATION_EVIDENCE_DIR || "/tmp/sko424-evidence";
const db = new PrismaClient(), password = "SyntheticModeration424!";
const schoolId = `md424-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const users = new Map<string, { id: string; email: string; role: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
let browser: Browser;
const authUser = (key: string): AuthUser => ({ userId: users.get(key)!.id, schoolId, campusId, role: users.get(key)!.role as AuthUser["role"], email: users.get(key)!.email });
const ctx = <T>(key: string, work: () => Promise<T>) => { const u = authUser(key); return runWithTenantContext({ schoolId, campusId, userId: u.userId, role: u.role }, work); };
const review = (q3: number) => ({ note: "Evidence checked", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }, { questionId: "q3", marks: q3, feedback: "Method reviewed", evidence: [{ criterionId: "r2", quote: "combine", marks: q3 }] }] });

async function user(key: string, role: string, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email, role });
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
const api = async (key: string, body: object) => (await context(key)).request.post(`${base}/api/school-ai/exams/${ids.exam}/moderation`, { data: body, headers: { origin: base } });

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Birch School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Birch Main", regId: campusId, city: "Riyadh" } });
  await user("marker", "CAMPUS_ADMIN"); await user("lead", "PRINCIPAL"); await user("lead-ar", "CAMPUS_ADMIN", "ar"); await user("parent", "PARENT");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Five", section: "B", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics" } });
  const learnerIds: string[] = [];
  for (let i = 0; i < 2; i++) {
    await user(`learner-${i}`, "STUDENT");
    const id = randomUUID();
    await db.student.create({ data: { id, schoolId, campusId, classId, studentUserId: users.get(`learner-${i}`)!.id, fullName: `Synthetic Pupil ${i + 1}`, rollNo: `BR-${i + 1}`, gender: "OTHER", status: "active" } });
    learnerIds.push(id);
  }
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(authUser("marker"), { kind: "CURRICULUM", campusId, title: "Synthetic moderation curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(authUser("marker"), curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(authUser("marker"), { kind: "PAPER", campusId, title: "Synthetic moderated paper", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(authUser("marker"), paper.id, { version: paper.version, action: "approve" });
  const now = new Date(Date.now() - 2 * 3_600_000);
  const exam = await ctx("marker", () => createSchoolAiExam(authUser("marker"), { idempotencyKey: randomUUID(), paperId: paper.id, title: "Birch moderated check", startsAt: new Date(now.getTime() - 60_000).toISOString(), endsAt: new Date(now.getTime() + 3_600_000).toISOString(), studentIds: learnerIds, mode: "STANDARD" }, now));
  ids.exam = exam.id;
  for (let i = 0; i < 2; i++) {
    const key = `learner-${i}`;
    const attempt = await ctx(key, () => startSchoolAiExam(authUser(key), exam.id, now));
    await ctx(key, () => saveSchoolAiAttempt(authUser(key), exam.id, { sequence: 1, responses: { q1: "a1", q3: "I combine the quantities." }, submit: true }, now));
    await ctx("marker", () => reviewSchoolAiAttempt(authUser("marker"), exam.id, attempt!.id, review(1), now));
    ids[`attempt${i}`] = attempt!.id;
  }
  await db.schoolAiExamAssignment.update({ where: { id: exam.id }, data: { resultsReleasedAt: new Date(), resultsReleasedById: users.get("marker")!.id } });
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.schoolAiResultCorrection.deleteMany({ where: { schoolId } });
  await db.schoolAiModerationSample.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("released results change only through an independent, version-checked approval over HTTP", async () => {
  const marker = await context("marker");
  const revise = await marker.request.post(`${base}/api/school-ai/exams/${ids.exam}/results`, { data: { action: "revise", data: { attemptId: ids.attempt0, version: 1, reason: "Direct change after release", review: review(3) } }, headers: { origin: base } });
  assert.equal(revise.status(), 409);
  const proposed = await api("marker", { action: "propose", data: { attemptId: ids.attempt0, version: 1, reason: "Alternative method meets criterion r2.", review: review(3), source: "REGRADE" } });
  assert.equal(proposed.status(), 201, await proposed.text());
  ids.correction = (await proposed.json()).result.id;
  assert.equal((await api("marker", { action: "decide", data: { correctionId: ids.correction, version: 1, decision: "APPROVE", note: "Approving my own change." } })).status(), 403);
  assert.ok([403, 404].includes((await (await context("parent")).request.get(`${base}/api/school-ai/exams/${ids.exam}/moderation`)).status()));
  const crossSite = await (await context("lead")).request.post(`${base}/api/school-ai/exams/${ids.exam}/moderation`, { data: { action: "decide", data: { correctionId: ids.correction, version: 1, decision: "APPROVE", note: "Cross-site approval." } }, headers: { origin: "https://example.invalid" } });
  assert.equal(crossSite.status(), 403);
  const second = await api("marker", { action: "propose", data: { attemptId: ids.attempt1, version: 1, reason: "Second script, same alternative method.", review: review(3), source: "REGRADE" } });
  ids.pending = (await second.json()).result.id;
});

test("the exam studio shows the original beside the proposal, and a stale form conflicts (EN desktop, AR phone)", async () => {
  for (const [key, viewport, name] of [["lead", { width: 1440, height: 1000 }, "moderation-en-1440"], ["lead-ar", { width: 390, height: 844 }, "moderation-ar-390"]] as const) {
    const page = await (await context(key, viewport)).newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/ai/studio?exam=${ids.exam}#space=improve`);
    await page.waitForLoadState("networkidle");
    const panel = page.locator('section[aria-labelledby="moderation-heading"]');
    await panel.waitFor({ timeout: 60_000 });
    if (key === "lead") {
      assert.ok(await panel.getByText("Released results change only through", { exact: false }).count() === 0, "the released banner is the plain-language one");
      assert.ok(await panel.getByText("Results are released: any change needs a correction approved by a different reviewer.", { exact: false }).isVisible());
      // A second tab approves first; this page's form is now stale.
      assert.equal((await api("lead", { action: "decide", data: { correctionId: ids.correction, version: 1, decision: "APPROVE", note: "Rubric criterion r2 is met." } })).status(), 200);
      const card = panel.locator("div.rounded-xl").filter({ hasText: "Alternative method meets criterion r2." }).last();
      await card.getByLabel("Decision note").fill("Approving from a stale form.");
      await card.getByRole("button", { name: "Approve correction" }).click();
      await panel.getByRole("alert").waitFor();
      assert.match(await panel.getByRole("alert").innerText(), /changed since you opened it/);
    } else assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
    await panel.scrollIntoViewIfNeeded();
    await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))");
    await panel.screenshot({ path: `${evidence}/${name}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  const revisions = await db.schoolAiExamResultRevision.findMany({ where: { attemptId: ids.attempt0 }, orderBy: { version: "asc" } });
  assert.deepEqual(revisions.map((r) => (r.review as { total: number }).total), [3, 5], "one approved correction, applied once");
});
