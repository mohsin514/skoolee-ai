import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, startSchoolAiExam, saveSchoolAiAttempt, reviewSchoolAiAttempt } from "../../src/lib/school-ai/exam-service";
import { assessmentFixture } from "./assessment-fixture";
import { examGradebookCopy } from "../../src/components/school-ai/exam-gradebook-copy";

const local = "postgresql://angular_dev_15@127.0.0.1:55438/postgres";
if (process.env.DATABASE_URL !== local || process.env.DIRECT_URL !== local) throw new Error("Use isolated localhost:55438 only.");
const db = new PrismaClient(), origin = "http://localhost:3106", schoolId = "school-ai-browser-b", campusId = `${schoolId}-campus`;
const admin: AuthUser = { userId: `${schoolId}-ADMIN`, schoolId, campusId, role: "ADMIN", email: "synthetic@example.invalid" };
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
let tokens: Record<string, string>, oldLanguage: string | null;
const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
async function fixture() {
  const classId = randomUUID(), subjectId = randomUUID(), userId = randomUUID(), name = `Gradebook browser ${randomUUID()}`;
  await db.class.create({ data: { id: classId, schoolId, campusId, name, academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Synthetic mathematics", totalMarks: 100 } });
  await db.user.create({ data: { id: userId, schoolId, campusId, role: "STUDENT", email: `${userId}@example.invalid`, fullName: "Synthetic learner" } });
  const student = await db.student.create({ data: { schoolId, campusId, classId, studentUserId: userId, fullName: "Synthetic gradebook learner", rollNo: "GB-1", gender: "OTHER", status: "active" } });
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", title: name, campusId, idempotencyKey: randomUUID(), data: data.curriculum });
  curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", title: name, campusId, idempotencyKey: randomUUID(), data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } });
  paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" });
  const now = Date.now(), at = (m: number) => new Date(now - m * 60000);
  const assignment = await ctx(admin, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId: paper.id, title: name, startsAt: at(5).toISOString(), endsAt: at(1).toISOString(), studentIds: [student.id], mode: "STANDARD" }, at(6)));
  const learner: AuthUser = { ...admin, userId, role: "STUDENT", email: `${userId}@example.invalid` };
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, assignment.id, at(4)));
  await ctx(learner, () => saveSchoolAiAttempt(learner, assignment.id, { sequence: 1, responses: { q1: "a1", q3: "Combine quantities" }, submit: true }, at(3)));
  await ctx(admin, () => reviewSchoolAiAttempt(admin, assignment.id, attempt!.id, { note: "Human-reviewed synthetic response", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }, { questionId: "q3", marks: 2.5, feedback: "Mostly correct" }] }, at(2)));
  const target = await db.exam.create({ data: { schoolId, campusId, classId, title: name, term: "TERM_1", academicYear: 2026, status: "ACTIVE", totalMarks: 100 } });
  return { classId, subjectId, userId, curriculum, paper, student, assignment, target };
}
test.beforeAll(async () => { tokens = JSON.parse(await readFile("test-results/school-ai/local-tokens.json", "utf8")); oldLanguage = (await db.user.findUniqueOrThrow({ where: { id: admin.userId } })).preferredLanguage; await db.user.update({ where: { id: admin.userId }, data: { preferredLanguage: "en" } }); });
test.beforeEach(async ({ context }) => { await context.addCookies([{ name: "skoolee_token", value: tokens["b-ADMIN"], url: origin }]); });
test.afterAll(async () => {
  await db.user.update({ where: { id: admin.userId }, data: { preferredLanguage: oldLanguage || "en" } });
  for (const f of fixtures) {
    await db.exam.delete({ where: { id: f.target.id } }); await db.schoolAiExamAssignment.delete({ where: { id: f.assignment.id } });
    await db.schoolAiRecord.deleteMany({ where: { id: { in: [f.paper.id, f.curriculum.id] }, schoolId } });
    await db.student.delete({ where: { id: f.student.id } }); await db.user.delete({ where: { id: f.userId } }); await db.subject.deleteMany({ where: { schoolId, classId: f.classId } }); await db.class.delete({ where: { id: f.classId } });
  }
  await db.$disconnect(); await prisma.$disconnect();
});

test("staff explicitly reviews scaled marks and a lost success response replays one gradebook receipt", async ({ page }) => {
  const f = await fixture(); fixtures.push(f);
  await db.subject.create({ data: { schoolId, campusId, classId: f.classId, name: "Unrelated synthetic subject", totalMarks: 100 } });
  await db.exam.update({ where: { id: f.target.id }, data: { subjectId: f.subjectId } });
  await page.goto(`/ai/exams/${f.assignment.id}`);
  const panel = page.getByRole("region", { name: "Send moderated marks to gradebook", exact: true });
  await panel.getByLabel("Destination exam", { exact: true }).selectOption(f.target.id);
  await panel.getByRole("button", { name: "Review exact gradebook changes", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Exact transfer requires");
  await panel.getByLabel("Mark conversion", { exact: true }).selectOption("PROPORTIONAL_WHOLE");
  await panel.getByRole("button", { name: "Review exact gradebook changes", exact: true }).click();
  await expect(panel.getByText("Gradebook mark: 90 / 100", { exact: false })).toBeVisible();
  await panel.getByRole("checkbox").check();
  const submittedBodies: string[] = [];
  await page.route(`**/api/school-ai/exams/${f.assignment.id}/gradebook`, async route => {
    if (route.request().method() !== "POST") return route.continue();
    submittedBodies.push(route.request().postData()!);
    if (submittedBodies.length === 1) { const result = await route.fetch(); expect(result.ok()).toBeTruthy(); await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic lost response" }) }); }
    else await route.continue();
  });
  await panel.getByRole("button", { name: "Send to gradebook", exact: true }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await panel.getByRole("button", { name: "Send to gradebook", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Marks sent to gradebook", exact: true })).toBeVisible();
  expect(submittedBodies[0]).toBe(submittedBodies[1]);
  expect(await db.mark.count({ where: { examId: f.target.id } })).toBe(1);
  const marks = await page.request.get(`/api/marks?examId=${f.target.id}`); expect(marks.ok()).toBeTruthy(); expect((await marks.json()).marks[0].marksObtained).toBe(90);
  expect(await db.reportCard.count({ where: { examId: f.target.id } })).toBe(0);
  await page.reload(); await expect(panel.getByRole("heading", { name: "Marks sent to gradebook", exact: true })).toBeVisible();
  const locked = await page.request.post(`/api/exams/${f.target.id}/lock`, { data: {} });
  expect(locked.ok()).toBeTruthy(); expect((await locked.json()).reportCardsGenerated).toBe(1);
  expect((await db.exam.findUniqueOrThrow({ where: { id: f.target.id } })).status).toBe("LOCKED");
});

test("all-subject lock still requires each in-scope student/subject pair", async ({ page }) => {
  const f = await fixture(), foreign = await fixture(); fixtures.push(f, foreign);
  const second = await db.subject.create({ data: { schoolId, campusId, classId: f.classId, name: "Synthetic second subject", totalMarks: 100 } });
  await db.mark.create({ data: { schoolId, campusId, examId: f.target.id, studentId: f.student.id, subjectId: f.subjectId, marksObtained: 70 } });
  // Extra rows cannot make an incomplete target class appear complete.
  await db.mark.createMany({ data: [
    { schoolId, campusId, examId: f.target.id, studentId: foreign.student.id, subjectId: f.subjectId, marksObtained: 70 },
    { schoolId, campusId, examId: f.target.id, studentId: f.student.id, subjectId: foreign.subjectId, marksObtained: 70 },
  ] });
  const missing = await page.request.post(`/api/exams/${f.target.id}/lock`, { data: {} });
  expect(missing.status()).toBe(409); expect((await missing.json()).error).toContain("1/2");
  expect(await db.reportCard.count({ where: { examId: f.target.id } })).toBe(0);
  await db.mark.create({ data: { schoolId, campusId, examId: f.target.id, studentId: f.student.id, subjectId: second.id, marksObtained: 80 } });
  const ready = await page.request.post(`/api/exams/${f.target.id}/lock`, { data: {} }); expect(ready.ok()).toBeTruthy();
});

test("student and another campus cannot read or send gradebook results", async ({ playwright }) => {
  const f = await fixture(); fixtures.push(f);
  for (const token of ["b-STUDENT", "a-ADMIN"]) {
    const request = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Cookie: `skoolee_token=${tokens[token]}`, Origin: origin } });
    try {
      expect([403, 404]).toContain((await request.get(`/api/school-ai/exams/${f.assignment.id}/gradebook`)).status());
      expect([403, 404]).toContain((await request.post(`/api/school-ai/exams/${f.assignment.id}/gradebook`, { data: { examId: f.target.id, version: 1, conversion: "EXACT", previewHash: "f".repeat(64), idempotencyKey: randomUUID() } })).status());
    } finally { await request.dispose(); }
  }
  expect(await db.mark.count({ where: { examId: f.target.id } })).toBe(0);
});

test("Arabic and Urdu gradebook review remains readable at mobile width", async ({ page }) => {
  const f = await fixture(); fixtures.push(f); await page.setViewportSize({ width: 375, height: 850 });
  for (const locale of ["ar", "ur"] as const) {
    await db.user.update({ where: { id: admin.userId }, data: { preferredLanguage: locale } });
    const t = examGradebookCopy(locale); await page.goto(`/ai/exams/${f.assignment.id}`);
    const panel = page.getByRole("region", { name: t.title, exact: true });
    await panel.getByLabel(t.exam, { exact: true }).selectOption(f.target.id); await panel.getByLabel(t.conversion, { exact: true }).selectOption("PROPORTIONAL_WHOLE");
    await panel.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(panel.getByRole("checkbox")).toBeEnabled(); expect(await panel.getAttribute("dir")).toBe("rtl");
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBeTruthy();
  }
});
