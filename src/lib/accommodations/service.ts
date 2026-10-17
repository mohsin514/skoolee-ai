import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { studentScope } from "@/lib/auth/policy";
import { teacherClassIds } from "@/lib/chat/policy";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { paperDataSchema } from "@/lib/school-ai/assessment";
import { examAccommodationsSchema } from "@/lib/school-ai/exam";
import { ASSESSMENT_TYPES, capabilitiesSchema, effectiveSettings, needsReview, sensitiveInstructionIssue, type PlanRow } from "./plan";

// SKO-410 projections:
//  - designated approvers (campus operations managers): full plans and restricted supporting records
//  - teachers/invigilators of the learner's class: operational adjustments and instructions only
//  - the learner: their effective settings and rehearsal; guardians: a capability summary
// Everyone else is refused.

const isApprover = (user: AuthUser) => canManageOperations(user);
const audit = (tx: TxClient, user: AuthUser, campusId: string, recordId: string, newValue: Record<string, unknown>, oldValue?: Record<string, unknown>) =>
  tx.auditLog.create({ data: { schoolId: user.schoolId, campusId, tableName: "accommodation_plans", recordId, userId: user.userId, newValue: newValue as never, ...(oldValue ? { oldValue: oldValue as never } : {}) } });

async function scopedStudent(tx: TxClient, user: AuthUser, studentId: string) {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true, classId: true, fullName: true, rollNo: true } });
  if (!student) throw new ApiError("Learner not found.", 404);
  return student;
}
const operational = (plan: PlanRow & { approvedAt: Date }) => ({ id: plan.id, version: plan.version, validFrom: plan.validFrom, validUntil: plan.validUntil, assessmentTypes: plan.assessmentTypes, extraMinutes: plan.extraMinutes, extraPercent: plan.extraPercent, breakMinutes: plan.breakMinutes, capabilities: capabilitiesSchema.parse(plan.capabilities), instructions: plan.instructions, approvedAt: plan.approvedAt });

// ─── Coordinator ──────────────────────────────────────────────────
export async function coordinatorView(user: AuthUser, raw: unknown) {
  const { classId } = z.object({ classId: z.string().min(1).optional() }).strict().parse(raw);
  if (!isApprover(user)) throw new ApiError("Only designated staff can manage access plans.", 403);
  return schoolAiTransaction(user, async tx => {
    const campus = user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" };
    const classes = await tx.class.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...campus }, select: { id: true, name: true, section: true }, orderBy: { name: "asc" } });
    const selected = classId && classes.some(row => row.id === classId) ? classId : classes[0]?.id;
    const students = selected ? await tx.student.findMany({ where: { schoolId: user.schoolId, classId: selected, archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } }) : [];
    const plans = await tx.accommodationPlan.findMany({ where: { schoolId: user.schoolId, studentId: { in: students.map(row => row.id) } }, orderBy: { version: "desc" }, include: { _count: { select: { supportRecords: true, rehearsals: true } } } });
    const now = new Date();
    const review = await tx.accommodationPlan.findMany({ where: { schoolId: user.schoolId, status: "ACTIVE", ...campus, validUntil: { lt: new Date(now.getTime() + 14 * 86_400_000) } }, orderBy: { validUntil: "asc" }, take: 100 });
    const reviewStudents = await tx.student.findMany({ where: { schoolId: user.schoolId, id: { in: review.map(row => row.studentId) } }, select: { id: true, fullName: true } });
    return {
      classId: selected ?? null, classes,
      students: students.map(student => ({ ...student, plans: plans.filter(plan => plan.studentId === student.id).map(plan => ({ ...operational(plan), status: plan.status, endedAt: plan.endedAt, endReason: plan.endReason, supportRecords: plan._count.supportRecords, rehearsals: plan._count.rehearsals })) })),
      review: review.filter(plan => needsReview(plan, now)).map(plan => ({ planId: plan.id, studentId: plan.studentId, fullName: reviewStudents.find(row => row.id === plan.studentId)?.fullName ?? "", validUntil: plan.validUntil, expired: plan.validUntil.toISOString().slice(0, 10) < now.toISOString().slice(0, 10) })),
    };
  });
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const planInput = z.object({
  studentId: z.string().min(1), validFrom: date, validUntil: date,
  assessmentTypes: z.array(z.enum(ASSESSMENT_TYPES)).min(1).max(3),
  extraMinutes: z.number().int().min(0).max(240).default(0), extraPercent: z.number().int().min(0).max(100).default(0), breakMinutes: z.number().int().min(0).max(120).default(0),
  capabilities: capabilitiesSchema, instructions: z.string().trim().max(500).default(""),
  expectedVersion: z.number().int().min(0),
}).strict().refine(value => value.validUntil >= value.validFrom, { message: "The plan must end on or after it starts.", path: ["validUntil"] });

/** Every change is a new version; the previous active version is superseded, never edited. */
export async function savePlan(user: AuthUser, raw: unknown) {
  const input = planInput.parse(raw);
  if (!isApprover(user)) throw new ApiError("Only designated staff can approve access plans.", 403);
  const issue = sensitiveInstructionIssue(input.instructions);
  if (issue) throw new ApiError(issue, 400);
  return schoolAiTransaction(user, async tx => {
    const student = await scopedStudent(tx, user, input.studentId);
    const latest = await tx.accommodationPlan.findFirst({ where: { schoolId: user.schoolId, studentId: student.id }, orderBy: { version: "desc" } });
    if ((latest?.version ?? 0) !== input.expectedVersion) throw new ApiError("Someone changed this plan meanwhile. Refresh and review it again.", 409);
    const active = latest?.status === "ACTIVE" ? latest : null;
    if (active) await tx.accommodationPlan.update({ where: { id: active.id }, data: { status: "SUPERSEDED", endedAt: new Date(), endedById: user.userId, endReason: "Superseded by a new version" } });
    const plan = await tx.accommodationPlan.create({ data: { schoolId: user.schoolId, campusId: student.campusId, studentId: student.id, version: (latest?.version ?? 0) + 1, validFrom: new Date(`${input.validFrom}T00:00:00Z`), validUntil: new Date(`${input.validUntil}T00:00:00Z`), assessmentTypes: input.assessmentTypes, extraMinutes: input.extraMinutes, extraPercent: input.extraPercent, breakMinutes: input.breakMinutes, capabilities: input.capabilities, instructions: input.instructions, approvedById: user.userId } });
    await audit(tx, user, student.campusId, plan.id, { studentId: student.id, version: plan.version, extraMinutes: plan.extraMinutes, extraPercent: plan.extraPercent, breakMinutes: plan.breakMinutes, assessmentTypes: plan.assessmentTypes, validUntil: input.validUntil }, active ? { version: active.version } : undefined);
    return plan;
  });
}

export async function revokePlan(user: AuthUser, planId: string, raw: unknown) {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(300) }).strict().parse(raw);
  if (!isApprover(user)) throw new ApiError("Only designated staff can revoke access plans.", 403);
  return schoolAiTransaction(user, async tx => {
    const plan = await tx.accommodationPlan.findFirst({ where: { id: planId, schoolId: user.schoolId, status: "ACTIVE" } });
    if (!plan) throw new ApiError("Active plan not found.", 404);
    await scopedStudent(tx, user, plan.studentId);
    // Started attempts keep the settings bound at start; only future starts see the change.
    const updated = await tx.accommodationPlan.update({ where: { id: plan.id }, data: { status: "REVOKED", endedAt: new Date(), endedById: user.userId, endReason: reason } });
    await audit(tx, user, plan.campusId, plan.id, { status: "REVOKED" }, { status: "ACTIVE" });
    return updated;
  });
}

/** Supporting records are confidential: only designated approvers can add or read them. */
export async function supportRecords(user: AuthUser, planId: string, raw?: unknown) {
  if (!isApprover(user)) throw new ApiError("Supporting records are restricted to designated staff.", 403);
  return schoolAiTransaction(user, async tx => {
    const plan = await tx.accommodationPlan.findFirst({ where: { id: planId, schoolId: user.schoolId } });
    if (!plan) throw new ApiError("Plan not found.", 404);
    await scopedStudent(tx, user, plan.studentId);
    if (raw !== undefined) {
      const { note } = z.object({ note: z.string().trim().min(3).max(4000) }).strict().parse(raw);
      const row = await tx.accommodationSupportRecord.create({ data: { schoolId: user.schoolId, planId, note, createdById: user.userId } });
      await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: plan.campusId, tableName: "accommodation_support_records", recordId: row.id, userId: user.userId, newValue: { planId } } });
    }
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: plan.campusId, tableName: "accommodation_support_records", recordId: planId, userId: user.userId, newValue: { action: "READ" } } });
    return tx.accommodationSupportRecord.findMany({ where: { schoolId: user.schoolId, planId }, orderBy: { createdAt: "desc" }, select: { id: true, note: true, createdAt: true } });
  });
}

// ─── Teachers and invigilators ────────────────────────────────────
/** Operational adjustments for the learners a teacher teaches. No supporting records or end reasons. */
export async function staffView(user: AuthUser) {
  if (user.role === "STUDENT" || user.role === "PARENT") throw new ApiError("Not available.", 403);
  if (!isApprover(user) && user.role !== "TEACHER") throw new ApiError("Access plans are available to teaching staff only.", 403);
  return schoolAiTransaction(user, async tx => {
    const classIds = isApprover(user) ? null : await teacherClassIds(user.userId, tx);
    const students = await tx.student.findMany({ where: { schoolId: user.schoolId, archivedAt: null, ...(classIds ? { classId: { in: classIds } } : user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, fullName: true, rollNo: true, classId: true } });
    const plans = await tx.accommodationPlan.findMany({ where: { schoolId: user.schoolId, status: "ACTIVE", studentId: { in: students.map(row => row.id) } } });
    return plans.map(plan => ({ student: students.find(row => row.id === plan.studentId)!, plan: operational(plan) })).sort((a, b) => a.student.rollNo.localeCompare(b.student.rollNo));
  });
}

// ─── Learners and guardians ───────────────────────────────────────
export async function learnerView(user: AuthUser) {
  if (user.role !== "STUDENT" && user.role !== "PARENT") throw new ApiError("Not available.", 403);
  return schoolAiTransaction(user, async tx => {
    const children = await tx.student.findMany({ where: { AND: [studentScope(user, "learningRecords"), { archivedAt: null }] }, select: { id: true, fullName: true, classId: true } });
    const plans = await tx.accommodationPlan.findMany({ where: { schoolId: user.schoolId, status: "ACTIVE", studentId: { in: children.map(row => row.id) } } });
    if (user.role === "PARENT") return { mode: "guardian" as const, children: children.map(child => { const plan = plans.find(row => row.studentId === child.id); return { fullName: child.fullName, plan: plan ? { validFrom: plan.validFrom, validUntil: plan.validUntil, assessmentTypes: plan.assessmentTypes, extraMinutes: plan.extraMinutes, extraPercent: plan.extraPercent, breakMinutes: plan.breakMinutes, capabilities: capabilitiesSchema.parse(plan.capabilities) } : null }; }) };
    const child = children[0];
    const plan = child ? plans.find(row => row.studentId === child.id) ?? null : null;
    const now = new Date();
    const exams = child ? await tx.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, classId: child.classId, status: "ACTIVE", endsAt: { gt: now }, studentIds: { array_contains: [child.id] } }, select: { id: true, title: true, startsAt: true, paperSnapshot: true, accommodations: true }, orderBy: { startsAt: "asc" }, take: 10 }) : [];
    const rehearsal = plan ? await tx.accommodationRehearsal.findFirst({ where: { schoolId: user.schoolId, planId: plan.id, studentId: child!.id }, orderBy: { completedAt: "desc" } }) : null;
    return {
      mode: "learner" as const,
      plan: plan ? { ...operational(plan), rehearsedAt: rehearsal?.completedAt ?? null } : null,
      exams: exams.map(exam => {
        const parsed = paperDataSchema.safeParse(exam.paperSnapshot);
        const approval = examAccommodationsSchema.safeParse(exam.accommodations);
        const effective = effectiveSettings({ baseMinutes: parsed.success ? parsed.data.blueprint.durationMinutes : 0, type: "EXAM", at: exam.startsAt, plan, examApproval: approval.success ? approval.data[child!.id] : null });
        return { id: exam.id, title: exam.title, startsAt: exam.startsAt, effective: { ...effective, instructions: undefined } };
      }),
    };
  });
}

/** The learner confirms the exact accessible mode works for them before assessment day. */
export async function recordRehearsal(user: AuthUser, raw: unknown) {
  const { planId, baseMinutes } = z.object({ planId: z.string().min(1), baseMinutes: z.number().int().min(1).max(480) }).strict().parse(raw);
  if (user.role !== "STUDENT") throw new ApiError("Only the learner can complete a practice check.", 403);
  return schoolAiTransaction(user, async tx => {
    const student = await tx.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null }, select: { id: true } });
    const plan = student ? await tx.accommodationPlan.findFirst({ where: { id: planId, schoolId: user.schoolId, studentId: student.id, status: "ACTIVE" } }) : null;
    if (!plan || !student) throw new ApiError("Plan not found.", 404);
    const settings = effectiveSettings({ baseMinutes, type: "PRACTICE", at: new Date(), plan: { ...plan, assessmentTypes: [...plan.assessmentTypes, "PRACTICE"] } });
    return tx.accommodationRehearsal.create({ data: { schoolId: user.schoolId, planId: plan.id, studentId: student.id, settings: { ...settings, instructions: undefined } as never } });
  });
}

// ─── Exam integration ─────────────────────────────────────────────
export function activePlanFor(tx: TxClient, schoolId: string, studentId: string) {
  return tx.accommodationPlan.findFirst({ where: { schoolId, studentId, status: "ACTIVE" } });
}

export const liveInput = z.object({ studentId: z.string().min(1), addedMinutes: z.number().int().min(1).max(120), reason: z.string().trim().min(3).max(300) }).strict();
/** An exceptional extension of a running attempt: approver, reason and old/new deadline are recorded for the invigilator. */
export async function liveAdjustment(user: AuthUser, assignmentId: string, raw: unknown) {
  const input = liveInput.parse(raw);
  if (!isApprover(user)) throw new ApiError("Only designated staff can approve a live adjustment.", 403);
  return schoolAiTransaction(user, async tx => {
    const assignment = await tx.schoolAiExamAssignment.findFirst({ where: { id: assignmentId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true } });
    if (!assignment) throw new ApiError("Exam not found.", 404);
    const now = new Date();
    const attempt = await tx.schoolAiExamAttempt.findFirst({ where: { schoolId: user.schoolId, assignmentId, studentId: input.studentId, status: "IN_PROGRESS", deadlineAt: { gt: now } } });
    if (!attempt) throw new ApiError("A live adjustment needs an attempt in progress. Before start, approve the plan or exam adjustment instead.", 409);
    const newDeadline = new Date(attempt.deadlineAt.getTime() + input.addedMinutes * 60_000);
    const moved = await tx.schoolAiExamAttempt.updateMany({ where: { id: attempt.id, schoolId: user.schoolId, status: "IN_PROGRESS", deadlineAt: attempt.deadlineAt }, data: { deadlineAt: newDeadline } });
    if (moved.count !== 1) throw new ApiError("The attempt changed meanwhile. Refresh and try again.", 409);
    const row = await tx.accommodationLiveAdjustment.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, assignmentId, attemptId: attempt.id, studentId: input.studentId, addedMinutes: input.addedMinutes, reason: input.reason, oldDeadline: attempt.deadlineAt, newDeadline, approvedById: user.userId } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: assignment.campusId, tableName: "school_ai_exam_attempts", recordId: attempt.id, userId: user.userId, oldValue: { deadlineAt: attempt.deadlineAt.toISOString() }, newValue: { deadlineAt: newDeadline.toISOString(), addedMinutes: input.addedMinutes, liveAdjustmentId: row.id } } });
    return row;
  });
}
