import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { createSchoolAiExam, getSchoolAiAccommodations, getSchoolAiExam, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { coordinatorView, learnerView, liveAdjustment, recordRehearsal, revokePlan, savePlan, staffView, supportRecords } from "../../src/lib/accommodations/service";
import { assessmentFixture } from "../school-ai/assessment-fixture";

// SKO-410 against the isolated database: approval roles, projections, versioning and exam binding.
const database = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (database.hostname !== "127.0.0.1" || database.port !== "55438" || database.pathname !== "/postgres") throw new Error("Use only isolated PG55438.");
const raw = new PrismaClient();
const schoolId = `acc410-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
const coordinator = actor("CAMPUS_ADMIN"), teacher = actor("TEACHER"), outsider = actor("TEACHER"), accountant = actor("ACCOUNTANT"), learner = actor("STUDENT"), guardian = actor("PARENT");
const studentId = randomUUID();
let paperId = "";
const ctx = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId, campusId, userId: user.userId, role: user.role }, fn);
const today = new Date().toISOString().slice(0, 10), nextYear = `${new Date().getUTCFullYear() + 1}-06-30`;
const planBody = (extra: Record<string, unknown> = {}) => ({ studentId, validFrom: today, validUntil: nextYear, assessmentTypes: ["EXAM", "ASSIGNMENT"], extraMinutes: 15, capabilities: { reader: true, largeText: true }, instructions: "Read questions aloud on request; seat near the front.", expectedVersion: 0, ...extra });

before(async () => {
  await raw.school.create({ data: { id: schoolId, name: "Synthetic access school", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Synthetic", status: "ACTIVE" } });
  await raw.campus.create({ data: { id: campusId, schoolId, name: "Synthetic campus", regId: campusId, city: "Synthetic" } });
  for (const user of [coordinator, teacher, outsider, accountant, learner, guardian]) await raw.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true } });
  await raw.class.create({ data: { id: classId, schoolId, campusId, name: "Synthetic Grade 6", academicYear: 2026, classTeacherId: teacher.userId } });
  await raw.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Science", teacherId: teacher.userId } });
  await raw.student.create({ data: { id: studentId, schoolId, campusId, classId, studentUserId: learner.userId, fullName: "Synthetic pupil", rollNo: "1", gender: "FEMALE", status: "active" } });
  const relationship = await raw.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: guardian.userId, createdByUserId: coordinator.userId, fullName: "Synthetic guardian", email: guardian.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await raw.guardianAccessVersion.create({ data: { schoolId, relationshipId: relationship.id, createdByUserId: coordinator.userId, reason: "Synthetic fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  const fixture = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(coordinator, { kind: "CURRICULUM", campusId, title: "Synthetic curriculum", data: fixture.curriculum, idempotencyKey: randomUUID() });
  curriculum = await updateWorkspaceRecord(coordinator, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(coordinator, { kind: "PAPER", campusId, title: "Synthetic science test", data: { ...fixture.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version }, idempotencyKey: randomUUID() });
  paper = await updateWorkspaceRecord(coordinator, paper.id, { version: paper.version, action: "approve" }); paperId = paper.id;
});
after(async () => { await raw.school.deleteMany({ where: { id: schoolId } }); await raw.$disconnect(); await prisma.$disconnect(); });

test("only designated staff approve; every change is a new immutable version; diagnosis stays out of instructions", async () => {
  await assert.rejects(() => savePlan(teacher, planBody()), { status: 403 });
  await assert.rejects(() => savePlan(coordinator, planBody({ instructions: "Has an ADHD diagnosis" })), { status: 400 });
  const v1 = await savePlan(coordinator, planBody());
  await assert.rejects(() => savePlan(coordinator, planBody({ extraMinutes: 20 })), { status: 409 }, "a stale screen cannot overwrite");
  const v2 = await savePlan(coordinator, planBody({ extraMinutes: 15, expectedVersion: 1 }));
  assert.equal(v2.version, 2);
  assert.equal((await raw.accommodationPlan.findUniqueOrThrow({ where: { id: v1.id } })).status, "SUPERSEDED");
  await assert.rejects(() => raw.accommodationPlan.update({ where: { id: v2.id }, data: { extraMinutes: 60 } }), /cannot be changed/);
  await assert.rejects(() => raw.accommodationPlan.create({ data: { schoolId, campusId, studentId, version: 9, validFrom: new Date(), validUntil: new Date(), assessmentTypes: ["EXAM"], capabilities: {}, approvedById: coordinator.userId } }), /one_active|unique/i, "at most one active plan per learner");
});

test("each role sees only its projection; supporting records are restricted and every read is audited", async () => {
  const plan = await raw.accommodationPlan.findFirstOrThrow({ where: { schoolId, status: "ACTIVE" } });
  await supportRecords(coordinator, plan.id, { note: "Synthetic confidential supporting context." });
  for (const user of [teacher, accountant, learner, guardian]) await assert.rejects(() => supportRecords(user, plan.id), { status: 403 });
  assert.ok(await raw.auditLog.count({ where: { schoolId, tableName: "accommodation_support_records", newValue: { path: ["action"], equals: "READ" } } }) >= 1);
  const staff = await staffView(teacher);
  assert.equal(staff.length, 1);
  assert.equal(staff[0].plan.instructions, "Read questions aloud on request; seat near the front.");
  const text = JSON.stringify(staff);
  for (const forbidden of ["Synthetic confidential", "supportRecords", "endReason", "approvedById"]) assert.equal(text.includes(forbidden), false, `${forbidden} is not in the teacher projection`);
  assert.deepEqual(await staffView(outsider), [], "a teacher of another class sees nothing");
  await assert.rejects(() => staffView(accountant), { status: 403 });
  await assert.rejects(() => coordinatorView(teacher, {}), { status: 403 });
  const family = await learnerView(guardian);
  assert.equal(family.mode, "guardian");
  assert.equal(JSON.stringify(family).includes("Read questions aloud"), false, "guardians get a capability summary, not staff instructions");
});

test("the effective time is bound at start: revoking the plan never changes a started attempt", async () => {
  const now = new Date();
  const exam = await ctx(coordinator, () => createSchoolAiExam(coordinator, { idempotencyKey: randomUUID(), paperId, title: "Synthetic timed test", startsAt: new Date(now.getTime() - 60_000).toISOString(), endsAt: new Date(now.getTime() + 3 * 3_600_000).toISOString(), studentIds: [studentId], mode: "STANDARD" }));
  const metadata = await ctx(learner, () => getSchoolAiExam(learner, exam.id));
  assert.equal(metadata.extraMinutes, 15, "the learner sees the plan's extra time before starting");
  const startedAt = new Date();
  const attempt = await ctx(learner, () => startSchoolAiExam(learner, exam.id, startedAt));
  const stored = await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exam.id } });
  assert.equal(stored.deadlineAt.getTime(), startedAt.getTime() + (30 + 15) * 60_000, "30-minute paper + 15 minutes");
  assert.equal((stored.accommodationSnapshot as { source: string; planVersion: number; totalMinutes: number }).totalMinutes, 45);
  assert.equal((stored.accommodationSnapshot as { planVersion: number }).planVersion, 2);
  const plan = await raw.accommodationPlan.findFirstOrThrow({ where: { schoolId, status: "ACTIVE" } });
  await revokePlan(coordinator, plan.id, { reason: "Synthetic end of support period" });
  const resumed = await ctx(learner, () => startSchoolAiExam(learner, exam.id, new Date()));
  assert.equal(new Date(resumed!.deadlineAt).getTime(), new Date(attempt!.deadlineAt).getTime(), "reconnecting keeps the same entitlement");
  assert.equal((await ctx(learner, () => getSchoolAiExam(learner, exam.id))).extraMinutes, 0, "future starts no longer see the revoked plan");

  await assert.rejects(() => liveAdjustment(teacher, exam.id, { studentId, addedMinutes: 10, reason: "Fire alarm" }), { status: 403 });
  const live = await liveAdjustment(coordinator, exam.id, { studentId, addedMinutes: 10, reason: "Fire alarm interrupted the room" });
  assert.equal(live.newDeadline.getTime() - live.oldDeadline.getTime(), 600_000);
  assert.equal((await raw.schoolAiExamAttempt.findFirstOrThrow({ where: { assignmentId: exam.id } })).deadlineAt.getTime(), live.newDeadline.getTime());
  const roster = await ctx(coordinator, () => getSchoolAiAccommodations(coordinator, exam.id));
  assert.equal(roster.students[0].liveAdjustments.length, 1, "the invigilator sees the live adjustment");
  await assert.rejects(() => raw.accommodationLiveAdjustment.updateMany({ where: { schoolId }, data: { addedMinutes: 99 } }), /kept/);
});

test("the learner rehearses the exact mode and coordinators see plans that need review", async () => {
  const fresh = await savePlan(coordinator, planBody({ expectedVersion: 2, validUntil: today, capabilities: { highContrast: true } }));
  await assert.rejects(() => recordRehearsal(teacher, { planId: fresh.id, baseMinutes: 30 }), { status: 403 });
  await recordRehearsal(learner, { planId: fresh.id, baseMinutes: 30 });
  const view = await learnerView(learner);
  assert.equal(view.mode, "learner");
  if (view.mode === "learner") assert.ok(view.plan?.rehearsedAt, "the practice check is recorded");
  const coordinatorScreen = await coordinatorView(coordinator, {});
  assert.deepEqual(coordinatorScreen.review.map(row => row.planId), [fresh.id], "a plan ending today needs review");
});
