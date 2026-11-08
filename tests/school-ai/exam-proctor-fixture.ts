import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { runWithTenantContext } from "../../src/lib/db/tenant-context";
import { createSchoolAiExam, startSchoolAiExam } from "../../src/lib/school-ai/exam-service";
import { updateExamProctorPolicy } from "../../src/lib/school-ai/exam-proctor-service";
import { updateExamIntegrityPolicy } from "../../src/lib/school-ai/exam-integrity-service";
import { assessmentFixture } from "./assessment-fixture";
export const proctorContext = <T>(user: AuthUser, fn: () => Promise<T>) => runWithTenantContext({ schoolId: user.schoolId, campusId: user.campusId, userId: user.userId, role: user.role }, fn);
export async function examProctorFixture(db: PrismaClient, options: { start?: boolean; enabled?: boolean; integrityDays?: number } = {}) {
  const schoolId = `proctor-ai-${randomUUID()}`, campusId = randomUUID(), classId = randomUUID(), subjectId = randomUUID();
  try {
  await db.school.create({ data: { id: schoolId, name: "Synthetic recording school", slug: schoolId, regId: schoolId, city: "Test", contactEmail: `${schoolId}@example.invalid`, status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: "Capture campus", regId: campusId, city: "Test" } });
  const actor = (role: AuthUser["role"]): AuthUser => ({ userId: randomUUID(), schoolId, campusId, role, email: `${randomUUID()}@example.invalid`, accessVersion: 0 });
  const admin = actor("ADMIN"), learner = actor("STUDENT"), other = actor("STUDENT"), teacher = actor("TEACHER");
  for (const user of [admin, learner, other, teacher]) await db.user.create({ data: { id: user.userId, schoolId, campusId, email: user.email, role: user.role, fullName: `Synthetic ${user.role}`, onboardingComplete: true, mfaEnabled: true } });
  await db.class.create({ data: { id: classId, schoolId, campusId, name: "Capture Grade", academicYear: 2026 } });
  await db.subject.create({ data: { id: subjectId, schoolId, campusId, classId, name: "Capture mathematics", teacherId: teacher.userId } });
  const students: Array<{ id: string }> = [];
  for (const [index, user] of [learner, other].entries()) students.push(await db.student.create({ data: { schoolId, campusId, classId, studentUserId: user.userId, fullName: `Capture learner ${index + 1}`, rollNo: String(index + 1), gender: "OTHER", status: "active" } }));
  const data = assessmentFixture(subjectId, classId);
  let curriculum = await createWorkspaceRecord(admin, { kind: "CURRICULUM", title: "Capture curriculum", campusId, idempotencyKey: randomUUID(), data: data.curriculum }); curriculum = await updateWorkspaceRecord(admin, curriculum.id, { version: curriculum.version, action: "approve" });
  let paper = await createWorkspaceRecord(admin, { kind: "PAPER", title: "Capture paper", campusId, idempotencyKey: randomUUID(), data: { ...data.paper, curriculumId: curriculum.id, curriculumVersion: curriculum.version } }); paper = await updateWorkspaceRecord(admin, paper.id, { version: paper.version, action: "approve" });
  const assignment = await proctorContext(admin, () => createSchoolAiExam(admin, { idempotencyKey: randomUUID(), paperId: paper.id, title: "Optional capture exam", startsAt: new Date(Date.now() - 60000).toISOString(), endsAt: new Date(Date.now() + 3600000).toISOString(), studentIds: students.map(student => student.id), mode: "STANDARD" }));
  if (options.enabled !== false) await proctorContext(admin, async () => updateExamProctorPolicy(admin, assignment.id, { version: (await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).version, policy: { enabled: true, camera: true, screen: true, retentionDays: 1 } }));
  // No implicit telemetry opt-in. Only tests explicitly asking for synthetic
  // observations approve a finite policy before an attempt is created.
  if (options.integrityDays !== undefined) await proctorContext(admin, async () => updateExamIntegrityPolicy(admin, assignment.id, { version: (await db.schoolAiExamAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).version, policy: { enabled: true, retentionDays: options.integrityDays, policyReference: "Synthetic test retention policy — not a deployment policy" } }));
  const attempt = options.start === false ? null : await proctorContext(learner, () => startSchoolAiExam(learner, assignment.id));
  return { schoolId, campusId, classId, subjectId, admin, learner, other, teacher, students, assignment, attempt };
  } catch (error) { await removeProctorFixture(db, schoolId); throw error; }
}
export type ProctorFixture = Awaited<ReturnType<typeof examProctorFixture>>;
export async function removeProctorFixture(db: PrismaClient, schoolId: string) { await db.schoolAiProctorClip.deleteMany({ where: { schoolId } }); await db.schoolAiProctorSession.deleteMany({ where: { schoolId } }); await db.school.deleteMany({ where: { id: schoolId } }); }
