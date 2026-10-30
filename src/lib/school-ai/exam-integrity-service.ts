import { activeHoldWhere } from "@/lib/data-lifecycle/service";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { scopedAssignment, staffExamAccess } from "./exam-service";
import { schoolAiTransaction } from "./transaction";
import { isSchoolAiManager } from "./access";
import { proctorPolicy } from "./exam-proctor";
import { tenantTransaction } from "@/lib/db/prisma";
import { runWithTenantContext } from "@/lib/db/tenant-context";
import { INTEGRITY_EVENT_LIMIT, INTEGRITY_NOTICE_VERSION, INTEGRITY_UNCERTAINTY, examIntegrityPolicy, integrityRetentionUntil, integrityPolicyUpdateSchema, integrityDetailsSchema, integrityEventSchema, integrityReviewSchema, type ExamIntegrityView, type IntegrityEventKind } from "./exam-integrity";

export async function updateExamIntegrityPolicy(user: AuthUser, assignmentId: string, value: unknown) {
  const input = integrityPolicyUpdateSchema.parse(value);
  if (!isSchoolAiManager(user)) throw new ApiError("Only an authorized school administrator can approve observation collection.", 403);
  return schoolAiTransaction(user, async db => {
    const { assignment } = await scopedAssignment(user, assignmentId, db);
    await staffExamAccess(user, assignment, "edit", db);
    if (await db.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId } })) throw new ApiError("Observation policy is fixed after the first attempt starts. Create a new assignment for a different policy.", 409);
    const policy = input.policy.enabled ? { ...input.policy, approvedById: user.userId, approvedAt: new Date().toISOString(), noticeVersion: INTEGRITY_NOTICE_VERSION } : input.policy;
    const changed = await db.schoolAiExamAssignment.updateMany({ where: { id: assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, version: input.version }, data: { proctorPolicy: { ...proctorPolicy(assignment.proctorPolicy), integrity: policy }, version: { increment: 1 } } });
    if (!changed.count) throw new ApiError("Exam settings changed. Refresh before saving the policy.", 409);
    return { policy, version: input.version + 1 };
  });
}

export async function recordExamIntegrityEvent(user: AuthUser, assignmentId: string, value: unknown, now?: Date) {
  const input = integrityEventSchema.parse(value);
  if (user.role !== "STUDENT") throw new ApiError("Only the candidate can report browser observations.", 403);
  return schoolAiTransaction(user, async db => {
    const { assignment, student } = await scopedAssignment(user, assignmentId, db);
    const policy = examIntegrityPolicy(assignment.proctorPolicy);
    if (!policy.enabled) throw new ApiError("Observation collection is not enabled for this exam. Answer saving and submission remain available.", 403);
    const actor = await db.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, role: "STUDENT", campusId: assignment.campusId, isActive: true, ...(user.accessVersion === undefined ? {} : { accessVersion: user.accessVersion }) }, select: { id: true } });
    if (!actor || !student) throw new ApiError("Exam access changed.", 403);
    // Serialize against submission and other observations without writing an
    // answer timestamp or revision. Read attempt state only after this lock.
    const locked = await db.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "school_ai_exam_attempts" WHERE "id" = ${input.attemptId} AND "assignment_id" = ${assignmentId} AND "school_id" = ${user.schoolId} AND "campus_id" = ${assignment.campusId} AND "user_id" = ${user.userId} AND "student_id" = ${student.id} FOR UPDATE`;
    if (!locked.length) throw new ApiError("Attempt unavailable.", 404);
    const attempt = await db.schoolAiExamAttempt.findFirst({ where: { id: input.attemptId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, userId: user.userId, studentId: student.id } });
    if (!attempt) throw new ApiError("Attempt unavailable.", 404);
    const receivedAt = now ?? new Date();
    const previous = await db.schoolAiExamIntegrityEvent.findFirst({ where: { attemptId: attempt.id, clientEventId: input.clientEventId, schoolId: user.schoolId } });
    if (previous) {
      if (previous.retentionUntil <= receivedAt) throw new ApiError("This observation has expired and cannot be restored.", 410);
      if (previous.kind !== input.kind || previous.observedAt.toISOString() !== new Date(input.observedAt).toISOString() || JSON.stringify(previous.details) !== JSON.stringify(input.details)) throw new ApiError("This observation key belongs to different details.", 409);
      return { id: previous.id, accepted: true, replay: true };
    }
    if (attempt.status !== "IN_PROGRESS" || attempt.deadlineAt <= receivedAt) throw new ApiError("This attempt has ended. Your saved answers are unaffected.", 409);
    const observedAt = new Date(input.observedAt);
    if (observedAt.getTime() < attempt.startedAt.getTime() - 60000 || observedAt.getTime() > receivedAt.getTime() + 60000) throw new ApiError("Observation time is outside this attempt.", 422);
    if (await db.schoolAiExamIntegrityEvent.count({ where: { schoolId: user.schoolId, attemptId: attempt.id } }) >= INTEGRITY_EVENT_LIMIT) throw new ApiError("Observation limit reached. Answer saving and submission remain available.", 429);
    const event = await db.schoolAiExamIntegrityEvent.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, userId: user.userId, clientEventId: input.clientEventId, kind: input.kind, observedAt, receivedAt, retentionUntil: integrityRetentionUntil(attempt.deadlineAt, policy)!, details: input.details } });
    return { id: event.id, accepted: true, replay: false };
  });
}

export async function getExamIntegrity(user: AuthUser, assignmentId: string, cursor?: string, eventId?: string, now = new Date()): Promise<ExamIntegrityView> {
  if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Observation review is available only to authorized exam staff.", 403);
  if ((cursor && eventId) || (cursor?.length ?? 0) > 100 || (eventId?.length ?? 0) > 100) throw new ApiError("Choose one observation or one page.", 400);
  return schoolAiTransaction(user, async db => {
    const { assignment } = await scopedAssignment(user, assignmentId, db, "SUPERVISION");
    await staffExamAccess(user, assignment, "view", db, "SUPERVISION");
    let canReview = false;
    try { await staffExamAccess(user, assignment, "edit", db); canReview = true; } catch (error) { const status = error instanceof Error && "status" in error ? error.status : null; if (status !== 403 && status !== 404) throw error; }
    const where = { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, retentionUntil: { gt: now } };
    const anchor = cursor ? await db.schoolAiExamIntegrityEvent.findFirst({ where: { ...where, id: cursor }, select: { receivedAt: true, id: true } }) : null;
    if (cursor && !anchor) throw new ApiError("Observation page unavailable.", 404);
    const [events, total, pending, followUp] = await Promise.all([
      db.schoolAiExamIntegrityEvent.findMany({ where: { ...where, ...(eventId ? { id: eventId } : {}), ...(anchor ? { OR: [{ receivedAt: { lt: anchor.receivedAt } }, { receivedAt: anchor.receivedAt, id: { lt: anchor.id } }] } : {}) }, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: eventId ? 1 : 201, include: { attempt: { select: { studentId: true } } } }),
      db.schoolAiExamIntegrityEvent.count({ where }),
      db.schoolAiExamIntegrityEvent.count({ where: { ...where, decision: "PENDING" } }),
      db.schoolAiExamIntegrityEvent.count({ where: { ...where, decision: "FOLLOW_UP" } }),
    ]);
    if (eventId && events.length !== 1) throw new ApiError("Observation unavailable.", 404);
    const page = events.slice(0, 200);
    const students = await db.student.findMany({ where: { schoolId: user.schoolId, campusId: assignment.campusId, id: { in: [...new Set(page.map(event => event.attempt.studentId))] } }, select: { id: true, fullName: true, rollNo: true } });
    const canConfigurePolicy = canReview && isSchoolAiManager(user) && !await db.schoolAiExamAttempt.count({ where: { schoolId: user.schoolId, assignmentId } });
    return { policy: examIntegrityPolicy(assignment.proctorPolicy), policyVersion: assignment.version, canConfigurePolicy, canReview, nextCursor: events.length > 200 ? page[199].id : null, summary: { total, pending, followUp, truncated: total > page.length }, events: page.map(event => ({ id: event.id, attemptId: event.attemptId, kind: event.kind as IntegrityEventKind, observedAt: event.observedAt.toISOString(), receivedAt: event.receivedAt.toISOString(), retentionUntil: event.retentionUntil.toISOString(), details: integrityDetailsSchema.parse(event.details), version: event.version, decision: event.decision, reviewReason: event.reviewReason, reviewedAt: event.reviewedAt?.toISOString() ?? null, student: students.find(student => student.id === event.attempt.studentId) ?? null })) };
  });
}

export async function reviewExamIntegrity(user: AuthUser, assignmentId: string, value: unknown, now = new Date()) {
  const input = integrityReviewSchema.parse(value);
  if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Observation review is available only to authorized exam staff.", 403);
  return schoolAiTransaction(user, async db => {
    const { assignment } = await scopedAssignment(user, assignmentId, db);
    await staffExamAccess(user, assignment, "edit", db);
    const where = { id: input.eventId, assignmentId, schoolId: user.schoolId, campusId: assignment.campusId, retentionUntil: { gt: now } };
    const event = await db.schoolAiExamIntegrityEvent.findFirst({ where });
    if (!event) throw new ApiError("Observation unavailable.", 404);
    if (event.version === input.version + 1 && event.reviewedById === user.userId && event.decision === input.decision && event.reviewReason === input.reason) return { id: event.id, version: event.version, decision: event.decision, replay: true };
    if (event.version !== input.version) throw new ApiError("This observation was reviewed by someone else. Reload its current decision.", 409);
    const changed = await db.schoolAiExamIntegrityEvent.updateMany({ where: { ...where, version: input.version }, data: { decision: input.decision, reviewReason: input.reason, reviewedById: user.userId, reviewedAt: now, version: { increment: 1 } } });
    if (!changed.count) throw new ApiError("The review changed. Refresh before deciding.", 409);
    await db.auditLog.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, tableName: "school_ai_exam_integrity_events", recordId: event.id, userId: user.userId, retentionUntil: event.retentionUntil, oldValue: { version: event.version, decision: event.decision, reason: event.reviewReason }, newValue: { version: event.version + 1, decision: input.decision, reason: input.reason, uncertainty: INTEGRITY_UNCERTAINTY } as Prisma.InputJsonValue } });
    return { id: event.id, version: event.version + 1, decision: input.decision, replay: false };
  });
}

/** Expiry hides data at read time; this bounded tenant transaction physically removes it. */
export async function purgeExpiredExamIntegrity(schoolId: string, limit = 200, now = new Date()) {
  const batch = Math.max(1, Math.min(1000, Math.floor(limit)));
  return runWithTenantContext({ schoolId, unscoped: false }, () => tenantTransaction(async db => {
    // Lock observations first so a concurrent review cannot append a copy after
    // its event was removed. Orphan audit copies are selected independently.
    const rows = await db.$queryRaw<Array<{ id: string }>>`SELECT id FROM school_ai_exam_integrity_events WHERE school_id = ${schoolId} AND retention_until <= ${now} ORDER BY retention_until, id LIMIT ${batch} FOR UPDATE`;
    const ids = rows.map(row => row.id);
    // Audit copies under an active AUDIT_LOG hold stay (the database refuses to delete them anyway).
    const holds = await db.dataLegalHold.findMany({ where: activeHoldWhere(schoolId, "AUDIT_LOG", now), select: { recordId: true } });
    if (holds.some(hold => hold.recordId === null)) return { deletedEvents: 0, deletedAuditCopies: 0 };
    const held = holds.flatMap(hold => hold.recordId ? [hold.recordId] : []);
    const copies = await db.auditLog.findMany({ where: { schoolId, tableName: "school_ai_exam_integrity_events", retentionUntil: { lte: now }, id: { notIn: held } }, select: { id: true }, orderBy: [{ retentionUntil: "asc" }, { id: "asc" }], take: batch });
    const audit = await db.auditLog.deleteMany({ where: { schoolId, tableName: "school_ai_exam_integrity_events", retentionUntil: { lte: now }, id: { notIn: held }, OR: [{ id: { in: copies.map(copy => copy.id) } }, { recordId: { in: ids } }] } });
    const events = await db.schoolAiExamIntegrityEvent.deleteMany({ where: { schoolId, id: { in: ids }, retentionUntil: { lte: now } } });
    return { deletedEvents: events.count, deletedAuditCopies: audit.count };
  }));
}
