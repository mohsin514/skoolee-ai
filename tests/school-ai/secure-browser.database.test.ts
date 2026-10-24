import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, getSchoolAiExam, saveSchoolAiAttempt, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { grantSupervisedAlternative, saveProfile, setProfileStatus } from "../../src/lib/school-ai/secure-browser-service";
import { runWithSebEvidence, sebHash } from "../../src/lib/school-ai/secure-browser";
import { assessmentFixture } from "./assessment-fixture";

// SKO-449 against the isolated database: profile lifecycle, pinned delivery and server-side admission.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `seb449-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const coordinator = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), learner = actor("STUDENT"), other = actor("STUDENT");
const learnerId = randomUUID(), otherId = randomUUID();
const CONFIG_KEY = "1".repeat(64), EXAM_KEY = "2".repeat(64);
let paperId = "", profileId = "", examId = "";
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const url = (path: string) => `https://school.example.invalid${path}`;
const seb = (path: string, configKey = CONFIG_KEY) => ({ url: url(path), requestHash: sebHash(url(path), EXAM_KEY), configKeyHash: sebHash(url(path), configKey) });
const profileBody = (extra: Record<string, unknown> = {}) => ({ name: "Grade 7 SEB Windows", minClientVersion: "3.8", configKeys: [CONFIG_KEY], browserExamKeys: [EXAM_KEY], allowedResources: ["https://calc.example.invalid/basic"], testedDevices: [{ platform: "WINDOWS", clientVersion: "3.8.0", testedOn: new Date().toISOString().slice(0, 10), result: "PASS", assistiveTools: ["NVDA"], notes: "" }], expectedVersion: 0, ...extra });

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic SEB school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [coordinator, teacher, learner, other]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 7", academicYear: 2026 } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Science", teacherId: teacher.userId } });
  for (const [id, user] of [[learnerId, learner], [otherId, other]] as const) await raw.student.create({ data: { id, schoolId, campusId, classId, studentUserId: user.userId, fullName: "Synthetic learner", rollNo: id.slice(0, 6), gender: "FEMALE", status: "active" } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(coordinator, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(coordinator, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(coordinator, { kind: "PAPER", campusId, title: "Synthetic secure test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(coordinator, paper.id, { version: paper.version, action: "approve" }); paperId = paper.id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

const exam = (extra: Record<string, unknown> = {}) => ctx(coordinator, () => createSchoolAiExam(coordinator, { idempotencyKey: randomUUID(), paperId, title: "Synthetic secure test", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [learnerId, otherId], mode: "SECURE_BROWSER", ...extra }));

test("only coordinators manage profiles; approval needs keys and tested devices; versions are immutable", async () => {
  await assert.rejects(() => saveProfile(teacher, profileBody()), { status: 403 });
  const untested = await saveProfile(coordinator, profileBody({ testedDevices: [] }));
  await assert.rejects(() => setProfileStatus(coordinator, untested.id, { status: "APPROVED" }), { status: 400 });
  const v2 = await saveProfile(coordinator, profileBody({ profileKey: untested.profileKey, expectedVersion: 1 }));
  await assert.rejects(() => exam({ secureProfileId: v2.id }), { status: 409 }, "a draft profile cannot deliver an exam");
  await setProfileStatus(coordinator, v2.id, { status: "APPROVED" });
  await assert.rejects(() => raw.secureBrowserProfile.update({ where: { id: v2.id }, data: { configKeys: ["f".repeat(64)] } }), /cannot be changed/);
  profileId = v2.id;
});

test("a secure exam pins its profile; ordinary browsers, modified configurations and replayed hashes never start a timer", async () => {
  await assert.rejects(() => exam(), { status: 409 }, "secure mode without a profile is refused");
  await assert.rejects(() => ctx(coordinator, () => createSchoolAiExam(coordinator, { idempotencyKey: randomUUID(), paperId, title: "x", startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3_600_000).toISOString(), studentIds: [learnerId], mode: "STANDARD", secureProfileId: profileId })), { status: 400 });
  const created = await exam({ secureProfileId: profileId });
  examId = created.id;
  const stored = await raw.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: examId } });
  assert.deepEqual([stored.mode, stored.secureProfileId, stored.secureProfileVersion], ["SECURE_BROWSER", profileId, 2]);
  const path = `/api/school-ai/exams/${examId}/attempt`;
  const metadata = await ctx(learner, () => runWithSebEvidence({ url: url(`/api/school-ai/exams/${examId}`), requestHash: null, configKeyHash: null }, () => getSchoolAiExam(learner, examId)));
  assert.deepEqual(metadata.secureBrowser, { required: true, admitted: false, via: null, reason: "MISSING_HEADERS", profile: { name: "Grade 7 SEB Windows", minClientVersion: "3.8", version: 2 } }, "the learner sees an actionable reason, not the paper");
  await assert.rejects(() => ctx(learner, () => startSchoolAiExam(learner, examId)), { status: 403, code: "SEB_NO_EVIDENCE" });
  await assert.rejects(() => ctx(learner, () => runWithSebEvidence({ url: url(path), requestHash: null, configKeyHash: null }, () => startSchoolAiExam(learner, examId))), { status: 403, code: "SEB_MISSING_HEADERS" });
  await assert.rejects(() => ctx(learner, () => runWithSebEvidence(seb(path, "9".repeat(64)), () => startSchoolAiExam(learner, examId))), { status: 403, code: "SEB_CONFIG_MISMATCH" });
  await assert.rejects(() => ctx(learner, () => runWithSebEvidence({ ...seb("/elsewhere"), url: url(path) }, () => startSchoolAiExam(learner, examId))), { status: 403 }, "hashes for another URL are rejected");
  assert.equal(await raw.schoolAiExamAttempt.count({ where: { assignmentId: examId } }), 0, "no refused request created an attempt or timer");
});

test("a verified Safe Exam Browser starts and saves; a later ordinary-browser save is refused without losing answers", async () => {
  const path = `/api/school-ai/exams/${examId}/attempt`;
  const attempt = await ctx(learner, () => runWithSebEvidence(seb(path), () => startSchoolAiExam(learner, examId)));
  assert.ok(attempt?.id);
  await ctx(learner, () => runWithSebEvidence(seb(path), () => saveSchoolAiAttempt(learner, examId, { sequence: 1, responses: { q1: attempt!.paper.questions[0].options[0].id } })));
  await assert.rejects(() => ctx(learner, () => runWithSebEvidence({ url: url(path), requestHash: null, configKeyHash: null }, () => saveSchoolAiAttempt(learner, examId, { sequence: 2, responses: {} }))), { status: 403 });
  const stored = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: examId } });
  assert.equal(stored.sequence, 1, "the acknowledged answer is kept after a refused request");
});

test("an unsupported device gets an audited supervised alternative, never a silent downgrade", async () => {
  await assert.rejects(() => grantSupervisedAlternative(teacher, examId, { studentId: otherId, reason: "Screen reader not supported in SEB on this laptop" }), { status: 403 });
  await grantSupervisedAlternative(coordinator, examId, { studentId: otherId, reason: "Screen reader not supported in SEB on this laptop" });
  const started = await ctx(other, () => startSchoolAiExam(other, examId));
  assert.ok(started?.id, "the approved learner starts in a standard browser");
  const metadata = await ctx(other, () => getSchoolAiExam(other, examId));
  assert.equal((metadata.secureBrowser as { via?: string }).via, "SUPERVISED_ALTERNATIVE");
  assert.equal(await raw.auditLog.count({ where: { schoolId, tableName: "secure_browser_exceptions" } }), 1);
  await assert.rejects(() => raw.secureBrowserException.updateMany({ where: { schoolId }, data: { reason: "changed" } }), /kept as history/);
});
