import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { hashSessionToken } from "../../src/lib/auth/session-cookie";
import { getLiveReportCardPayload } from "../../src/lib/academic/report-cards";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";

const dbUrl = new URL(process.env.DATABASE_URL || "http://invalid");
const appUrl = new URL(process.env.ACADEMIC_MODEL_TEST_APP || "http://127.0.0.1:3216");
if (dbUrl.hostname !== "127.0.0.1" || dbUrl.port !== "55416" || dbUrl.pathname !== "/skoolee") throw new Error("SKO-216 integration tests require the dedicated local 55416/skoolee database");
if (appUrl.hostname !== "127.0.0.1" || appUrl.port !== "3216") throw new Error("SKO-216 integration tests require the local app on port 3216");

const db = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });
const schoolId = `academic-${randomUUID()}`;
const campusId = `campus-${randomUUID()}`;
const otherCampusId = `campus-${randomUUID()}`;
const classId = `class-${randomUUID()}`;
const foreignClassId = `class-${randomUUID()}`;
const subjects = [`subject-${randomUUID()}`, `subject-${randomUUID()}`];
const foreignSubjectId = `subject-${randomUUID()}`;
const users = new Map<string, { token: string; userId: string }>();

async function request(path: string, role: string, body?: unknown, method = "GET", query = "", base = "/api/academic-models") {
  const response = await fetch(new URL(`${base}${path}${query}`, appUrl), {
    method,
    headers: { cookie: `skoolee_token=${users.get(role)!.token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic academic model school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Main campus", city: "Synthetic", regId: campusId } });
  await db.campus.create({ data: { id: otherCampusId, schoolId, name: "Other campus", city: "Synthetic", regId: otherCampusId } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Grade 6", section: "A", academicYear: 2026, subjects: { create: [
    { id: subjects[0], schoolId, campusId, name: "Mathematics", totalMarks: 100 },
    { id: subjects[1], schoolId, campusId, name: "Science", totalMarks: 100 },
  ] } } });
  await db.class.create({ data: { id: foreignClassId, schoolId, campusId: otherCampusId, name: "Grade 6", section: "B", academicYear: 2026, subjects: { create: [{ id: foreignSubjectId, schoolId, campusId: otherCampusId, name: "Mathematics", totalMarks: 100 }] } } });
  for (const role of ["SUPER_ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "STUDENT"]) {
    const userId = randomUUID();
    const email = `${userId}@example.invalid`;
    await db.user.create({ data: { id: userId, schoolId, campusId, email, fullName: "Synthetic User", role: role as never, isActive: true, onboardingComplete: true, mfaEnabled: true } });
    const token = await new SignJWT({ userId, schoolId, campusId, email, fullName: "Synthetic User", role, accessVersion: 0, onboardingComplete: true, mfaVerified: true })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret-change-me"));
    await db.loginSession.create({ data: { schoolId, userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 3600_000) } });
    users.set(role, { token, userId });
  }
});

after(async () => {
  await db.school.deleteMany({ where: { id: schoolId } });
  await db.$disconnect();
});

test("campus model API is scoped to its tenant and role permissions", async () => {
  const denied = await request("", "STUDENT", undefined, "GET", "?academicYear=2026");
  assert.equal(denied.status, 403);
  const deniedWrite = await request("", "TEACHER", { action: "create" }, "POST");
  assert.equal(deniedWrite.status, 403);
  const outside = await request("", "CAMPUS_ADMIN", undefined, "GET", `?academicYear=2026&campusId=${otherCampusId}`);
  assert.equal(outside.status, 403);
  const loaded = await request("", "PRINCIPAL", undefined, "GET", "?academicYear=2026");
  assert.equal(loaded.status, 200);
  const data = await loaded.json();
  assert.equal(data.classes.length, 1);
  assert.equal(data.classes[0].id, classId);
  assert.equal(data.classes[0].subjects.length, 2);
});

test("draft preview and activation retain a pinned version and prevent overlaps", async () => {
  const config = {
    classIds: [classId],
    subjectMappings: [{ code: "math", label: "Mathematics", subjectIds: [subjects[0]] }, { code: "science", label: "Science", subjectIds: [subjects[1]] }],
    terms: [
      { id: "t1", label: "Term 1", startDate: "2026-01-01", endDate: "2026-06-30", teachingWeeks: 20, reportingPeriod: true },
      { id: "t2", label: "Term 2", startDate: "2026-07-01", endDate: "2026-12-31", teachingWeeks: 20, reportingPeriod: true },
    ],
    grading: { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, weightMode: "NORMALIZED", thresholds: [{ label: "A+", minimum: 90 }, { label: "A", minimum: 80 }, { label: "B", minimum: 70 }, { label: "C", minimum: 60 }, { label: "D", minimum: 50 }, { label: "F", minimum: 0 }], missingPolicy: "COUNT_AS_ZERO", absentPolicy: "COUNT_AS_ZERO", exemptPolicy: "EXCLUDE", roundingRule: "ONE_DECIMAL" },
    progression: { passPercentage: 50, attendanceMinimum: 75, conditionalPromotion: false },
    report: { showComponentBreakdown: true, showAttendance: true, showRank: false },
  };
  const created = await request("", "CAMPUS_ADMIN", { action: "create", campusId, academicYear: 2026, title: "Grade 6 Model", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", configuration: config }, "POST");
  assert.equal(created.status, 201, await created.clone().text());
  const draft = (await created.json()).model;
  const preview = await request(`/${draft.id}`, "PRINCIPAL", { action: "preview", campusId }, "POST");
  assert.equal(preview.status, 200, await preview.clone().text());
  const review = await preview.json();
  assert.equal(review.success, true);
  assert.equal(review.impact.exams, 0);
  const activated = await request(`/${draft.id}`, "PRINCIPAL", { action: "activate", campusId }, "POST");
  assert.equal(activated.status, 200, await activated.clone().text());
  const weight = await db.gradeWeightConfig.findUniqueOrThrow({ where: { classId_academicYear: { classId, academicYear: 2026 } } });
  assert.equal(weight.academicModelVersionId, draft.id);
  assert.equal(weight.roundingRule, "ONE_DECIMAL");
  const createdExam = await request("", "PRINCIPAL", { title: "Synthetic Term 1 exam", term: "Term 1", classId, academicYear: 2026, examType: "MID_TERM" }, "POST", "", "/api/exams");
  assert.equal(createdExam.status, 201, await createdExam.clone().text());
  const exam = (await createdExam.json()).exam;
  assert.equal(exam.academicModelVersionId, draft.id);
  const studentId = `student-${randomUUID()}`;
  await db.student.create({ data: { id: studentId, schoolId, campusId, classId, fullName: "Synthetic Report Learner", rollNo: studentId, gender: "OTHER" } });
  await db.exam.update({ where: { id: exam.id }, data: { status: "LOCKED", isLocked: true } });
  await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId, subjectId: subjects[0], marksObtained: 88 } });
  await db.mark.create({ data: { schoolId, campusId, examId: exam.id, studentId, subjectId: subjects[1], marksObtained: 0, isExempt: true } });
  const report = await db.reportCard.create({ data: { schoolId, campusId, studentId, examId: exam.id, remarksEn: "Synthetic report" } });
  const reportPayload = await runWithTenantContext({ schoolId, campusId, role: "PRINCIPAL", userId: users.get("PRINCIPAL")!.userId }, () => getLiveReportCardPayload(report.id));
  assert.equal(reportPayload.weightConfig?.academicModelVersionId, draft.id);
  assert.equal(reportPayload.weightConfig?.roundingRule, "ONE_DECIMAL");
  assert.equal(reportPayload.marks.find((mark) => mark.subjectId === subjects[1])?.isExempt, true);
  const overlapping = structuredClone(config);
  overlapping.terms[0].startDate = "2026-06-01";
  overlapping.terms[0].endDate = "2026-08-01";
  overlapping.terms[1].startDate = "2026-08-02";
  const duplicate = await request("", "CAMPUS_ADMIN", { action: "create", campusId, academicYear: 2026, title: "Overlapping draft", effectiveFrom: "2026-06-01", configuration: overlapping }, "POST");
  assert.equal(duplicate.status, 201);
  const conflict = await request(`/${(await duplicate.json()).model.id}`, "PRINCIPAL", { action: "preview", campusId }, "POST");
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).problems[0].code, "period_conflict");
});

test("campus cannot bind a class from another campus and templates require group role", async () => {
  const invalid = await request("", "CAMPUS_ADMIN", { action: "create", campusId, academicYear: 2026, title: "Cross campus", effectiveFrom: "2026-01-01", configuration: { classIds: [foreignClassId], subjectMappings: [{ code: "math", label: "Mathematics", subjectIds: [foreignSubjectId] }], terms: [], grading: { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, weightMode: "NORMALIZED", thresholds: [], missingPolicy: "COUNT_AS_ZERO", absentPolicy: "COUNT_AS_ZERO", exemptPolicy: "EXCLUDE", roundingRule: "WHOLE" }, progression: { passPercentage: 50, attendanceMinimum: 75, conditionalPromotion: false }, report: { showComponentBreakdown: true, showAttendance: true, showRank: false } } }, "POST");
  assert.equal(invalid.status, 403);
  const templates = await request("", "CAMPUS_ADMIN", undefined, "GET", "?templates=1");
  assert.equal(templates.status, 403);
  const templateWrite = await request("", "CAMPUS_ADMIN", { action: "create-template" }, "POST");
  assert.equal(templateWrite.status, 403);
});

test("group templates use explicit delegated overrides and require approval", async () => {
  const configuration = {
    classIds: [],
    subjectMappings: [{ code: "math", label: "Mathematics", subjectIds: [] }],
    terms: [
      { id: "template-t1", label: "Term 1", startDate: "", endDate: "", teachingWeeks: 20, reportingPeriod: true },
      { id: "template-t2", label: "Term 2", startDate: "", endDate: "", teachingWeeks: 20, reportingPeriod: true },
    ],
    grading: { quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40, passingPercentage: 50, weightMode: "NORMALIZED", thresholds: [{ label: "A+", minimum: 90 }, { label: "A", minimum: 80 }, { label: "B", minimum: 70 }, { label: "C", minimum: 60 }, { label: "D", minimum: 50 }, { label: "F", minimum: 0 }], missingPolicy: "COUNT_AS_ZERO", absentPolicy: "COUNT_AS_ZERO", exemptPolicy: "EXCLUDE", roundingRule: "WHOLE" },
    progression: { passPercentage: 50, attendanceMinimum: 75, conditionalPromotion: false },
    report: { showComponentBreakdown: true, showAttendance: true, showRank: false },
  };
  const created = await request("", "SUPER_ADMIN", { action: "create-template", title: "Synthetic Group Template", configuration, delegatedOverrideKeys: ["terms"] }, "POST");
  assert.equal(created.status, 201, await created.clone().text());
  const draft = (await created.json()).model;
  assert.equal(draft.isSharedTemplate, true);
  assert.deepEqual(draft.delegatedOverrideKeys, ["terms"]);
  const rejected = await request(`/${draft.id}`, "SUPER_ADMIN", { action: "approve-template" }, "POST");
  assert.equal(rejected.status, 200, await rejected.clone().text());
  assert.equal((await rejected.json()).model.status, "TEMPLATE");
  const visible = await request("", "CAMPUS_ADMIN", undefined, "GET", "?academicYear=2026");
  assert.ok((await visible.json()).templates.some((item: { id: string }) => item.id === draft.id));
});

test("principal builder renders at desktop, tablet, and mobile sizes with RTL and keyboard controls", async () => {
  await db.user.update({ where: { id: users.get("PRINCIPAL")!.userId }, data: { preferredLanguage: "ur" } });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addCookies([{ name: "skoolee_token", value: users.get("PRINCIPAL")!.token, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
    const page = await context.newPage();
    await page.goto(new URL("/principal?view=academic-model", appUrl).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.getByText("تعلیمی امور").first().click({ timeout: 20_000 });
    await page.getByText("نصاب اور تعلیمی ادوار").first().click({ timeout: 20_000 });
    await page.getByText("تعلیمی ماڈل بنائیں").waitFor({ timeout: 20_000 });
    assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
    assert.equal(await page.locator("html").getAttribute("lang"), "ur");
    const addPeriod = page.getByRole("button", { name: "مدت شامل کریں" });
    await addPeriod.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("heading", { name: "مدت 3" }).count(), 1);
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(100);
      const metrics = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      assert.ok(metrics.scroll <= metrics.width + 1, `horizontal overflow at ${viewport.width}px: ${JSON.stringify(metrics)}`);
      await page.screenshot({ path: `/private/tmp/sko216-${viewport.width}.png`, fullPage: true });
    }
    await context.close();
  } finally {
    await browser.close();
  }
});
