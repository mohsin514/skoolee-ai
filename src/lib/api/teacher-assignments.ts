import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags, type PermissionModule } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { syncTimetableSlotsForSubjects, type TimetableClash } from "./timetable-sync";

type AssignmentInput = Record<string, unknown>;
function recordId(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 128) throw new ApiError("A valid record id is required", 400);
  return value;
}
function campusScope(user: AuthUser, requested: unknown) {
  if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && !user.campusId) throw new ApiError("Insufficient permissions", 403);
  if (user.role !== "SUPER_ADMIN" && requested !== undefined && requested !== null && requested !== user.campusId) throw new ApiError("Choose your assigned campus", 403);
  return { schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? typeof requested === "string" && requested ? { campusId: requested } : {} : { campusId: user.campusId! }) };
}
async function authorizeAssignment(tx: TxClient, user: AuthUser, module: PermissionModule, action: "edit" | "delete" = "edit") {
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && user.accessVersion !== actor.accessVersion) throw new ApiError("Your account access changed. Sign in again.", 403);
  const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true } });
  if (!moduleFlags(grants, user.role, module)[action === "edit" ? "canEdit" : "canDelete"]) throw new ApiError(`Insufficient permissions: ${module}.${action}`, 403);
  await assertSchoolOperational(user.schoolId, tx);
  return grants;
}
async function teacherInCampus(tx: TxClient, value: unknown, schoolId: string, campusId: string, allowPrincipal = false) {
  if (value === undefined || value === null || value === "") return null;
  const id = recordId(value);
  const teacher = await tx.user.findFirst({ where: { id, schoolId, campusId, role: { in: allowPrincipal ? ["TEACHER", "PRINCIPAL"] : ["TEACHER"] }, isActive: true }, select: { id: true } });
  if (!teacher) throw new ApiError("Teacher is not active in this campus", 400);
  return teacher.id;
}
async function requireScheduleEdit(tx: TxClient, user: AuthUser, campusId: string, subjectIds: string[], grants: Awaited<ReturnType<typeof authorizeAssignment>>) {
  if (!subjectIds.length) return;
  const scheduled = await tx.timetableSlot.findFirst({ where: { schoolId: user.schoolId, subjectId: { in: subjectIds }, timetable: { schoolId: user.schoolId, campusId } }, select: { id: true } });
  if (scheduled && !moduleFlags(grants, user.role, "timetable").canEdit) throw new ApiError("Insufficient permissions: timetable.edit is required to change a scheduled teacher", 403);
}

/** Database-only work; route handlers notify only after this transaction commits. */
export async function updateClassWithTeacherAssignment(user: AuthUser, body: AssignmentInput) {
  const id = recordId(body.id), scope = campusScope(user, body.campusId);
  // Only locate the fence outside the transaction. All mutable facts are read
  // again after acquiring it, including permissions, assignments and bookings.
  const located = await prisma.class.findFirst({ where: { id, ...scope }, select: { campusId: true } });
  if (!located) throw new ApiError("Class not found", 404);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, located.campusId);
    return updateClassWithTeacherAssignmentTx(tx, user, body, located.campusId);
  });
}

/** Caller holds the campus scheduling fence and a SERIALIZABLE transaction. */
export async function updateClassWithTeacherAssignmentTx(tx: TxClient, user: AuthUser, body: AssignmentInput, campusId: string) {
  const id = recordId(body.id), scope = campusScope(user, campusId);
  const grants = await authorizeAssignment(tx, user, "students");
  const existing = await tx.class.findFirst({ where: { id, ...scope, campusId: campusId }, select: { id: true, campusId: true, classTeacherId: true, teachingMode: true, academicYear: true } });
  if (!existing) throw new ApiError("Class not found", 404);
  const data: Prisma.ClassUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.section !== undefined) data.section = body.section ? String(body.section).trim() : null;
  if (body.academicYear !== undefined) {
    const academicYear = Number(body.academicYear);
    if (!Number.isInteger(academicYear)) throw new ApiError("A valid academic year is required", 400);
    if (academicYear !== existing.academicYear && await tx.timetable.count({ where: { schoolId: user.schoolId, campusId: existing.campusId, classId: id } })) throw new ApiError("A class with timetables cannot move to another academic year. Create the new year's class instead.", 409);
    data.academicYear = academicYear;
  }
  const teacherProvided = body.classTeacherId !== undefined || body.teacherId !== undefined;
  const classTeacherId = teacherProvided ? await teacherInCampus(tx, body.classTeacherId !== undefined ? body.classTeacherId : body.teacherId, user.schoolId, existing.campusId, true) : existing.classTeacherId;
  if (teacherProvided) data.classTeacherId = classTeacherId;
  let effectiveMode = existing.teachingMode;
  if (body.teachingMode !== undefined) {
    const mode = String(body.teachingMode).toUpperCase();
    if (mode !== "SINGLE" && mode !== "SUBJECT") throw new ApiError("teachingMode must be SINGLE or SUBJECT", 400);
    data.teachingMode = mode; effectiveMode = mode;
  }
  const cls = await tx.class.update({ where: { id }, data, include: { classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } }, _count: { select: { students: true, subjects: true } } } });
  // A mode-only change must preserve individually assigned subject teachers.
  if (effectiveMode === "SINGLE" && teacherProvided && classTeacherId !== existing.classTeacherId) {
    const subjectScope = { schoolId: user.schoolId, campusId: existing.campusId, classId: id };
    const subjects = await tx.subject.findMany({ where: subjectScope, select: { id: true } });
    const ids = subjects.map(subject => subject.id);
    await requireScheduleEdit(tx, user, existing.campusId, ids, grants);
    await tx.subject.updateMany({ where: subjectScope, data: { teacherId: classTeacherId } });
    await syncTimetableSlotsForSubjects(tx, { schoolId: user.schoolId, campusId: existing.campusId }, ids, classTeacherId);
  }
  if (teacherProvided) await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "class", recordId: id, oldValue: { classTeacherId: existing.classTeacherId }, newValue: { classTeacherId }, userId: user.userId } });
  return { existing, cls, clashes: [] as TimetableClash[] };
}

export async function updateSubjectWithTeacherAssignment(user: AuthUser, body: AssignmentInput) {
  const id = recordId(body.id), scope = campusScope(user, body.campusId);
  const located = await prisma.subject.findFirst({ where: { id, ...scope }, select: { campusId: true } });
  if (!located) throw new ApiError("Subject not found", 404);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, located.campusId);
    return updateSubjectWithTeacherAssignmentTx(tx, user, body, located.campusId);
  });
}

/** Caller holds the campus scheduling fence and a SERIALIZABLE transaction. */
export async function updateSubjectWithTeacherAssignmentTx(tx: TxClient, user: AuthUser, body: AssignmentInput, campusId: string) {
  const id = recordId(body.id), scope = campusScope(user, campusId);
  const grants = await authorizeAssignment(tx, user, "exams");
  const existing = await tx.subject.findFirst({ where: { id, ...scope, campusId: campusId }, select: { id: true, campusId: true, name: true, classId: true } });
  if (!existing) throw new ApiError("Subject not found", 404);
  const data: Prisma.SubjectUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.totalMarks !== undefined) data.totalMarks = Number(body.totalMarks);
  const teacherProvided = body.teacherId !== undefined;
  if (teacherProvided) data.teacherId = await teacherInCampus(tx, body.teacherId, user.schoolId, existing.campusId);
  if (body.classId !== undefined) {
    const cls = await tx.class.findFirst({ where: { id: recordId(body.classId), schoolId: user.schoolId, campusId: existing.campusId }, select: { id: true } });
    if (!cls) throw new ApiError("Class not found", 404);
    if (cls.id !== existing.classId && await tx.timetableSlot.count({ where: { schoolId: user.schoolId, subjectId: id } })) throw new ApiError("A scheduled subject cannot move to another class. Remove it from the timetable first.", 409);
    data.classId = cls.id;
  }
  if (teacherProvided) await requireScheduleEdit(tx, user, existing.campusId, [id], grants);
  const subject = await tx.subject.update({ where: { id }, data, include: { class: { select: { id: true, name: true, section: true } }, teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } } });
  if (teacherProvided) await syncTimetableSlotsForSubjects(tx, { schoolId: user.schoolId, campusId: existing.campusId }, [id], subject.teacherId);
  await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "subject", recordId: id, oldValue: { name: existing.name }, newValue: { name: subject.name, teacherId: subject.teacherId }, userId: user.userId } });
  return { existing, subject, clashes: [] as TimetableClash[] };
}

/** Subject deletion clears timetable references via SetNull in this transaction. */
export async function deleteSubjectWithTimetableSync(user: AuthUser, id: string) {
  recordId(id);
  const scope = campusScope(user, undefined);
  const located = await prisma.subject.findFirst({ where: { id, ...scope }, select: { campusId: true } });
  if (!located) throw new ApiError("Subject not found", 404);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, located.campusId);
    const grants = await authorizeAssignment(tx, user, "exams", "delete");
    const subject = await tx.subject.findFirst({ where: { id, ...scope, campusId: located.campusId }, include: { _count: { select: { marks: true } } } });
    if (!subject) throw new ApiError("Subject not found", 404);
    if (subject._count.marks > 0) throw new ApiError("Subjects with marks cannot be deleted", 409);
    await requireScheduleEdit(tx, user, subject.campusId, [id], grants);
    const timetables = await tx.timetableSlot.findMany({ where: { subjectId: id, schoolId: user.schoolId }, select: { timetableId: true } });
    await tx.subject.delete({ where: { id } });
    if (timetables.length) await tx.timetable.updateMany({ where: { id: { in: timetables.map(slot => slot.timetableId) }, schoolId: user.schoolId, campusId: subject.campusId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "subject", recordId: id, oldValue: { name: subject.name, deleted: true }, userId: user.userId } });
  });
}
