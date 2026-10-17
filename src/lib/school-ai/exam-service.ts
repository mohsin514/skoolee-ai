import { Prisma } from "@prisma/client";
import { sealRelease } from "./exam-release-service";
import { contentHashPrefix } from "./release";
import { DELIVERED_EXAM_MODES } from "./exam";
import { approvedProfileFor, assertSecureAdmission, secureAdmission, supervisedAlternatives } from "./secure-browser-service";
import { effectiveSettings } from "@/lib/accommodations/plan";
import { activePlanFor } from "@/lib/accommodations/service";
import { createHash } from "node:crypto";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { writeAuditEvent } from "@/lib/audit-events";
import { ApiError } from "@/lib/api/scope";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot, assertSchoolAiAccess, assertWorkspaceSubject, getAssignedWorkspaceSubjects, isSchoolAiManager } from "./access";
import { candidatePaper, paperDataSchema, type PaperData } from "./assessment";
import { approveExamAccommodationSchema, examAccommodationsSchema, attemptDeadline, assertSupportedExamMode, examAssignmentSchema, examReviewSchema, examSaveDecision, responsesSchema, saveExamSchema, scoreObjectiveResponses, validateExamReview, validateExamWindow, validateResponses } from "./exam";
import { schoolAiTransaction, retryDatabaseTransaction } from "./transaction";
import { PROCTOR_CONSENT_VERSION, proctorPolicy } from "./exam-proctor";
import { sourceStorageAvailable } from "./source-storage";
import { examIntegrityDisclosure } from "./exam-integrity";

const json = (value: unknown) => value as Prisma.InputJsonValue;
const selection = { id: true, title: true, startsAt: true, endsAt: true, paperVersion: true, mode: true, status: true, classId: true, campusId: true } as const;
const stableResponses = (value: Record<string, string>) => JSON.stringify(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));

async function studentFor(user: AuthUser, db: TxClient = prisma) {
  if (user.role !== "STUDENT" || !user.campusId) throw new ApiError("This exam entry is for an assigned student account.", 403);
  const student = await db.student.findFirst({ where: { schoolId: user.schoolId, campusId: user.campusId, studentUserId: user.userId, archivedAt: null, status: "active" }, select: { id: true, classId: true, campusId: true } });
  if (!student) throw new ApiError("An active student record is required.", 403);
  return student;
}

export async function staffExamAccess(user: AuthUser, assignment: { createdById: string; campusId: string; paperSnapshot: unknown }, action: "view" | "add" | "edit" = "view", db: TxClient = prisma) {
  const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: user.role, campusId: user.campusId, isActive: true }, select: { id: true, accessVersion: true } });
  if (!actor || (user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion)) throw new ApiError("Your exam access changed. Sign in again before continuing.", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, db);
  await assertSchoolAiAccess(user, action, permissions);
  await assertWorkspacePermission(user, "exams", action, permissions);
  if (!isSchoolAiManager(user) && user.role !== "TEACHER") throw new ApiError("Exam access is restricted to authorized teaching staff.", 403);
  if (user.role !== "SUPER_ADMIN" && assignment.campusId !== user.campusId) throw new ApiError("Exam unavailable.", 404);
  if (user.role === "TEACHER" && assignment.createdById !== user.userId) throw new ApiError("Exam unavailable.", 404);
  const paper = paperDataSchema.parse(assignment.paperSnapshot);
  await assertWorkspaceSubject(user, assignment.campusId, paper, db);
  return paper;
}

export async function scopedAssignment(user: AuthUser, id: string, db: TxClient = prisma) {
  const assignment = await db.schoolAiExamAssignment.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}) } });
  if (!assignment) throw new ApiError("Exam unavailable.", 404);
  if (!DELIVERED_EXAM_MODES.includes(assignment.mode)) throw new ApiError("This exam mode has not been configured for delivery.", 409);
  if (user.role === "STUDENT") {
    const student = await studentFor(user, db);
    if (assignment.status !== "ACTIVE" || assignment.classId !== student.classId || !Array.isArray(assignment.studentIds) || !assignment.studentIds.includes(student.id)) throw new ApiError("Exam unavailable.", 404);
    return { assignment, paper: paperDataSchema.parse(assignment.paperSnapshot), student };
  }
  const paper = await staffExamAccess(user, assignment, "view", db);
  return { assignment, paper, student: null };
}

export async function listSchoolAiExams(user: AuthUser) {
  if (user.role === "STUDENT") {
    const student = await studentFor(user);
    return prisma.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, campusId: student.campusId, classId: student.classId, studentIds: { array_contains: [student.id] }, status: "ACTIVE", mode: { in: DELIVERED_EXAM_MODES } }, select: { ...selection, attempts: { where: { userId: user.userId, schoolId: user.schoolId }, select: { id: true, status: true, submittedAt: true } } }, orderBy: { startsAt: "desc" }, take: 100 });
  }
  await assertSchoolAiAccess(user, "view"); await assertWorkspacePermission(user, "exams", "view");
  if (!isSchoolAiManager(user) && user.role !== "TEACHER") throw new ApiError("Exam access is restricted to teaching staff.", 403);
  const subjects = user.role === "TEACHER" ? await getAssignedWorkspaceSubjects(user) : [];
  return prisma.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, ...(user.role !== "SUPER_ADMIN" ? { campusId: user.campusId ?? "" } : {}), ...(user.role === "TEACHER" ? { createdById: user.userId, paper: { subjectId: { in: subjects.map((subject) => subject.id) } } } : {}) }, select: { ...selection, _count: { select: { attempts: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
}

export async function examRoster(user: AuthUser, paperId: string) {
  await assertSchoolAiAccess(user, "view"); await assertWorkspacePermission(user, "exams", "view");
  const { getWorkspaceRecord } = await import("./repository");
  const record = await getWorkspaceRecord(user, paperId);
  if (record.kind !== "PAPER" || record.status !== "APPROVED" || !record.campusId) throw new ApiError("Choose an approved paper.", 409);
  const paper = paperDataSchema.parse(record.data);
  await assertWorkspaceSubject(user, record.campusId, paper);
  return prisma.student.findMany({ where: { schoolId: user.schoolId, campusId: record.campusId, classId: paper.classId, archivedAt: null, status: "active", studentUserId: { not: null } }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" }, take: 500 });
}

export async function createSchoolAiExam(user: AuthUser, raw: unknown, now?: Date) {
  await assertSchoolAiAccess(user, "add"); await assertWorkspacePermission(user, "exams", "add");
  if (!isSchoolAiManager(user) && user.role !== "TEACHER") throw new ApiError("Only authorized teaching staff can assign papers.", 403);
  const input = examAssignmentSchema.parse(raw);
  try { assertSupportedExamMode(input.mode); } catch (error) { throw new ApiError((error as Error).message, 409); }
  const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
  const windowError = validateExamWindow(startsAt, endsAt, now ?? new Date());
  if (windowError) throw new ApiError(windowError);
  if (new Set(input.studentIds).size !== input.studentIds.length) throw new ApiError("Choose each student once.");
  const { getWorkspaceRecord } = await import("./repository");
  const record = await getWorkspaceRecord(user, input.paperId);
  if (record.kind !== "PAPER" || record.status !== "APPROVED" || !record.campusId) throw new ApiError("Only an approved campus paper can be assigned.", 409);
  const paper = paperDataSchema.parse(record.data);
  await assertWorkspaceSubject(user, record.campusId, paper);
  const count = await prisma.student.count({ where: { id: { in: input.studentIds }, schoolId: user.schoolId, campusId: record.campusId, classId: paper.classId, archivedAt: null, status: "active", studentUserId: { not: null } } });
  if (count !== input.studentIds.length) throw new ApiError("Every selected student must have an active account in this paper's class.", 403);
  // A conditional read within the transaction rejects approval changes during assignment.
  return retryDatabaseTransaction(() => prisma.$transaction(async (tx) => {
    const permissions = await loadWorkspacePermissionSnapshot(user, tx);
    await assertSchoolAiAccess(user, "add", permissions);
    await assertWorkspacePermission(user, "exams", "add", permissions);
    await assertWorkspaceSubject(user, record.campusId!, paper, tx);
    const assignmentId = createHash("sha256").update(`${user.schoolId}:${user.userId}:${input.idempotencyKey}`).digest("hex");
    const existing = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, createdById: user.userId } });
    if (existing) {
      if (existing.paperId !== record.id || existing.title !== input.title || existing.startsAt.getTime() !== startsAt.getTime() || existing.endsAt.getTime() !== endsAt.getTime() || JSON.stringify(existing.studentIds) !== JSON.stringify(input.studentIds)) throw new ApiError("This assignment request was already used with different details.", 409);
      return { id: existing.id, title: existing.title, startsAt: existing.startsAt, endsAt: existing.endsAt, paperVersion: existing.paperVersion, mode: existing.mode, status: existing.status, classId: existing.classId, campusId: existing.campusId };
    }
    const current = await tx.schoolAiRecord.findFirst({ where: { id: record.id, schoolId: user.schoolId, version: record.version, status: "APPROVED" }, select: { id: true } });
    if (!current) throw new ApiError("The approved paper changed. Refresh before assigning it.", 409);
    const currentCount = await tx.student.count({ where: { id: { in: input.studentIds }, schoolId: user.schoolId, campusId: record.campusId!, classId: paper.classId, archivedAt: null, status: "active", studentUserId: { not: null } } });
    if (currentCount !== input.studentIds.length) throw new ApiError("Every selected student must have an active account in this paper's class.", 403);
    const currentWindowError = validateExamWindow(startsAt, endsAt, now ?? new Date());
    if (currentWindowError) throw new ApiError(currentWindowError);
    // SKO-449: a secure exam pins the approved profile version it is delivered with.
    if (input.mode !== "SECURE_BROWSER" && input.secureProfileId) throw new ApiError("A secure browser profile applies only to Safe Exam Browser exams.", 400);
    const secureProfile = input.mode === "SECURE_BROWSER" ? await approvedProfileFor(tx, user, record.campusId!, input.secureProfileId ?? "") : null;
    // SKO-408: the sealed release — workbench papers must pass every release precondition; the hash is recorded either way.
    const stored = await tx.schoolAiRecord.findFirstOrThrow({ where: { id: record.id, schoolId: user.schoolId }, select: { createdById: true } });
    const seal = await sealRelease(tx, user, { id: record.id, version: record.version, createdById: stored.createdById, campusId: record.campusId }, paper);
    const created = await tx.schoolAiExamAssignment.create({ data: { contentHash: seal.contentHash, rehearsalId: seal.rehearsalId, ...(secureProfile ? { secureProfileId: secureProfile.id, secureProfileVersion: secureProfile.version } : {}), id: assignmentId, schoolId: user.schoolId, campusId: record.campusId!, classId: paper.classId, paperId: record.id, paperVersion: record.version, paperSnapshot: json(paper), createdById: user.userId, title: input.title, startsAt, endsAt, studentIds: input.studentIds, mode: input.mode, status: "ACTIVE" }, select: selection });
    await writeAuditEvent(tx, user, { table: "school_ai_exam_assignments", recordId: created.id, action: "CREATE", campusId: created.campusId, after: { paperId: record.id, paperVersion: created.paperVersion, classId: created.classId, status: created.status, mode: created.mode, students: input.studentIds.length, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
}

export async function getSchoolAiExam(user: AuthUser, id: string) {
  const { assignment, paper, student } = await scopedAssignment(user, id);
  const examApproval = student ? examAccommodationsSchema.parse(assignment.accommodations)[student.id] : undefined;
  const effective = effectiveSettings({ baseMinutes: paper.blueprint.durationMinutes, type: "EXAM", at: new Date(), examApproval: examApproval ?? null, plan: student && !examApproval ? await activePlanFor(prisma, user.schoolId, student.id) : null });
  const accommodation = { ...effective.capabilities, extraMinutes: effective.extraMinutes, breakMinutes: effective.breakMinutes };
  const extraMinutes = effective.extraMinutes, breakMinutes = effective.breakMinutes;
  const recording = proctorPolicy(assignment.proctorPolicy);
  const secureBrowser = student ? await secureAdmission(prisma, assignment, student.id) : { required: assignment.mode === "SECURE_BROWSER" };
  return { secureBrowser, paperVersion: assignment.paperVersion, contentHashPrefix: assignment.contentHash ? contentHashPrefix(assignment.contentHash) : null, version: assignment.version, integrityPolicy: examIntegrityDisclosure(assignment.proctorPolicy), cameraRequired: recording.requireCamera && !accommodation?.cameraExempt, cameraRetentionDays: recording.retentionDays, baseDurationMinutes: paper.blueprint.durationMinutes, extraMinutes, breakMinutes, assistance: { reader: accommodation?.reader ?? false, scribe: accommodation?.scribe ?? false, largeText: accommodation?.largeText ?? false, cameraExempt: accommodation?.cameraExempt ?? false }, id: assignment.id, title: assignment.title, startsAt: assignment.startsAt, endsAt: assignment.endsAt, mode: assignment.mode, durationMinutes: paper.blueprint.durationMinutes + extraMinutes + breakMinutes, totalMarks: paper.blueprint.totalMarks, status: assignment.status, role: user.role, serverNow: new Date().toISOString() };
}

function receipt(attempt: { id: string; status: string; startedAt: Date; deadlineAt: Date; sequence: number; responses: unknown; submittedAt: Date | null; pausedAt?: Date | null }, paper: PaperData, now: Date) {
  return { id: attempt.id, status: attempt.status, pausedAt: attempt.pausedAt ?? null, startedAt: attempt.startedAt, deadlineAt: attempt.deadlineAt, sequence: attempt.sequence, responses: responsesSchema.parse(attempt.responses), submittedAt: attempt.submittedAt, serverNow: now.toISOString(), paper: candidatePaper(paper) };
}

/** Both approval and start lock the assignment row, so an approval cannot overtake a start. */
export async function startSchoolAiExam(user: AuthUser, id: string, now?: Date, expectedVersion?: number, readiness?: { cameraReady?: boolean; consentVersion?: string }) {
  const { assignment, paper, student } = await scopedAssignment(user, id);
  if (!student) throw new ApiError("Only assigned students can start an attempt.", 403);
  try {
    const attempt = await retryDatabaseTransaction(() => prisma.$transaction(async (tx) => {
      // All starts for this account serialize, including different assignments.
      // A per-assignment lock alone allows two simultaneous active exams.
      const account = await tx.user.updateMany({ where: { id: user.userId, schoolId: user.schoolId, campusId: student.campusId, role: "STUDENT", isActive: true, ...(user.accessVersion === undefined ? {} : { accessVersion: user.accessVersion }) }, data: { accessVersion: { increment: 0 } } });
      if (account.count !== 1) throw new ApiError("Your exam access changed. Sign in again.", 403);
      const activeElsewhere = await tx.schoolAiExamAttempt.findFirst({ where: { schoolId: user.schoolId, userId: user.userId, studentId: student.id, campusId: student.campusId, assignmentId: { not: id }, status: "IN_PROGRESS", deadlineAt: { gt: now ?? new Date() }, assignment: { status: "ACTIVE", mode: { in: DELIVERED_EXAM_MODES }, classId: student.classId, studentIds: { array_contains: [student.id] } } }, select: { id: true } });
      if (activeElsewhere) throw new ApiError("Finish your active exam before starting another one.", 409);
      const locked = await tx.schoolAiExamAssignment.updateMany({ where: { id, schoolId: user.schoolId, campusId: student.campusId, version: assignment.version, status: "ACTIVE", mode: { in: DELIVERED_EXAM_MODES } }, data: { version: { increment: 0 } } });
      if (locked.count !== 1) throw new ApiError("The exam changed. Check readiness again before starting.", 409);
      const existing = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId: id, userId: user.userId, schoolId: user.schoolId, campusId: student.campusId } });
      if (existing) return existing;
      if (expectedVersion !== undefined && expectedVersion !== assignment.version) throw new ApiError("The exam changed. Check readiness again before starting.", 409);
      const currentStudent = await tx.student.findFirst({ where: { id: student.id, studentUserId: user.userId, schoolId: user.schoolId, campusId: student.campusId, classId: assignment.classId, archivedAt: null, status: "active" }, select: { id: true } });
      if (!currentStudent) throw new ApiError("Exam unavailable.", 404);
      // SKO-449: before any timer or paper, a secure exam requires a verified SEB request or a recorded supervised alternative.
      await assertSecureAdmission(tx, assignment, student.id);
      // Sample production time after the lock/read on every rolled-back retry.
      // An explicit clock remains fixed for deterministic service tests.
      const currentTime = now ?? new Date();
      if (currentTime < assignment.startsAt || currentTime >= assignment.endsAt) throw new ApiError("The exam is outside its availability window.", 409);
      const accommodation = examAccommodationsSchema.parse(assignment.accommodations)[student.id];
      // SKO-410: an exam-specific approval wins; otherwise the learner's active plan covering this exam applies.
      const effective = effectiveSettings({ baseMinutes: paper.blueprint.durationMinutes, type: "EXAM", at: currentTime, examApproval: accommodation ?? null, plan: accommodation ? null : await activePlanFor(tx, user.schoolId, student.id) });
      const recording = proctorPolicy(assignment.proctorPolicy);
      if (recording.requireCamera && !effective.capabilities.cameraExempt) {
        if (!sourceStorageAvailable()) throw new ApiError("Required camera recording is unavailable. Ask staff for an approved alternative before starting.", 503);
        // This is a browser report and explicit consent, not device attestation.
        if (readiness?.cameraReady !== true || readiness.consentVersion !== PROCTOR_CONSENT_VERSION) throw new ApiError("Complete the camera check and recording notice before starting, or ask staff for an approved exception.", 422);
      }
      // The effective settings are bound to the attempt: later plan expiry or revocation never changes a started attempt.
      const started = await tx.schoolAiExamAttempt.create({ data: { schoolId: user.schoolId, campusId: student.campusId, assignmentId: id, studentId: student.id, userId: user.userId, startedAt: currentTime, deadlineAt: attemptDeadline(currentTime, assignment.endsAt, effective.totalMinutes), accommodationSnapshot: json({ ...effective, instructions: undefined }), sequence: 0, responses: {}, status: "IN_PROGRESS" } });
      await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: started.id, action: "CREATE", campusId: started.campusId, after: { assignmentId: id, studentId: student.id, status: started.status, assignmentVersion: assignment.version, deadlineAt: started.deadlineAt.toISOString() } });
      return started;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    const responseTime = now ?? new Date();
    if (attempt.status === "IN_PROGRESS" && !attempt.pausedAt && responseTime >= attempt.deadlineAt) return getSchoolAiAttempt(user, id, responseTime);
    return receipt(attempt, paper, responseTime);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ApiError("The exam changed while starting. Check readiness and retry; an existing attempt will resume.", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return getSchoolAiAttempt(user, id, now);
    throw error;
  }
}

async function canApproveAccommodation(user: AuthUser) {
  if (!isSchoolAiManager(user)) return false;
  const grants = await loadWorkspacePermissionSnapshot(user);
  return user.role === "SUPER_ADMIN" || !!(grants.get("exams")?.canEdit && grants.get("ai")?.canEdit);
}

export async function getSchoolAiAccommodations(user: AuthUser, id: string) {
  const { assignment, paper } = await scopedAssignment(user, id);
  await staffExamAccess(user, assignment);
  const canApprove = await canApproveAccommodation(user);
  const accommodations = examAccommodationsSchema.parse(assignment.accommodations);
  const studentIds = Array.isArray(assignment.studentIds) ? assignment.studentIds.filter((value): value is string => typeof value === "string") : [];
  const [students, attempts, plans, alternatives, live] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds }, schoolId: user.schoolId, campusId: assignment.campusId, classId: assignment.classId, archivedAt: null, status: "active" }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } }),
    prisma.schoolAiExamAttempt.findMany({ where: { assignmentId: id, schoolId: user.schoolId, campusId: assignment.campusId }, select: { studentId: true, deadlineAt: true, status: true } }),
    prisma.accommodationPlan.findMany({ where: { schoolId: user.schoolId, status: "ACTIVE", studentId: { in: studentIds } } }),
    supervisedAlternatives(prisma, user.schoolId, id).then(rows => rows),
    prisma.accommodationLiveAdjustment.findMany({ where: { schoolId: user.schoolId, assignmentId: id }, orderBy: { createdAt: "asc" }, select: { studentId: true, addedMinutes: true, reason: true, oldDeadline: true, newDeadline: true, createdAt: true } }),
  ]);
  return { mode: assignment.mode, version: assignment.version, canApprove: canApprove && assignment.status === "ACTIVE" && assignment.endsAt > new Date(), baseDurationMinutes: paper.blueprint.durationMinutes, endsAt: assignment.endsAt, students: students.map((student) => {
    const exam = accommodations[student.id];
    // Invigilators see the operational result and its source, never supporting records.
    const effective = effectiveSettings({ baseMinutes: paper.blueprint.durationMinutes, type: "EXAM", at: assignment.startsAt, examApproval: exam ?? null, plan: exam ? null : plans.find(plan => plan.studentId === student.id) ?? null });
    const approved = exam ?? (effective.source === "PLAN" ? { ...effective.capabilities, extraMinutes: effective.extraMinutes, breakMinutes: effective.breakMinutes, reason: undefined, approvedAt: undefined } : undefined);
    return { ...student, supervisedAlternative: alternatives.find(row => row.studentId === student.id) ?? null, source: effective.source, planVersion: effective.planVersion, instructions: effective.instructions, totalMinutes: effective.totalMinutes, liveAdjustments: live.filter(row => row.studentId === student.id), extraMinutes: approved?.extraMinutes ?? 0, breakMinutes: approved?.breakMinutes ?? 0, reader: approved?.reader ?? false, scribe: approved?.scribe ?? false, largeText: approved?.largeText ?? false, cameraExempt: approved?.cameraExempt ?? false, ...(canApprove && approved ? { reason: approved.reason, approvedAt: approved.approvedAt } : {}), attempt: attempts.find((attempt) => attempt.studentId === student.id) ?? null };
  }) };
}

export async function approveSchoolAiAccommodation(user: AuthUser, id: string, raw: unknown, now?: Date) {
  const { assignment } = await scopedAssignment(user, id);
  await staffExamAccess(user, assignment, "edit");
  if (!await canApproveAccommodation(user)) throw new ApiError("Only an authorized school manager can approve extra time.", 403);
  const input = approveExamAccommodationSchema.parse(raw);
  try {
    return await retryDatabaseTransaction(() => prisma.$transaction(async (tx) => {
      await staffExamAccess(user, assignment, "edit", tx);
      // A write lock serializes this operation with attempt creation. The version also prevents lost staff edits.
      const locked = await tx.schoolAiExamAssignment.updateMany({ where: { id, schoolId: user.schoolId, campusId: assignment.campusId, version: input.version, status: "ACTIVE", mode: { in: DELIVERED_EXAM_MODES }, endsAt: { gt: now ?? new Date() } }, data: { version: { increment: 0 } } });
      if (locked.count !== 1) throw new ApiError("The exam changed or closed. Refresh before approving extra time.", 409);
      const current = await tx.schoolAiExamAssignment.findFirstOrThrow({ where: { id, schoolId: user.schoolId, campusId: assignment.campusId } });
      if (!Array.isArray(current.studentIds) || !current.studentIds.includes(input.studentId)) throw new ApiError("This student is not assigned to the exam.", 404);
      const student = await tx.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: current.campusId, classId: current.classId, archivedAt: null, status: "active", studentUserId: { not: null } }, select: { id: true } });
      if (!student) throw new ApiError("An active assigned student account is required.", 404);
      if (await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId: id, studentId: input.studentId, schoolId: user.schoolId }, select: { id: true } })) throw new ApiError("Extra time cannot change after the student starts. The existing deadline is preserved.", 409);
      const accommodations = examAccommodationsSchema.parse(current.accommodations);
      const currentTime = now ?? new Date();
      if (current.endsAt <= currentTime) throw new ApiError("The exam changed or closed. Refresh before approving extra time.", 409);
      const approved = { extraMinutes: input.extraMinutes, breakMinutes: input.breakMinutes ?? 0, reader: input.reader ?? false, scribe: input.scribe ?? false, largeText: input.largeText ?? false, cameraExempt: input.cameraExempt ?? false, reason: input.reason, approvedById: user.userId, approvedAt: currentTime.toISOString() };
      const updated = examAccommodationsSchema.parse({ ...accommodations, [input.studentId]: approved });
      await tx.schoolAiExamAssignment.updateMany({ where: { id, schoolId: user.schoolId, version: input.version }, data: { accommodations: json(updated), version: { increment: 1 } } });
      // The free-text reason stays in the assignment record only.
      const prior = accommodations[input.studentId];
      await writeAuditEvent(tx, user, { table: "school_ai_exam_assignments", recordId: id, action: "APPROVE", campusId: current.campusId,
        before: { version: input.version, studentId: input.studentId, extraMinutes: prior?.extraMinutes ?? 0, breakMinutes: prior?.breakMinutes ?? 0, cameraExempt: prior?.cameraExempt ?? false },
        after: { version: input.version + 1, studentId: input.studentId, extraMinutes: approved.extraMinutes, breakMinutes: approved.breakMinutes, reader: approved.reader, scribe: approved.scribe, largeText: approved.largeText, cameraExempt: approved.cameraExempt } });
      return { version: input.version + 1, studentId: input.studentId, ...approved };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ApiError("The exam changed during approval. Refresh before trying again.", 409);
    throw error;
  }
}

export async function getSchoolAiAttempt(user: AuthUser, id: string, now = new Date()) {
  const { assignment, paper, student } = await scopedAssignment(user, id);
  if (!student) throw new ApiError("Only students can read this attempt endpoint.", 403);
  let attempt = await prisma.schoolAiExamAttempt.findFirst({ where: { assignmentId: id, userId: user.userId, schoolId: user.schoolId, campusId: student.campusId } });
  if (!attempt) return null;
  if (attempt.status === "IN_PROGRESS" && now < attempt.deadlineAt) await assertSecureAdmission(prisma, assignment, student.id);
  // SKO-408 R15.4: a paused attempt's clock is stopped, so it is never closed at the deadline while paused.
  if (attempt.status === "IN_PROGRESS" && !attempt.pausedAt && now >= attempt.deadlineAt) {
    await prisma.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", pausedAt: null, sequence: attempt.sequence }, data: { status: "SUBMITTED", submittedAt: now, scoreProposal: json(scoreObjectiveResponses(paper, responsesSchema.parse(attempt.responses))) } });
    attempt = await prisma.schoolAiExamAttempt.findFirstOrThrow({ where: { id: attempt.id, schoolId: user.schoolId, userId: user.userId } });
  }
  return receipt(attempt, paper, now);
}

export async function saveSchoolAiAttempt(user: AuthUser, id: string, raw: unknown, now?: Date) {
  const input = saveExamSchema.parse(raw);
  return retryDatabaseTransaction(() => prisma.$transaction(async (tx) => {
    const { assignment, paper, student } = await scopedAssignment(user, id, tx);
    if (!student) throw new ApiError("Only assigned students can save responses.", 403);
    await assertSecureAdmission(tx, assignment, student.id);
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { assignmentId: id, userId: user.userId, schoolId: user.schoolId, campusId: student.campusId } });
    if (!attempt) throw new ApiError("Start the exam before saving responses.", 409);
    if (attempt.status === "IN_PROGRESS" && attempt.pausedAt) throw new ApiError("Your exam is paused by the invigilator. Your answers are safe; wait for the exam to resume.", 423);
    const currentTime = now ?? new Date();
    const decision = examSaveDecision({ status: attempt.status, sequence: input.sequence, currentSequence: attempt.sequence, deadlineAt: attempt.deadlineAt, now: currentTime, submit: !!input.submit });
    if (decision === "FINISHED") return { ...receipt(attempt, paper, currentTime), accepted: false };
    if (decision === "STALE") throw new ApiError("A newer answer version is already saved. Reload the saved attempt before editing.", 409);
    if (decision === "REPLAY") {
      if (stableResponses(input.responses) !== stableResponses(responsesSchema.parse(attempt.responses))) throw new ApiError("This answer version already contains different responses.", 409);
      if (input.submit) throw new ApiError("Final submission must use a new answer version.", 409);
      return { ...receipt(attempt, paper, currentTime), accepted: true };
    }
    const expired = decision === "EXPIRED";
    const responses = expired ? responsesSchema.parse(attempt.responses) : input.responses;
    const errors = validateResponses(paper, responses);
    if (errors.length) throw new ApiError(errors.join(" "));
    const submit = expired || input.submit;
    const changed = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, userId: user.userId, status: "IN_PROGRESS", pausedAt: null, sequence: attempt.sequence }, data: { responses: json(responses), sequence: expired ? attempt.sequence : input.sequence, ...(submit ? { status: "SUBMITTED", submittedAt: currentTime, scoreProposal: json(scoreObjectiveResponses(paper, responses)) } : {}) } });
    if (changed.count !== 1) throw new ApiError("Another answer version was saved first. Reload the saved attempt.", 409);
    // Autosaves are draft answers; the event marks the final hand-in (or deadline close).
    if (submit) await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "UPDATE", campusId: student.campusId, before: { status: attempt.status, sequence: attempt.sequence }, after: { status: "SUBMITTED", sequence: expired ? attempt.sequence : input.sequence, deadlineExpired: expired } });
    const saved = await tx.schoolAiExamAttempt.findFirstOrThrow({ where: { id: attempt.id, schoolId: user.schoolId, userId: user.userId } });
    return { ...receipt(saved, paper, currentTime), accepted: !expired };
  }));
}

export async function listSchoolAiAttempts(user: AuthUser, id: string, now = new Date()) {
  const { assignment, paper } = await scopedAssignment(user, id);
  await staffExamAccess(user, assignment);
  const attempts = await prisma.schoolAiExamAttempt.findMany({ where: { assignmentId: id, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { startedAt: "asc" }, take: 500 });
  // Finalize only persisted answers when a staff member opens the marking desk.
  for (const attempt of attempts) if (attempt.status === "IN_PROGRESS" && !attempt.pausedAt && now >= attempt.deadlineAt) {
    await prisma.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", sequence: attempt.sequence }, data: { status: "SUBMITTED", submittedAt: now, scoreProposal: json(scoreObjectiveResponses(paper, responsesSchema.parse(attempt.responses))) } });
  }
  const results = await prisma.schoolAiExamAttempt.findMany({ where: { assignmentId: id, schoolId: user.schoolId, campusId: assignment.campusId }, orderBy: { startedAt: "asc" }, take: 500 });
  const names = await prisma.student.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, id: { in: results.map((attempt) => attempt.studentId) } }, select: { id: true, fullName: true, rollNo: true } });
  return { paper, attempts: results.map(({ userId: _userId, reviewedById: _reviewer, ...attempt }) => ({ ...attempt, student: names.find((student) => student.id === attempt.studentId) ?? null })) };
}

export async function reviewSchoolAiAttempt(user: AuthUser, assignmentId: string, attemptId: string, raw: unknown, now = new Date()) {
  const review = examReviewSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    const { assignment, paper } = await scopedAssignment(user, assignmentId, tx);
    await staffExamAccess(user, assignment, "edit", tx);
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { id: attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId } });
    if (!attempt || attempt.status !== "SUBMITTED") throw new ApiError("Only a submitted, unreviewed attempt can be moderated.", 409);
    const errors = validateExamReview(paper, responsesSchema.parse(attempt.responses), review);
    if (errors.length) throw new ApiError(errors.join(" "));
    const saved = { ...review, total: review.marks.reduce((sum, mark) => sum + mark.marks, 0) };
    const changed = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "SUBMITTED", sequence: attempt.sequence, reviewVersion: 0 }, data: { status: "REVIEWED", reviewedAt: now, reviewedById: user.userId, reviewVersion: 1, review: json(saved) } });
    if (changed.count !== 1) throw new ApiError("This attempt was already reviewed. Refresh the marking desk.", 409);
    await tx.schoolAiExamResultRevision.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId, version: 1, review: json(saved), reason: review.note, createdById: user.userId, createdAt: now } });
    await writeAuditEvent(tx, user, { table: "school_ai_exam_attempts", recordId: attempt.id, action: "APPROVE", campusId: assignment.campusId, before: { status: attempt.status, reviewVersion: 0 }, after: { status: "REVIEWED", reviewVersion: 1, total: saved.total } });
    return { id: attempt.id, status: "REVIEWED", reviewedAt: now, reviewVersion: 1, note: "Moderation is saved. Existing gradebook and report publication are unchanged." };
  });
}
