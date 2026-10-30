import { parseTeachingMode } from "@/lib/academic/teaching-mode";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags, type PermissionModule } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { syncTimetableSlotsForSubjects, type TimetableClash } from "./timetable-sync";
import { assertSubjectCodeFree, normalizeSubjectCode } from "@/lib/academic/subject-catalogue";
import { effectiveDate, findDuplicateClass, findDuplicateSubject, recordTeachingAssignment } from "@/lib/academic/structure";
import { assertCapacityFitsEnrolled, parseClassCapacity } from "@/lib/academic/class-setup";
import { allocationWarnings, assertTeacherCurrent, type AllocationRequest, weeklyPeriodCapacity } from "@/lib/academic/teacher-allocation";
import { getLocalePackage } from "@/lib/locale/store";

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
export async function authorizeAssignment(tx: TxClient, user: AuthUser, module: PermissionModule, action: "edit" | "delete" = "edit") {
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && user.accessVersion !== actor.accessVersion) throw new ApiError("Your account access changed. Sign in again.", 403);
  const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true, updatedAt: true } });
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

/** Body keys that only staff a class (class teacher, teaching mode). Like subject-teacher assignment they are an
 *  academic act gated on `exams.edit` (the route enforces the academic-lead seat); anything else (name, section,
 *  year) is a class-record change and keeps `students.edit` (§7.6). */
const STAFFING_ONLY_KEYS = new Set(["id", "campusId", "classTeacherId", "teacherId", "teachingMode", "effectiveFrom"]);

/** Caller holds the campus scheduling fence and a SERIALIZABLE transaction. */
export async function updateClassWithTeacherAssignmentTx(tx: TxClient, user: AuthUser, body: AssignmentInput, campusId: string) {
  const id = recordId(body.id), scope = campusScope(user, campusId);
  const staffingOnly = Object.keys(body).every((key) => STAFFING_ONLY_KEYS.has(key));
  const grants = await authorizeAssignment(tx, user, staffingOnly ? "exams" : "students");
  const existing = await tx.class.findFirst({ where: { id, ...scope, campusId: campusId }, select: { id: true, campusId: true, classTeacherId: true, teachingMode: true, academicYear: true, name: true, section: true, capacity: true, archivedAt: true } });
  if (!existing) throw new ApiError("Class not found", 404);
  // SKO-462: an archived class is history; restore it before changing it.
  if (existing.archivedAt) throw new ApiError("Restore this class before editing it.", 409);
  const from = effectiveDate(body.effectiveFrom);
  const data: Prisma.ClassUncheckedUpdateInput = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.section !== undefined) data.section = body.section ? String(body.section).trim() : null;
  if (body.academicYear !== undefined) {
    const academicYear = Number(body.academicYear);
    if (!Number.isInteger(academicYear)) throw new ApiError("A valid academic year is required", 400);
    if (academicYear !== existing.academicYear && await tx.timetable.count({ where: { schoolId: user.schoolId, campusId: existing.campusId, classId: id } })) throw new ApiError("A class with timetables cannot move to another academic year. Create the new year's class instead.", 409);
    data.academicYear = academicYear;
  }
  // SKAI-148: seats are a campus-operations field; never fewer than the students already enrolled.
  if (body.capacity !== undefined) {
    const capacity = parseClassCapacity(body.capacity);
    assertCapacityFitsEnrolled(capacity, await tx.student.count({ where: { schoolId: user.schoolId, classId: id, archivedAt: null, status: "active" } }));
    data.capacity = capacity;
  }
  if (data.name !== undefined || data.section !== undefined || data.academicYear !== undefined) {
    if (data.name === "") throw new ApiError("A class name is required", 400);
    const duplicate = await findDuplicateClass(tx, { schoolId: user.schoolId, campusId: existing.campusId }, { name: (data.name as string | undefined) ?? existing.name, section: data.section !== undefined ? data.section as string | null : existing.section, academicYear: (data.academicYear as number | undefined) ?? existing.academicYear }, id);
    if (duplicate) throw new ApiError(`${duplicate.name}${duplicate.section ? ` ${duplicate.section}` : ""} already exists for that year (class ${duplicate.id}).`, 409);
  }
  const teacherProvided = body.classTeacherId !== undefined || body.teacherId !== undefined;
  const classTeacherId = teacherProvided ? await teacherInCampus(tx, body.classTeacherId !== undefined ? body.classTeacherId : body.teacherId, user.schoolId, existing.campusId, true) : existing.classTeacherId;
  if (teacherProvided) data.classTeacherId = classTeacherId;
  let effectiveMode = existing.teachingMode;
  if (body.teachingMode !== undefined) {
    if (body.teachingMode === null) throw new ApiError("teachingMode must be SINGLE or SUBJECT", 400);
    effectiveMode = parseTeachingMode(body.teachingMode, "SINGLE");
    data.teachingMode = effectiveMode;
  }
  // SKAI-197: a mode switch is a staffing decision, so it lands in the class history like a teacher change.
  const modeChanged = effectiveMode !== existing.teachingMode;
  const cls = await tx.class.update({ where: { id }, data, include: { classTeacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } }, _count: { select: { students: true, subjects: true } } } });
  // A mode-only change must preserve individually assigned subject teachers.
  if (effectiveMode === "SINGLE" && teacherProvided && classTeacherId !== existing.classTeacherId) {
    const subjectScope = { schoolId: user.schoolId, campusId: existing.campusId, classId: id };
    const subjects = await tx.subject.findMany({ where: subjectScope, select: { id: true } });
    const ids = subjects.map(subject => subject.id);
    await requireScheduleEdit(tx, user, existing.campusId, ids, grants);
    await tx.subject.updateMany({ where: subjectScope, data: { teacherId: classTeacherId } });
    for (const subjectId of ids) await recordTeachingAssignment(tx, user, { campusId: existing.campusId, classId: id, subjectId, teacherId: classTeacherId, from });
    await syncTimetableSlotsForSubjects(tx, { schoolId: user.schoolId, campusId: existing.campusId }, ids, classTeacherId);
  }
  if (teacherProvided) await recordTeachingAssignment(tx, user, { campusId: existing.campusId, classId: id, subjectId: null, teacherId: classTeacherId, from });
  if (teacherProvided || modeChanged || data.name !== undefined || data.section !== undefined || data.academicYear !== undefined || data.capacity !== undefined) await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "class", recordId: id, oldValue: { classTeacherId: existing.classTeacherId, teachingMode: existing.teachingMode, name: existing.name, section: existing.section, academicYear: existing.academicYear, capacity: existing.capacity }, newValue: { classTeacherId, teachingMode: effectiveMode, name: cls.name, section: cls.section, academicYear: cls.academicYear, capacity: cls.capacity, effectiveFrom: from.toISOString().slice(0, 10) }, userId: user.userId } });
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
export async function updateSubjectWithTeacherAssignmentTx(tx: TxClient, user: AuthUser, body: AssignmentInput, campusId: string, authorized?: Awaited<ReturnType<typeof authorizeAssignment>>) {
  const id = recordId(body.id), scope = campusScope(user, campusId);
  const grants = authorized ?? await authorizeAssignment(tx, user, "exams");
  const existing = await tx.subject.findFirst({ where: { id, ...scope, campusId: campusId }, select: { id: true, campusId: true, name: true, code: true, classId: true, teacherId: true, archivedAt: true, class: { select: { archivedAt: true } } } });
  if (!existing) throw new ApiError("Subject not found", 404);
  if (existing.class.archivedAt) throw new ApiError("Restore this subject's class before editing it.", 409);
  const from = effectiveDate(body.effectiveFrom);
  const data: Prisma.SubjectUncheckedUpdateInput = {};
  if (body.name !== undefined) {
    data.name = String(body.name).trim();
    if (!data.name || data.name.length > 120) throw new ApiError("A subject name of up to 120 characters is required", 400);
  }
  if (body.totalMarks !== undefined) {
    const totalMarks = Number(body.totalMarks);
    if (!Number.isInteger(totalMarks) || totalMarks < 1 || totalMarks > 1000) throw new ApiError("Maximum marks must be a whole number from 1 to 1000", 400);
    data.totalMarks = totalMarks;
  }
  // SKAI-149: code, core/elective and archive. An archived subject only accepts a restore.
  if (existing.archivedAt && body.archived !== false) throw new ApiError("Restore this subject before editing it.", 409);
  if (body.code !== undefined) data.code = normalizeSubjectCode(body.code);
  if (body.isElective !== undefined) data.isElective = body.isElective === true;
  if (body.archived !== undefined) data.archivedAt = body.archived === true ? new Date() : null;
  if (data.code !== undefined || data.name !== undefined) await assertSubjectCodeFree(tx, user.schoolId, (data.code as string | null | undefined) === undefined ? existing.code : data.code as string | null, (data.name as string | undefined) ?? existing.name, id);
  if (data.code && await tx.subject.findFirst({ where: { schoolId: user.schoolId, classId: existing.classId, code: data.code as string, id: { not: id } }, select: { id: true } })) throw new ApiError(`Code ${data.code} is already used in this class.`, 409);
  const teacherProvided = body.teacherId !== undefined;
  // SKAI-150: a stale page cannot overwrite a newer allocation.
  if (teacherProvided) assertTeacherCurrent(body.expectedTeacherId as string | null | undefined, existing.teacherId);
  if (teacherProvided) data.teacherId = await teacherInCampus(tx, body.teacherId, user.schoolId, existing.campusId);
  if (body.classId !== undefined) {
    const cls = await tx.class.findFirst({ where: { id: recordId(body.classId), schoolId: user.schoolId, campusId: existing.campusId, archivedAt: null }, select: { id: true } });
    if (!cls) throw new ApiError("Class not found", 404);
    if (cls.id !== existing.classId && await tx.timetableSlot.count({ where: { schoolId: user.schoolId, subjectId: id } })) throw new ApiError("A scheduled subject cannot move to another class. Remove it from the timetable first.", 409);
    data.classId = cls.id;
  }
  if (data.name !== undefined || data.classId !== undefined) {
    const duplicate = await findDuplicateSubject(tx, (data.classId as string | undefined) ?? existing.classId, (data.name as string | undefined) ?? existing.name, id);
    if (duplicate) throw new ApiError(`${duplicate.name} already exists in that class (subject ${duplicate.id}).`, 409);
  }
  if (teacherProvided) await requireScheduleEdit(tx, user, existing.campusId, [id], grants);
  const subject = await tx.subject.update({ where: { id }, data, include: { class: { select: { id: true, name: true, section: true } }, teacher: { select: { id: true, fullName: true, email: true, profileImageUrl: true } } } });
  if (teacherProvided) {
    await syncTimetableSlotsForSubjects(tx, { schoolId: user.schoolId, campusId: existing.campusId }, [id], subject.teacherId);
    await recordTeachingAssignment(tx, user, { campusId: existing.campusId, classId: subject.classId, subjectId: id, teacherId: subject.teacherId, from });
  }
  await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "subject", recordId: id, oldValue: { name: existing.name, code: existing.code, teacherId: existing.teacherId, archivedAt: existing.archivedAt }, newValue: { name: subject.name, code: subject.code, isElective: subject.isElective, archivedAt: subject.archivedAt, teacherId: subject.teacherId, totalMarks: subject.totalMarks, effectiveFrom: from.toISOString().slice(0, 10) }, userId: user.userId } });
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
    const subject = await tx.subject.findFirst({ where: { id, ...scope, campusId: located.campusId }, include: { _count: { select: { marks: true, exams: true, examSchedules: true } } } });
    if (!subject) throw new ApiError("Subject not found", 404);
    if (subject._count.marks > 0) throw new ApiError("Subjects with marks cannot be deleted. Archive it instead to keep its history.", 409);
    // SKO-462: deleting would turn a single-subject exam into an all-subjects one and drop its schedule.
    if (subject._count.exams > 0 || subject._count.examSchedules > 0) throw new ApiError(`This subject is used by ${subject._count.exams} exam(s) and ${subject._count.examSchedules} exam schedule(s). Archive it instead, or remove or move them first.`, 409);
    await requireScheduleEdit(tx, user, subject.campusId, [id], grants);
    const timetables = await tx.timetableSlot.findMany({ where: { subjectId: id, schoolId: user.schoolId }, select: { timetableId: true } });
    await recordTeachingAssignment(tx, user, { campusId: subject.campusId, classId: subject.classId, subjectId: id, teacherId: null, from: effectiveDate(undefined) });
    await tx.subject.delete({ where: { id } });
    if (timetables.length) await tx.timetable.updateMany({ where: { id: { in: timetables.map(slot => slot.timetableId) }, schoolId: user.schoolId, campusId: subject.campusId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "subject", recordId: id, oldValue: { name: subject.name, deleted: true }, userId: user.userId } });
  });
}

/**
 * SKAI-150: allocate teachers to many subjects of one campus at once. Preview returns load and specialty warnings and
 * writes nothing; commit applies every row in one SERIALIZABLE transaction, so a clash, stale row or denied teacher
 * leaves no allocation half-applied.
 */
export async function planTeacherAllocations(user: AuthUser, campusId: string, rows: AllocationRequest[], options: { effectiveFrom?: unknown; preview: boolean }) {
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, campusId);
    const grants = await authorizeAssignment(tx, user, "exams");
    const subjects = await tx.subject.findMany({ where: { id: { in: rows.map(r => r.subjectId) }, schoolId: user.schoolId, campusId }, select: { id: true, name: true, teacherId: true, archivedAt: true, _count: { select: { timetableSlots: true } } } });
    if (subjects.length !== rows.length) throw new ApiError("A subject is outside this school or campus", 404);
    const byId = new Map(subjects.map(s => [s.id, s]));
    for (const row of rows) assertTeacherCurrent(row.expectedTeacherId, byId.get(row.subjectId)!.teacherId);
    const changes = rows.filter(r => byId.get(r.subjectId)!.teacherId !== r.teacherId);
    const inUse = changes.filter(r => byId.get(r.subjectId)!._count.timetableSlots > 0).length;
    if (!options.preview) {
      // Each row re-checks its teacher, clash and timetable rights; the actor's grants were read once above.
      const results = [];
      for (const row of changes) results.push((await updateSubjectWithTeacherAssignmentTx(tx, user, { id: row.subjectId, teacherId: row.teacherId, ...(options.effectiveFrom ? { effectiveFrom: options.effectiveFrom } : {}) }, campusId, grants)).subject);
      return { preview: false, changes: changes.length, unchanged: rows.length - changes.length, scheduledSubjects: inUse, capacity: null, warnings: [], results };
    }
    const teacherIds = [...new Set(rows.map(r => r.teacherId).filter((id): id is string => !!id))];
    const [teachers, periods, locale] = await Promise.all([
      tx.user.findMany({ where: { id: { in: teacherIds }, schoolId: user.schoolId, campusId, role: "TEACHER", isActive: true }, select: { id: true, fullName: true, subjectSpecialties: true, teachesAllSubjects: true, _count: { select: { timetableSlots: { where: { slotType: "CLASS" } } } } } }),
      tx.periodDefinition.count({ where: { schoolId: user.schoolId, campusId, timeType: "CLASS" } }),
      getLocalePackage(user.schoolId, campusId, new Date(), null, tx),
    ]);
    if (teachers.length !== teacherIds.length) throw new ApiError("Teacher is not active in this campus", 400);
    const capacity = weeklyPeriodCapacity(periods, locale.weekend.length);
    const warnings = allocationWarnings(
      rows.map(r => { const s = byId.get(r.subjectId)!; return { subjectId: s.id, subjectName: s.name, teacherId: r.teacherId, currentTeacherId: s.teacherId, scheduledPeriods: s._count.timetableSlots }; }),
      new Map(teachers.map(t => [t.id, { fullName: t.fullName, subjectSpecialties: t.subjectSpecialties, teachesAllSubjects: t.teachesAllSubjects, weeklyPeriods: t._count.timetableSlots }])),
      capacity,
    );
    return { preview: true, changes: changes.length, unchanged: rows.length - changes.length, scheduledSubjects: inUse, capacity, warnings, results: [] };
  });
}
