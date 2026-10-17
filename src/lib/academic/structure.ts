import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";

// SKO-462: one place for the academic-structure rules every write path shares — identity of an
// active class and of a subject, effective-dated teaching assignments, and the impact of a change.

export const normalizeName = (value: string | null | undefined) => (value ?? "").normalize("NFKC").trim().toLowerCase();

/** Duplicate active class identity, compared the way the database index compares it. Returns the conflicting id. */
export async function findDuplicateClass(tx: TxClient, scope: { schoolId: string; campusId: string }, identity: { name: string; section: string | null; academicYear: number }, excludeId?: string) {
  const rows = await tx.class.findMany({ where: { schoolId: scope.schoolId, campusId: scope.campusId, academicYear: identity.academicYear, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, name: true, section: true } });
  return rows.find(row => normalizeName(row.name) === normalizeName(identity.name) && normalizeName(row.section) === normalizeName(identity.section)) ?? null;
}

export async function findDuplicateSubject(tx: TxClient, classId: string, name: string, excludeId?: string) {
  const rows = await tx.subject.findMany({ where: { classId, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, name: true } });
  return rows.find(row => normalizeName(row.name) === normalizeName(name)) ?? null;
}

/** A unique-index violation raised at commit by a concurrent create, translated to the same 409. */
export function isIdentityConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return true;
  const message = error instanceof Error ? error.message : "";
  return /classes_active_identity_key|subjects_class_name_key/.test(message);
}

/** The effective date of an assignment change: the given ISO date, or today. */
export function effectiveDate(value: unknown) {
  if (value === undefined || value === null || value === "") return new Date(new Date().toISOString().slice(0, 10));
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError("Give the effective date as YYYY-MM-DD.", 400);
  return new Date(value);
}

/**
 * Closes the open assignment for this class role or subject and opens the new one from `from`.
 * A same-teacher write is a no-op, so retries and unrelated edits never fragment the history.
 */
export async function recordTeachingAssignment(tx: TxClient, user: AuthUser, input: { campusId: string; classId: string; subjectId: string | null; teacherId: string | null; from: Date }) {
  const role = input.subjectId ? "SUBJECT_TEACHER" : "CLASS_TEACHER";
  const open = await tx.teachingAssignment.findFirst({ where: { schoolId: user.schoolId, classId: input.classId, subjectId: input.subjectId, role, effectiveTo: null } });
  if ((open?.teacherId ?? null) === input.teacherId) return open;
  if (open) {
    if (input.from < open.effectiveFrom) throw new ApiError("The effective date is before the current assignment started.", 409);
    await tx.teachingAssignment.update({ where: { id: open.id }, data: { effectiveTo: input.from } });
  }
  if (!input.teacherId) return null;
  return tx.teachingAssignment.create({ data: { schoolId: user.schoolId, campusId: input.campusId, classId: input.classId, subjectId: input.subjectId, role, teacherId: input.teacherId, effectiveFrom: input.from, createdById: user.userId } });
}

/** What a change to a class or subject touches, counted before the change is confirmed. */
export async function academicImpact(tx: TxClient, user: AuthUser, kind: "class" | "subject", id: string) {
  if (kind === "class") {
    const cls = await tx.class.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, name: true, section: true, academicYear: true, archivedAt: true, classTeacherId: true } });
    if (!cls) throw new ApiError("Class not found", 404);
    const [students, subjects, attendance, exams, timetables, publishedTimetables, marks, history] = await Promise.all([
      tx.student.count({ where: { schoolId: user.schoolId, classId: id, archivedAt: null, status: "active" } }),
      tx.subject.count({ where: { schoolId: user.schoolId, classId: id } }),
      tx.attendance.count({ where: { classId: id } }),
      tx.exam.count({ where: { classId: id } }),
      tx.timetable.count({ where: { schoolId: user.schoolId, classId: id } }),
      tx.timetable.count({ where: { schoolId: user.schoolId, classId: id, status: "PUBLISHED" } }),
      tx.mark.count({ where: { subject: { classId: id } } }),
      tx.teachingAssignment.count({ where: { schoolId: user.schoolId, classId: id } }),
    ]);
    return { kind, id, label: `${cls.name}${cls.section ? ` ${cls.section}` : ""}`, archived: !!cls.archivedAt, counts: { students, subjects, attendance, exams, marks, timetables, publishedTimetables, assignmentHistory: history } };
  }
  const subject = await tx.subject.findFirst({ where: { id, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, name: true, classId: true, class: { select: { name: true, section: true } } } });
  if (!subject) throw new ApiError("Subject not found", 404);
  const [marks, exams, examSchedules, timetableSlots, syllabusTopics, students] = await Promise.all([
    tx.mark.count({ where: { subjectId: id } }),
    tx.exam.count({ where: { subjectId: id } }),
    tx.examSchedule.count({ where: { subjectId: id } }),
    tx.timetableSlot.count({ where: { schoolId: user.schoolId, subjectId: id } }),
    tx.syllabusTopic.count({ where: { subjectId: id } }),
    tx.student.count({ where: { schoolId: user.schoolId, classId: subject.classId, archivedAt: null, status: "active" } }),
  ]);
  return { kind, id, label: `${subject.name} · ${subject.class.name}${subject.class.section ? ` ${subject.class.section}` : ""}`, archived: false, counts: { students, marks, exams, examSchedules, timetableSlots, syllabusTopics } };
}
