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

// SKO-422 on the isolated app: the item-evidence API is staff-only and same-origin; the curriculum
// workspace shows denominators and not-counted states before any interpretation, in EN and AR.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.ITEM_TEST_APP || "http://localhost:3108";
const evidence = process.env.ITEM_EVIDENCE_DIR || "/tmp/sko422-evidence";
const db = new PrismaClient(), password = "SyntheticItems422!";
const schoolId = `ie422-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const users = new Map<string, { id: string; email: string; role: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
const learners: { id: string; key: string }[] = [];
let browser: Browser;
const authUser = (key: string): AuthUser => ({ userId: users.get(key)!.id, schoolId, campusId, role: users.get(key)!.role as AuthUser["role"], email: users.get(key)!.email });
const ctx = <T>(key: string, work: () => Promise<T>) => { const u = authUser(key); return runWithTenantContext({ schoolId, campusId, userId: u.userId, role: u.role }, work); };

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

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Maple School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Maple Main", regId: campusId, city: "Lahore" } });
  await user("leader", "CAMPUS_ADMIN"); await user("leader-ar", "CAMPUS_ADMIN", "ar"); await user("parent", "PARENT");
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Three", section: "A", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Mathematics" } });
  for (let i = 0; i < 6; i++) {
    await user(`learner-${i}`, "STUDENT");
    const id = randomUUID();
    await db.student.create({ data: { id, schoolId, campusId, classId, studentUserId: users.get(`learner-${i}`)!.id, fullName: `Synthetic Pupil ${i + 1}`, rollNo: `MP-${i + 1}`, gender: "OTHER", status: "active" } });
    learners.push({ id, key: `learner-${i}` });
  }
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(authUser("leader"), { kind: "CURRICULUM", campusId, title: "Synthetic addition curriculum", data: data.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(authUser("leader"), curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(authUser("leader"), { kind: "PAPER", campusId, title: "Synthetic addition check", data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(authUser("leader"), paper.id, { version: paper.version, action: "approve" });
  ids.curriculum = curriculum.id;
  const now = new Date();
  const exam = await ctx("leader", () => createSchoolAiExam(authUser("leader"), { idempotencyKey: randomUUID(), paperId: paper.id, title: "Addition check", startsAt: new Date(now.getTime() - 60_000).toISOString(), endsAt: new Date(now.getTime() + 3_600_000).toISOString(), studentIds: learners.map((l) => l.id), mode: "STANDARD" }, now));
  for (const [i, l] of learners.slice(0, 5).entries()) {
    const attempt = await ctx(l.key, () => startSchoolAiExam(authUser(l.key), exam.id, now));
    await ctx(l.key, () => saveSchoolAiAttempt(authUser(l.key), exam.id, { sequence: 1, responses: { q1: i < 2 ? "a1" : "a2", q3: "I combine the quantities." }, submit: true }, now));
    if (i < 4) await ctx("leader", () => reviewSchoolAiAttempt(authUser("leader"), exam.id, attempt!.id, { note: "Evidence checked", marks: [{ questionId: "q1", marks: i < 2 ? 2 : 0, feedback: "Checked" }, { questionId: "q3", marks: 2, feedback: "Method reviewed", evidence: [{ criterionId: "r2", quote: "combine", marks: 2 }] }] }, now));
  }
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => {
  await browser?.close();
  await db.itemEvidenceDecision.deleteMany({ where: { schoolId } });
  await db.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  await db.$disconnect(); await appPrisma.$disconnect();
});

test("the item-evidence API is staff-only and refuses cross-site writes", async () => {
  const leader = await context("leader");
  const response = await leader.request.get(`${base}/api/school-ai/item-evidence?recordId=${ids.curriculum}`);
  assert.equal(response.status(), 200, await response.text());
  const q1 = (await response.json()).result.items.find((i: { questionId: string }) => i.questionId === "q1");
  assert.deepEqual([q1.counts.answered, q1.counts.CORRECT, q1.counts.INCORRECT, q1.counts.AWAITING_REVIEW, q1.counts.NOT_ATTEMPTED], [4, 2, 2, 1, 1]);
  assert.equal(q1.percentCorrect, null, "four reviewed answers are too few for a percentage");
  const parent = await context("parent");
  assert.ok([403, 404].includes((await parent.request.get(`${base}/api/school-ai/item-evidence?recordId=${ids.curriculum}`)).status()));
  const crossSite = await leader.request.post(`${base}/api/school-ai/item-evidence`, { data: { action: "decide", recordId: ids.curriculum, data: {} }, headers: { origin: "https://example.invalid" } });
  assert.equal(crossSite.status(), 403);
});

test("the curriculum workspace leads with denominators and separate not-counted states (EN desktop, AR phone)", async () => {
  for (const [key, viewport, name, labels] of [
    ["leader", { width: 1440, height: 1000 }, "item-evidence-en-1440", { tab: "Curriculum & papers", evidence: "Student & teaching evidence", refresh: "Refresh evidence", show: "Show the answers" }],
    ["leader-ar", { width: 390, height: 844 }, "item-evidence-ar-390", { tab: "المناهج والأوراق", evidence: "أدلة الطلاب والتدريس", refresh: "تحديث الأدلة", show: "عرض الإجابات" }],
  ] as const) {
    const page = await (await context(key, viewport)).newPage(), errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/ai`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: labels.tab }).first().click({ timeout: 30_000 });
    await page.locator('select[id$="assessment-record"]').selectOption(ids.curriculum);
    await page.getByText(labels.evidence).first().click({ timeout: 30_000 });
    await page.getByRole("button", { name: labels.refresh }).click();
    const panel = page.locator('section[aria-labelledby="item-evidence-heading"]');
    await panel.waitFor({ timeout: 30_000 });
    const first = panel.locator("details").filter({ has: page.locator("summary", { hasText: /2 \+ 2/ }) }).first();
    await first.locator("summary").click();
    await first.getByRole("button", { name: labels.show }).click();
    await first.locator("fieldset").first().waitFor();
    if (key === "leader-ar") assert.equal(await page.evaluate("document.documentElement.dir"), "rtl");
    else assert.ok(await first.getByText("Only 4 reviewed answers: interpretation is limited.").isVisible());
    await first.scrollIntoViewIfNeeded();
    await page.evaluate("Promise.all(document.getAnimations().map(a => a.finished.catch(() => undefined)))");
    await first.screenshot({ path: `${evidence}/${name}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
});
