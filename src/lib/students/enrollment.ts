import { randomUUID } from "node:crypto";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, assertPermission, canManageCampusOps } from "@/lib/api/scope";
import { isFamily, publishedReportsWhere, studentScope } from "@/lib/auth/policy";
import type { AuthUser } from "@/lib/auth";
import { isInstitutionAuthority } from "@/lib/auth/institution";

export function dateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError("Use an unambiguous YYYY-MM-DD effective date", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new ApiError("Invalid effective date", 400);
  return date;
}
export async function assertRegistrar(user: AuthUser) {
  if (!canManageCampusOps(user)) throw new ApiError("Only authorized registrars manage enrollments", 403);
  await assertPermission(user, "students", "edit");
}
/** SKAI-170: active pupils in a class against its optional capacity (null = no limit set). */
export async function classSeats(tx: TxClient, cls: { id: string; capacity: number | null }) {
  const occupied = await tx.student.count({ where: { classId: cls.id, archivedAt: null, status: "active" } });
  return { occupied, capacity: cls.capacity, free: cls.capacity == null ? null : Math.max(cls.capacity - occupied, 0) };
}
/**
 * SKAI-1927: a new admission takes a seat, so each destination class must have room for every pupil this
 * request adds to it. Restore and transfer enforce the same rule; without it, an over-capacity admission
 * could never be restored once archived. Callers hold the campus/class lock so concurrent admissions serialize.
 */
export async function assertAdmissionSeats(tx: TxClient, schoolId: string, classIds: string[]) {
  const incoming = new Map<string, number>();
  for (const id of classIds) incoming.set(id, (incoming.get(id) ?? 0) + 1);
  const classes = await tx.class.findMany({ where: { id: { in: [...incoming.keys()] }, schoolId }, select: { id: true, name: true, section: true, capacity: true } });
  for (const cls of classes) {
    if (cls.capacity == null) continue;
    const seats = await classSeats(tx, cls);
    const adding = incoming.get(cls.id) ?? 0;
    if (seats.occupied + adding > cls.capacity) {
      const label = cls.section ? `${cls.name} ${cls.section}` : cls.name;
      throw new ApiError(`${label} is full (${seats.occupied} of ${cls.capacity} seats${adding > 1 ? `, ${adding} pupils to add` : ""}). Raise its capacity or choose another class.`, 409);
    }
  }
}
/** Only the institution authority (or super admin) may place a pupil in another campus's class. */
export function canPlaceAcrossCampuses(user: AuthUser) {
  return user.role === "SUPER_ADMIN" || isInstitutionAuthority(user);
}
/**
 * SKAI-170: the rules a registrar's single-pupil placement must meet before preview, proposal and
 * confirmation: a different class, inside the registrar's campus, with a free seat for `incoming`.
 */
export async function assertPlacementTarget(tx: TxClient, user: AuthUser, current: { classId: string; campusId: string }, target: { id: string; campusId: string; capacity: number | null }, incoming = 1) {
  if (target.id === current.classId) throw new ApiError("The pupil is already in this class. Choose a different class.", 409);
  // SKAI-1634: cross-campus placement never crosses schools, whatever the caller's authority.
  const ownCampus = await tx.campus.findFirst({ where: { id: target.campusId, schoolId: user.schoolId }, select: { id: true } });
  if (!ownCampus) throw new ApiError("Class not found", 404);
  if (target.campusId !== current.campusId && !canPlaceAcrossCampuses(user)) throw new ApiError("That class is in another campus. Ask the school administrator to transfer the pupil.", 403);
  if (target.campusId !== user.campusId && !canPlaceAcrossCampuses(user)) throw new ApiError("That class is outside your campus.", 403);
  const seats = await classSeats(tx, target);
  if (seats.capacity != null && seats.occupied + incoming > seats.capacity) {
    throw new ApiError(`The target class is full (${seats.occupied} of ${seats.capacity} seats). Raise its capacity or choose another class.`, 409);
  }
  return seats;
}
/** Counts and rows must share the same field-specific authority and publication rule. */
export function enrollmentHistoryWhere(user: AuthUser) {
  return {
    attendance: { student: studentScope(user, "attendance") },
    invoices: { student: studentScope(user, "finances") },
    reports: { student: studentScope(user, "learningRecords"), ...(isFamily(user) ? publishedReportsWhere : {}) },
  };
}
export async function readPupil(user: AuthUser, id: string) {
  if (!isFamily(user)) await assertPermission(user, "students", "view");
  const history = enrollmentHistoryWhere(user);
  const pupil = await prisma.student.findFirst({ where: { id, ...studentScope(user) }, select: {
    id: true, admissionNo: true, fullName: true, campusId: true, classId: true, rollNo: true, status: true,
    profileImageUrl: true, category: { select: { name: true } }, group: { select: { name: true } },
    consolidatedIntoId: true,
    // SKAI-171: same-day placements (corrections, readmission) need a fixed order: open placement first, then latest end, then id.
    enrollments: { orderBy: [{ startDate: "desc" }, { endDate: { sort: "desc", nulls: "first" } }, { id: "desc" }] },
  } });
  if (!pupil) throw new ApiError("Pupil not found", 404);
  // SKAI-1967: a filtered relation _count makes Prisma aggregate the whole campus's history before joining,
  // so count only this pupil's enrollments (enrollment_id is indexed on all three tables), same filters as before.
  const ids = pupil.enrollments.map((e) => e.id);
  const [attendance, invoices, reports] = ids.length ? await Promise.all([
    prisma.attendance.groupBy({ by: ["enrollmentId"], where: { enrollmentId: { in: ids }, ...history.attendance }, _count: { _all: true } }),
    prisma.invoice.groupBy({ by: ["enrollmentId"], where: { enrollmentId: { in: ids }, ...history.invoices }, _count: { _all: true } }),
    prisma.reportCard.groupBy({ by: ["enrollmentId"], where: { enrollmentId: { in: ids }, ...history.reports }, _count: { _all: true } }),
  ]) : [[], [], []];
  const byEnrollment = (rows: { enrollmentId: string | null; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.enrollmentId, r._count._all]));
  const counts = { attendance: byEnrollment(attendance), invoices: byEnrollment(invoices), reports: byEnrollment(reports) };
  return { ...pupil, enrollments: pupil.enrollments.map((e) => ({ ...e, _count: {
    attendance: counts.attendance.get(e.id) ?? 0, invoices: counts.invoices.get(e.id) ?? 0, reports: counts.reports.get(e.id) ?? 0,
  } })) };
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
    guardianAccess: "Existing explicit guardian links remain unchanged. The pupil login follows a campus transfer and must sign in again; no guardian is linked by name.",
    capacity: "Capacity is checked against the target class limit when the change is previewed, saved and confirmed.", policy: "ONE_ENROLLMENT_PER_PUPIL; end date is exclusive" };
}
/** SKAI-172: a placement's roll number must be free among the target campus's current pupils (same rule as readmission). */
export async function assertRollNoFree(tx: TxClient, studentId: string, campusId: string, rollNo: string) {
  if (await tx.student.findFirst({ where: { id: { not: studentId }, campusId, rollNo: rollNo.trim(), archivedAt: null }, select: { id: true } })) {
    throw new ApiError("This roll number already belongs to a pupil in the campus. Choose another roll number.", 409);
  }
}
export async function applyEnrollment(tx: TxClient, input: { studentId: string; fromId: string; targetClassId: string; effectiveDate: Date; rollNo: string; actorId: string; reason: string }) {
  const impact = await enrollmentImpact(tx, input.studentId, input.fromId, input.targetClassId, input.effectiveDate);
  const { pupil, from, target } = impact;
  if (!input.rollNo.trim()) throw new ApiError("Roll number is required", 400);
  await assertRollNoFree(tx, pupil.id, target.campusId, input.rollNo);
  await tx.studentEnrollment.update({ where: { id: from.id }, data: { endDate: input.effectiveDate, status: "ENDED" } });
  const enrollment = await tx.studentEnrollment.create({ data: {
    id: randomUUID(), studentId: pupil.id, campusId: target.campusId, classId: target.id,
    campusName: target.campus.name, className: [target.name, target.section].filter(Boolean).join(" "),
    curriculum: target.campus.board || "Unspecified", academicYear: target.academicYear, rollNo: input.rollNo.trim(), startDate: input.effectiveDate,
  } });
  await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${pupil.id}, true)`;
  await tx.student.update({ where: { id: pupil.id }, data: { classId: target.id, campusId: target.campusId, rollNo: input.rollNo.trim(),
    ...(pupil.campusId !== target.campusId ? { categoryId: null, groupId: null, transportRouteId: null, dormRoomId: null } : {}) } });
  if (pupil.studentUserId && pupil.campusId !== target.campusId) {
    // A pupil login follows the reviewed placement; a guardian may have other
    // children at the former campus and must not be moved implicitly.
    await tx.user.update({ where: { id: pupil.studentUserId, role: "STUDENT" }, data: { campusId: target.campusId, accessVersion: { increment: 1 } } });
    await tx.loginSession.updateMany({ where: { userId: pupil.studentUserId, isActive: true }, data: { isActive: false, logoutAt: new Date() } });
  }
  await tx.studentTimelineEvent.create({ data: { studentId: pupil.id, kind: "ENROLLMENT_TRANSITION", title: `Enrollment: ${enrollment.className}`,
    detail: JSON.stringify({ fromEnrollmentId: from.id, enrollmentId: enrollment.id, effectiveDate: input.effectiveDate.toISOString().slice(0,10), reason: input.reason, preserved: impact.preserved }), actorId: input.actorId } });
  await tx.auditLog.create({ data: { tableName: "student_enrollments", recordId: enrollment.id, userId: input.actorId,
    oldValue: { enrollmentId: from.id }, newValue: { enrollmentId: enrollment.id, reason: input.reason, preserved: impact.preserved } } });
  return { enrollment, preserved: impact.preserved };
}

/** Withdrawal closes placement at a reviewed boundary; original sources remain immutable. */
export async function withdrawalImpact(tx: TxClient, studentId: string, effectiveDate: Date) {
  const pupil = await tx.student.findFirst({ where: { id: studentId, archivedAt: null, status: "active", consolidatedIntoId: null } });
  const from = await tx.studentEnrollment.findFirst({ where: { studentId, endDate: null, status: "ACTIVE" } });
  if (!pupil || !from || from.classId !== pupil.classId || from.campusId !== pupil.campusId) throw new ApiError("Current placement needs reconciliation before withdrawal.", 409);
  if (effectiveDate <= from.startDate || effectiveDate > new Date()) throw new ApiError("Withdrawal must be after the current enrollment began and no later than today.", 409);
  const [attendance, reports, invoices, futureAttendance, futureReports, futureInvoices] = await Promise.all([
    tx.attendance.count({ where: { studentId, enrollmentId: from.id } }), tx.reportCard.count({ where: { studentId, enrollmentId: from.id } }), tx.invoice.count({ where: { studentId, enrollmentId: from.id } }),
    tx.attendance.count({ where: { studentId, date: { gte: effectiveDate } } }), tx.reportCard.count({ where: { studentId, enrollmentId: from.id, generatedAt: { gte: effectiveDate } } }), tx.invoice.count({ where: { studentId, enrollmentId: from.id, invoiceDate: { gte: effectiveDate } } }),
  ]);
  if (futureAttendance || futureReports || futureInvoices) throw new ApiError("Attendance, invoices or reports already exist on or after this date. Choose a later withdrawal boundary.", 409);
  return { pupil, from, preserved: { attendance, reports, invoices } };
}
export async function applyWithdrawal(tx: TxClient, input: { studentId: string; effectiveDate: Date; actorId: string; reason: string; outcome?: "WITHDRAWN" | "GRADUATED" | "TRANSFERRED" }) {
  const impact = await withdrawalImpact(tx, input.studentId, input.effectiveDate);
  const outcome = input.outcome ?? "WITHDRAWN";
  await tx.studentEnrollment.update({ where: { id: impact.from.id }, data: { endDate: input.effectiveDate, status: outcome } });
  await tx.student.update({ where: { id: input.studentId }, data: { status: "archived", archivedAt: input.effectiveDate, archiveReason: input.reason } });
  if (impact.pupil.studentUserId) {
    await tx.user.updateMany({ where: { id: impact.pupil.studentUserId, role: "STUDENT" }, data: { isActive: false, accessVersion: { increment: 1 } } });
    await tx.loginSession.updateMany({ where: { userId: impact.pupil.studentUserId, isActive: true }, data: { isActive: false, logoutAt: new Date() } });
  }
  await tx.studentTimelineEvent.create({ data: { studentId: input.studentId, kind: outcome, title: outcome === "GRADUATED" ? "Graduated" : outcome === "TRANSFERRED" ? "Transferred out" : "Enrollment withdrawn", detail: JSON.stringify({ enrollmentId: impact.from.id, effectiveDate: input.effectiveDate.toISOString().slice(0, 10), reason: input.reason, preserved: impact.preserved }), actorId: input.actorId } });
  await tx.auditLog.create({ data: { tableName: "student_enrollments", recordId: impact.from.id, userId: input.actorId, oldValue: { status: "ACTIVE" }, newValue: { status: outcome, effectiveDate: input.effectiveDate.toISOString(), reason: input.reason, preserved: impact.preserved } } });
  return impact;
}

/**
 * SKAI-1470: bulk graduation closes each pupil's open placement as GRADUATED at the boundary, archives the
 * pupil, revokes the student login and sessions, and writes timeline plus audit evidence. A pupil whose
 * latest placement is already GRADUATED is "unchanged"; one with no open placement needs reconciliation.
 * Run inside one transaction so a refusal for any pupil leaves every selected pupil untouched.
 */
export async function applyGraduation(tx: TxClient, input: { studentId: string; effectiveDate: Date; actorId: string; reason: string }): Promise<"changed" | "unchanged"> {
  const pupil = await tx.student.findFirst({ where: { id: input.studentId, consolidatedIntoId: null } });
  if (!pupil) throw new ApiError("Pupil not found", 404);
  const from = await tx.studentEnrollment.findFirst({ where: { studentId: pupil.id, endDate: null, status: "ACTIVE" } });
  if (!from) {
    const last = await tx.studentEnrollment.findFirst({ where: { studentId: pupil.id, endDate: { not: null } }, orderBy: { endDate: "desc" } });
    if (last?.status === "GRADUATED") return "unchanged";
    throw new ApiError("A selected pupil has no open placement to graduate. Reconcile their enrolment; nobody was graduated.", 409);
  }
  if (input.effectiveDate <= from.startDate || input.effectiveDate > new Date()) throw new ApiError("Graduation must be after the current enrollment began and no later than today; nobody was graduated.", 409);
  // Claim the open placement; a concurrent graduation of the same pupil finds nothing left to close.
  const claimed = await tx.studentEnrollment.updateMany({ where: { id: from.id, endDate: null, status: "ACTIVE" }, data: { endDate: input.effectiveDate, status: "GRADUATED" } });
  if (claimed.count !== 1) return "unchanged";
  await tx.student.update({ where: { id: pupil.id }, data: { status: "graduated", archivedAt: pupil.archivedAt ?? input.effectiveDate, archiveReason: pupil.archiveReason ?? input.reason } });
  if (pupil.studentUserId) {
    await tx.user.updateMany({ where: { id: pupil.studentUserId, role: "STUDENT" }, data: { isActive: false, accessVersion: { increment: 1 } } });
    await tx.loginSession.updateMany({ where: { userId: pupil.studentUserId, isActive: true }, data: { isActive: false, logoutAt: new Date() } });
  }
  await tx.studentTimelineEvent.create({ data: { studentId: pupil.id, kind: "GRADUATED", title: "Graduated", detail: JSON.stringify({ enrollmentId: from.id, effectiveDate: input.effectiveDate.toISOString().slice(0, 10), reason: input.reason }), actorId: input.actorId } });
  await tx.auditLog.create({ data: { tableName: "student_enrollments", recordId: from.id, userId: input.actorId, oldValue: { status: "ACTIVE" }, newValue: { status: "GRADUATED", effectiveDate: input.effectiveDate.toISOString(), reason: input.reason } } });
  return "changed";
}

/**
 * SKAI-1387: re-admits a withdrawn pupil into a live class at the campus they left. Reopens placement,
 * the student login and the timeline; graduated or transferred pupils are not re-admitted here.
 */
export async function applyReadmission(tx: TxClient, input: { studentId: string; targetClassId: string; rollNo: string; effectiveDate: Date; actorId: string; reason: string }) {
  const pupil = await tx.student.findFirst({ where: { id: input.studentId, archivedAt: { not: null }, consolidatedIntoId: null } });
  if (!pupil) throw new ApiError("Only an archived pupil can be re-admitted.", 409);
  if (await tx.studentEnrollment.findFirst({ where: { studentId: pupil.id, endDate: null, status: "ACTIVE" }, select: { id: true } })) throw new ApiError("This pupil already has an open placement.", 409);
  const last = await tx.studentEnrollment.findFirst({ where: { studentId: pupil.id, endDate: { not: null } }, orderBy: { endDate: "desc" } });
  if (!last?.endDate || last.status !== "WITHDRAWN") throw new ApiError("Only a withdrawn pupil can be re-admitted. Graduated or transferred pupils are placed through enrolment.", 409);
  if (input.effectiveDate < last.endDate || input.effectiveDate > new Date()) throw new ApiError("Re-admission must fall between the withdrawal date and today.", 409);
  const target = await tx.class.findFirst({ where: { id: input.targetClassId, schoolId: pupil.schoolId, status: "ACTIVE", archivedAt: null, campusId: last.campusId }, include: { campus: true } });
  if (!target || target.campus.archivedAt || target.campus.pausedAt) throw new ApiError("Choose an active class on the pupil's former campus.", 409);
  const seats = await classSeats(tx, target);
  if (seats.capacity != null && seats.occupied + 1 > seats.capacity) throw new ApiError(`The class is full (${seats.occupied} of ${seats.capacity} seats).`, 409);
  if (await tx.student.findFirst({ where: { id: { not: pupil.id }, campusId: target.campusId, rollNo: input.rollNo, archivedAt: null }, select: { id: true } })) throw new ApiError("This roll number already belongs to a pupil in the campus.", 409);
  const enrollment = await tx.studentEnrollment.create({ data: {
    id: randomUUID(), studentId: pupil.id, campusId: target.campusId, classId: target.id,
    campusName: target.campus.name, className: [target.name, target.section].filter(Boolean).join(" "),
    curriculum: target.campus.board || "Unspecified", academicYear: target.academicYear, rollNo: input.rollNo, startDate: input.effectiveDate, origin: "READMITTED",
  } });
  await tx.$executeRaw`SELECT set_config('app.enrollment_reviewed', ${pupil.id}, true)`;
  await tx.student.update({ where: { id: pupil.id }, data: { archivedAt: null, archiveReason: null, status: "active", classId: target.id, campusId: target.campusId, rollNo: input.rollNo } });
  if (pupil.studentUserId) await tx.user.updateMany({ where: { id: pupil.studentUserId, role: "STUDENT" }, data: { isActive: true, accessVersion: { increment: 1 } } });
  await tx.studentTimelineEvent.create({ data: { studentId: pupil.id, kind: "READMITTED", title: "Re-admitted", detail: JSON.stringify({ enrollmentId: enrollment.id, effectiveDate: input.effectiveDate.toISOString().slice(0, 10), reason: input.reason }), actorId: input.actorId } });
  await tx.auditLog.create({ data: { tableName: "student_enrollments", recordId: enrollment.id, userId: input.actorId, oldValue: { status: "WITHDRAWN" }, newValue: { status: "ACTIVE", readmittedFrom: last.id, reason: input.reason } } });
  return { enrollment };
}
