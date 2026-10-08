import { randomUUID } from "node:crypto";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageOperations } from "@/lib/api/scope";
import { isFamily, studentScope } from "@/lib/auth/policy";
import type { AuthUser } from "@/lib/auth";

export function dateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError("Use an unambiguous YYYY-MM-DD effective date", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new ApiError("Invalid effective date", 400);
  return date;
}
export async function assertRegistrar(user: AuthUser) {
  if (!canManageOperations(user)) throw new ApiError("Only authorized registrars manage enrollments", 403);
  await assertPermission(user, "students", "edit");
}
export async function readPupil(user: AuthUser, id: string) {
  if (!isFamily(user)) await assertPermission(user, "students", "view");
  const pupil = await prisma.student.findFirst({ where: { id, ...studentScope(user) }, select: {
    id: true, admissionNo: true, fullName: true, campusId: true, classId: true, rollNo: true, status: true,
    profileImageUrl: true, category: { select: { name: true } }, group: { select: { name: true } },
    consolidatedIntoId: true,
    enrollments: { orderBy: { startDate: "desc" }, include: { _count: { select: { attendance: true, invoices: true, reports: isFamily(user) ? { where: { status: { in: ["PUBLISHED", "SENT"] } } } : true } } } },
  } });
  if (!pupil) throw new ApiError("Pupil not found", 404);
  return pupil;
}
export async function enrollmentImpact(tx: TxClient, studentId: string, fromId: string, targetClassId: string, effectiveDate: Date, allowFuture = false) {
  const [pupil, from, target] = await Promise.all([
    tx.student.findFirst({ where: { id: studentId } }),
    tx.studentEnrollment.findFirst({ where: { id: fromId, studentId, endDate: null, status: "ACTIVE" } }),
    tx.class.findFirst({ where: { id: targetClassId, status: "ACTIVE" }, include: { campus: true, _count: { select: { students: true } } } }),
  ]);
  if (!pupil || !from || !target || pupil.consolidatedIntoId) throw new ApiError("Placement changed or is unavailable. Reload the pupil record.", 409);
  if (from.classId !== pupil.classId || from.campusId !== pupil.campusId) throw new ApiError("Current placement needs reconciliation", 409);
  if (effectiveDate <= from.startDate) throw new ApiError("Effective date overlaps the current enrollment start", 409);
  if (!allowFuture && effectiveDate > new Date()) throw new ApiError("Future transitions may be saved as proposals; confirm on their effective date", 409);
  const [attendance, reports, invoices, conflicts] = await Promise.all([
    tx.attendance.count({ where: { studentId, enrollmentId: fromId } }),
    tx.reportCard.count({ where: { studentId, enrollmentId: fromId } }),
    tx.invoice.count({ where: { studentId, enrollmentId: fromId } }),
    tx.attendance.count({ where: { studentId, date: { gte: effectiveDate } } }),
  ]);
  if (conflicts) throw new ApiError("Attendance already exists on or after this date. Choose a later boundary; history will not be moved.", 409);
  const downstream = await Promise.all([
    tx.invoice.count({ where: { studentId, enrollmentId: fromId, invoiceDate: { gte: effectiveDate } } }),
    tx.reportCard.count({ where: { studentId, enrollmentId: fromId, generatedAt: { gte: effectiveDate } } }),
  ]);
  if (downstream.some(Boolean)) throw new ApiError("Reports or invoices already exist after this date. Choose a later boundary.", 409);
  return { pupil, from, target, preserved: { attendance, reports, invoices }, targetOccupancy: target._count.students,
    guardianAccess: "Existing explicit guardian links remain unchanged; no new guardian is linked by name.",
    capacity: "Capacity must be checked separately before confirmation.", policy: "ONE_ENROLLMENT_PER_PUPIL; end date is exclusive" };
}
export async function applyEnrollment(tx: TxClient, input: { studentId: string; fromId: string; targetClassId: string; effectiveDate: Date; rollNo: string; actorId: string; reason: string }) {
  const impact = await enrollmentImpact(tx, input.studentId, input.fromId, input.targetClassId, input.effectiveDate);
  const { pupil, from, target } = impact;
  if (!input.rollNo.trim()) throw new ApiError("Roll number is required", 400);
  await tx.studentEnrollment.update({ where: { id: from.id }, data: { endDate: input.effectiveDate, status: "ENDED" } });
  const enrollment = await tx.studentEnrollment.create({ data: {
    id: randomUUID(), studentId: pupil.id, campusId: target.campusId, classId: target.id,
    campusName: target.campus.name, className: [target.name, target.section].filter(Boolean).join(" "),
    curriculum: target.campus.board || "Unspecified", academicYear: target.academicYear, rollNo: input.rollNo.trim(), startDate: input.effectiveDate,
  } });
  await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${pupil.id}, true)`;
  await tx.student.update({ where: { id: pupil.id }, data: { classId: target.id, campusId: target.campusId, rollNo: input.rollNo.trim(),
    ...(pupil.campusId !== target.campusId ? { categoryId: null, groupId: null, transportRouteId: null, dormRoomId: null } : {}) } });
  await tx.studentTimelineEvent.create({ data: { studentId: pupil.id, kind: "ENROLLMENT_TRANSITION", title: `Enrollment: ${enrollment.className}`,
    detail: JSON.stringify({ fromEnrollmentId: from.id, enrollmentId: enrollment.id, effectiveDate: input.effectiveDate.toISOString().slice(0,10), reason: input.reason, preserved: impact.preserved }), actorId: input.actorId } });
  await tx.auditLog.create({ data: { tableName: "student_enrollments", recordId: enrollment.id, userId: input.actorId,
    oldValue: { enrollmentId: from.id }, newValue: { enrollmentId: enrollment.id, reason: input.reason, preserved: impact.preserved } } });
  return { enrollment, preserved: impact.preserved };
}
