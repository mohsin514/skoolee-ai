import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { examWeekday, getCampusExamReservations, termsOverlap } from "@/lib/academic/exam-bookings";
import { assertApprovalRole, assertSchoolAiAccess, assertWorkspacePermission, loadWorkspacePermissionSnapshot, resolveWorkspaceCampus, SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { schoolAiTransaction } from "./transaction";
import { applyAcademicLifecycle, applyPromotions, previewAcademicLifecycle, previewPromotions } from "./school-operations-lifecycle-service";
import type { LifecycleOptions } from "./school-operations-lifecycle";
import { applyTimetablePublication, previewTimetablePublication } from "./school-operations-publish-service";
import type { PublicationOptions } from "./school-operations-publish";
import { applyRiskDecision, previewRiskDecision } from "./school-operations-risk-service";
import { prepareTimetableSolver } from "./timetable-solver-service";
import { solveSchoolTimetable } from "./timetable-school-solver";
import { applyTimetableSetup, previewTimetableSetup } from "./timetable-setup-service";
import { operationDate, schoolOperationsProposalSchema, schoolTimetableSolveSchema, type AttendancePreview, type SchoolOperationsOperation, type SchoolOperationsPreview, type SchoolOperationsResult, type SubstitutePreview, type SchoolOperationsOptions } from "./school-operations";

type RecordWithCampus = SchoolAiRecord & { campusId: string };
const scopeFor = (user: AuthUser, campusId: string) => ({ schoolId: user.schoolId, campusId });
const fail = (message: string, code = "SCHOOL_OPERATIONS_CONFLICT", status = 409): never => { throw new SchoolAiError(message, status, code); };

export async function assertSchoolOperationsAccess(user: AuthUser, operation: SchoolOperationsOperation, tx: TxClient, campusId: string, write = true) {
  assertApprovalRole(user);
  await resolveWorkspaceCampus(user, campusId, tx);
  const actor = await tx.user.findFirst({ where: { schoolId: user.schoolId, id: user.userId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) fail("Your account access changed. Sign in again.", "PERMISSION_DENIED", 403);
  const permissions = await loadWorkspacePermissionSnapshot(user, tx);
  await assertSchoolAiAccess(user, "view", permissions);
  if (write) await assertSchoolAiAccess(user, "edit", permissions);
  if (operation === "operations.record_risk_decision") { await assertSchoolOperational(user.schoolId, tx); return; }
  const permissionModule = operation === "attendance.record_register" ? "attendance" : operation === "students.promote_enrollment" ? "students" : operation === "academics.transition_year" ? "exams" : "timetable";
  await assertWorkspacePermission(user, permissionModule, "view", permissions);
  if (write) await assertWorkspacePermission(user, permissionModule, ["timetable.publish_reviewed", "timetable.assign_substitutes", "academics.transition_year", "students.promote_enrollment"].includes(operation) ? "edit" : "add", permissions);
  if (operation === "attendance.record_register") await assertWorkspacePermission(user, "students", "view", permissions);
  await assertSchoolOperational(user.schoolId, tx);
}

export async function suggestSchoolTimetable(user: AuthUser, raw: unknown) {
  const input = schoolTimetableSolveSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    await assertSchoolOperationsAccess(user, "timetable.create_school_drafts", tx, input.campusId);
    const contexts = [];
    for (const cls of input.classes) contexts.push(await prepareTimetableSolver(user, { ...cls, campusId: input.campusId }, tx));
    if (new Set(contexts.map(cls => cls.academicYear)).size !== 1) fail("Choose classes in the same academic year.");
    const solution = solveSchoolTimetable(contexts, input.classes[0].term);
    return { ...solution, proposal: solution.status === "SOLVED" ? { operation: "timetable.create_school_drafts" as const, timetables: solution.timetables } : null, excludedRooms: contexts.map(cls => ({ classId: cls.classId, roomIds: cls.excludedRoomIds })) };
  });
}

export async function getSchoolOperationsOptions(user: AuthUser, campusId: string, operation: SchoolOperationsOperation, classId?: string | null, date?: string | null): Promise<SchoolOperationsOptions> {
  return schoolAiTransaction(user, async tx => {
    await assertSchoolOperationsAccess(user, operation, tx, campusId, false);
    if (operation === "operations.record_risk_decision") return { campusId, classes: [], students: [], teachers: [], lessons: [] };
    const scope = scopeFor(user, campusId), classes = await tx.class.findMany({ where: { ...scope, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }, { section: "asc" }], take: 501 });
    if (classes.length > 500) fail("Narrow the campus scope.", "SCHOOL_OPERATIONS_LIMIT");
    const result: SchoolOperationsOptions = { campusId, classes, students: [], teachers: [], lessons: [] };
    if (!date) return result;
    const validDate = operationDate.parse(date), instant = new Date(`${validDate}T00:00:00Z`);
    if (operation === "attendance.record_register" && classId) {
      await activeClass(user, campusId, classId, tx);
      const [students, previous] = await Promise.all([tx.student.findMany({ where: { ...scope, classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: [{ rollNo: "asc" }, { id: "asc" }], take: 251 }), tx.attendance.findMany({ where: { ...scope, classId, date: instant }, select: { studentId: true, status: true } })]);
      if (students.length > 250) fail("Choose a class with at most 250 pupils per register.", "SCHOOL_OPERATIONS_LIMIT");
      result.students = students.map(student => ({ ...student, previousStatus: previous.find(row => row.studentId === student.id)?.status ?? null }));
    }
    if (operation === "timetable.assign_substitutes") {
      const [teachers, lessons, duties, leave, exams] = await Promise.all([
        tx.user.findMany({ where: { ...scope, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1001 }),
        tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, dayOfWeek: examWeekday(date), slotType: "CLASS", teacherId: { not: null }, subjectId: { not: null }, timetable: { ...scope, status: "PUBLISHED", class: { archivedAt: null, status: "ACTIVE" } } }, include: { timetable: { include: { class: { select: { name: true, section: true } } } }, subject: { select: { name: true } }, teacher: { select: { fullName: true } } }, orderBy: [{ startTime: "asc" }, { id: "asc" }], take: 1001 }),
        tx.schoolAiSubstituteDuty.findMany({ where: { ...scope, date: instant, status: "ASSIGNED" } }),
        tx.leaveRequest.findMany({ where: { ...scope, status: "APPROVED", fromDate: { lt: new Date(instant.getTime() + 86400000) }, toDate: { gte: instant } }, select: { userId: true } }), getCampusExamReservations(tx, scope),
      ]);
      if (teachers.length > 1000 || lessons.length > 1000) fail("Narrow the campus scope.", "SCHOOL_OPERATIONS_LIMIT");
      result.teachers = teachers;
      result.lessons = lessons.map(slot => { const duty = duties.find(item => item.timetableSlotId === slot.id); return { id: slot.id, className: [slot.timetable.class.name, slot.timetable.class.section].filter(Boolean).join(" · "), subjectName: slot.subject!.name, teacherName: slot.teacher?.fullName ?? "", startTime: slot.startTime, endTime: slot.endTime, substituteId: duty?.teacherId ?? null, substituteName: teachers.find(item => item.id === duty?.teacherId)?.fullName ?? null, availableTeacherIds: teachers.filter(teacher => teacher.id !== slot.teacherId && !leave.some(item => item.userId === teacher.id) && !lessons.some(other => other.id !== slot.id && (duties.find(item => item.timetableSlotId === other.id)?.teacherId ?? other.teacherId) === teacher.id && other.timetable.academicYear === slot.timetable.academicYear && termsOverlap(other.timetable.term, slot.timetable.term) && other.startTime < slot.endTime && slot.startTime < other.endTime) && !exams.some(exam => exam.date.toISOString().slice(0, 10) === date && exam.rooms.some(room => room.invigilation?.teacherId === teacher.id) && (!exam.periodDefinition || exam.periodDefinition.startTime < slot.endTime && slot.startTime < exam.periodDefinition.endTime))).map(teacher => teacher.id) }; });
    }
    return result;
  });
}

async function activeClass(user: AuthUser, campusId: string, classId: string, tx: TxClient) {
  const cls = await tx.class.findFirst({ where: { ...scopeFor(user, campusId), id: classId, status: "ACTIVE", archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true } });
  if (!cls) fail("Choose an active class in this campus.", "SCHOOL_OPERATIONS_SCOPE");
  return cls!;
}
async function schoolDate(user: AuthUser, campusId: string, date: string, tx: TxClient, historical: boolean) {
  const instant = new Date(`${date}T00:00:00Z`), scope = scopeFor(user, campusId);
  const [locale, currentLocale, holiday] = await Promise.all([getLocalePackage(user.schoolId, campusId, instant, undefined, tx), getLocalePackage(user.schoolId, campusId, new Date(), undefined, tx), tx.holiday.findFirst({ where: { ...scope, fromDate: { lte: instant }, toDate: { gte: instant } }, select: { id: true } })]);
  if (locale.weekend.map(day => day || 7).includes(examWeekday(date)) || holiday) fail("Choose a working school day.", "SCHOOL_OPERATIONS_CALENDAR");
  const today = calendarDateIn(currentLocale.timezone);
  if (historical ? date > today : date < today) fail(historical ? "Attendance cannot be observed in the future." : "Choose today or a future date for substitute duties.", "SCHOOL_OPERATIONS_DATE");
  return { instant, locale };
}
export async function previewAttendance(user: AuthUser, record: Pick<RecordWithCampus, "id" | "version" | "campusId" | "data">, tx: TxClient): Promise<AttendancePreview> {
  const proposal = schoolOperationsProposalSchema.parse((record.data as { proposal: unknown }).proposal);
  if (proposal.operation !== "attendance.record_register") throw new Error("Attendance proposal required");
  const scope = scopeFor(user, record.campusId), cls = await activeClass(user, record.campusId, proposal.classId, tx);
  const { instant, locale } = await schoolDate(user, record.campusId, proposal.date, tx, true);
  const cycle = await tx.academicCycle.findFirst({ where: { ...scope, academicYear: cls.academicYear }, select: { status: true, startDate: true, endDate: true } });
  if (cycle && (!['ACTIVE', 'DRAFT'].includes(cycle.status) || cycle.startDate && instant < cycle.startDate || cycle.endDate && instant > cycle.endDate)) fail("This register is outside the editable academic year.", "SCHOOL_OPERATIONS_YEAR");
  const ids = proposal.entries.map(row => row.studentId);
  const [students, enrollments, previous] = await Promise.all([
    tx.student.findMany({ where: { ...scope, id: { in: ids }, classId: cls.id, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true }, orderBy: { id: "asc" } }),
    tx.studentEnrollment.findMany({ where: { ...scope, studentId: { in: ids }, classId: cls.id, origin: { not: { startsWith: "LEGACY" } }, startDate: { lte: instant }, OR: [{ endDate: null }, { endDate: { gt: instant } }] }, orderBy: { id: "asc" } }),
    tx.attendance.findMany({ where: { schoolId: user.schoolId, studentId: { in: ids }, date: instant }, orderBy: { studentId: "asc" } }),
  ]);
  if (students.length !== ids.length || ids.some(id => enrollments.filter(enrollment => enrollment.studentId === id).length !== 1)) fail("The selected pupils need verified enrollment in this class on the register date.", "SCHOOL_OPERATIONS_ENROLLMENT");
  if (previous.some(row => row.isLocked || row.campusId !== record.campusId || row.classId !== cls.id || row.enrollmentId !== enrollments.find(item => item.studentId === row.studentId)?.id)) fail("An existing register is locked or belongs to another enrollment.", "SCHOOL_OPERATIONS_REGISTER_LOCKED");
  if (previous.length) await assertWorkspacePermission(user, "attendance", "edit", await loadWorkspacePermissionSnapshot(user, tx));
  const entries = proposal.entries.map(row => { const student = students.find(item => item.id === row.studentId)!, old = previous.find(item => item.studentId === row.studentId); return { ...row, name: student.fullName, rollNo: student.rollNo, enrollmentId: enrollments.find(item => item.studentId === row.studentId)!.id, previousStatus: old?.status ?? null, attendanceId: old?.id ?? null }; });
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, classId: cls.id, className: [cls.name, cls.section].filter(Boolean).join(" · "), date: proposal.date, entries };
  return { ...preview, previewHash: workspaceRequestHash({ preview, previous, enrollments, cycle, weekend: locale.weekend }) };
}

export async function previewSchoolOperations(user: AuthUser, record: RecordWithCampus, tx: TxClient): Promise<SchoolOperationsPreview> {
  const proposal = schoolOperationsProposalSchema.parse((record.data as { proposal: unknown }).proposal);
  await assertSchoolOperationsAccess(user, proposal.operation, tx, record.campusId);
  if (proposal.operation === "timetable.publish_reviewed") return previewTimetablePublication(user, record, tx);
  if (proposal.operation === "operations.record_risk_decision") return previewRiskDecision(user, record, tx);
  if (proposal.operation === "academics.transition_year") return previewAcademicLifecycle(user, record, tx);
  if (proposal.operation === "students.promote_enrollment") return previewPromotions(user, record, tx);
  if (proposal.operation === "attendance.record_register") return previewAttendance(user, record, tx);
  if (proposal.operation === "timetable.assign_substitutes") return previewSubstitutes(user, record, tx);
  const timetables = [];
  for (const timetable of proposal.timetables) timetables.push(await previewTimetableSetup(user, { ...record, data: { proposal: timetable } as unknown as Prisma.JsonValue }, tx));
  const slots = timetables.flatMap(timetable => timetable.slots.map(slot => ({ ...slot, classId: timetable.classId })));
  for (const [index, slot] of slots.entries()) if (slot.slotType === "CLASS" && slots.slice(0, index).some(other => other.slotType === "CLASS" && slot.dayOfWeek === other.dayOfWeek && (slot.teacherId === other.teacherId || slot.roomId === other.roomId) && (slot.periodNumber === other.periodNumber || slot.startTime < other.endTime && other.startTime < slot.endTime))) fail("Two proposed classes reserve the same teacher or room.", "TIMETABLE_CLASH");
  if (timetables.some(timetable => timetable.warnings.length)) fail("Every selected room needs enough recorded capacity.", "SOLVER_CAPACITY");
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, timetables };
  return { ...preview, previewHash: workspaceRequestHash(preview) };
}

export async function lockSchoolOperations(user: AuthUser, campusId: string, tx: TxClient) { await lockTimetableCampus(tx, user.schoolId, campusId); }
export async function applySchoolOperations(user: AuthUser, preview: SchoolOperationsPreview, tx: TxClient): Promise<SchoolOperationsResult> {
  if (preview.operation === "timetable.publish_reviewed") return applyTimetablePublication(user, preview, tx);
  if (preview.operation === "operations.record_risk_decision") return applyRiskDecision(user, preview, tx);
  if (preview.operation === "academics.transition_year") return applyAcademicLifecycle(user, preview, tx);
  if (preview.operation === "students.promote_enrollment") return applyPromotions(user, preview, tx);
  const ids: string[] = [];
  if (preview.operation === "timetable.create_school_drafts") {
    for (const timetable of preview.timetables) ids.push((await applyTimetableSetup(user, timetable, tx)).timetableId);
  } else if (preview.operation === "attendance.record_register") {
    for (const row of preview.entries) {
      const data = { status: row.status, notes: row.note || null, markedBy: user.userId, markedAt: new Date() };
      if (row.attendanceId) {
        const changed = await tx.attendance.updateMany({ where: { id: row.attendanceId, schoolId: user.schoolId, campusId: preview.campusId, isLocked: false }, data });
        if (changed.count !== 1) fail("The register changed while saving.", "STALE_EXECUTION_PREVIEW");
        if (row.previousStatus !== row.status) await tx.attendanceEditHistory.create({ data: { schoolId: user.schoolId, attendanceId: row.attendanceId, oldStatus: row.previousStatus!, newStatus: row.status, editedBy: user.userId } });
        ids.push(row.attendanceId);
      } else ids.push((await tx.attendance.create({ data: { ...data, schoolId: user.schoolId, campusId: preview.campusId, classId: preview.classId, studentId: row.studentId, date: new Date(`${preview.date}T00:00:00Z`), enrollmentId: row.enrollmentId }, select: { id: true } })).id);
    }
  } else {
    for (const duty of preview.duties) {
      const lessonSnapshot = { classId: duty.classId, academicYear: duty.academicYear, term: duty.term, dayOfWeek: duty.dayOfWeek, periodNumber: duty.periodNumber, className: duty.className, subjectName: duty.subjectName, roomNumber: duty.roomNumber, startTime: duty.startTime, endTime: duty.endTime, originalTeacherName: duty.originalTeacherName, teacherName: duty.teacherName ?? duty.originalTeacherName };
      const result = await tx.schoolAiSubstituteDuty.upsert({ where: { schoolId_timetableSlotId_date: { schoolId: user.schoolId, timetableSlotId: duty.slotId, date: new Date(`${preview.date}T00:00:00Z`) } }, create: { schoolId: user.schoolId, campusId: preview.campusId, timetableSlotId: duty.slotId, date: new Date(`${preview.date}T00:00:00Z`), originalTeacherId: duty.originalTeacherId, teacherId: duty.teacherId ?? duty.originalTeacherId, reason: duty.reason, lessonSnapshot, status: duty.teacherId ? "ASSIGNED" : "CANCELLED", assignedById: user.userId }, update: { teacherId: duty.teacherId ?? duty.originalTeacherId, originalTeacherId: duty.originalTeacherId, reason: duty.reason, lessonSnapshot, status: duty.teacherId ? "ASSIGNED" : "CANCELLED", assignedById: user.userId, version: { increment: 1 } }, select: { id: true } }); ids.push(result.id);
    }
  }
  return { operation: preview.operation, ids, count: ids.length };
}

export async function getLifecycleOptions(user: AuthUser, campusId: string, operation: "academics.transition_year" | "students.promote_enrollment", classId?: string | null): Promise<LifecycleOptions> {
  return schoolAiTransaction(user, async tx => {
    await assertSchoolOperationsAccess(user, operation, tx, campusId, false);
    const scope = scopeFor(user, campusId);
    const [cycles, classes] = await Promise.all([tx.academicCycle.findMany({ where: scope, orderBy: { academicYear: "desc" }, take: 101 }), tx.class.findMany({ where: { ...scope, archivedAt: null }, select: { id: true, name: true, section: true, academicYear: true }, orderBy: [{ academicYear: "desc" }, { name: "asc" }], take: 501 })]);
    if (cycles.length > 100 || classes.length > 500) fail("Narrow the academic planning scope.", "SCHOOL_OPERATIONS_LIMIT");
    const students = operation === "students.promote_enrollment" && classId && classes.some(cls => cls.id === classId) ? await tx.student.findMany({ where: { ...scope, classId, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true, enrollments: { where: { schoolId: user.schoolId, campusId, classId, status: "ACTIVE", endDate: null }, select: { id: true, origin: true } } }, orderBy: [{ rollNo: "asc" }, { id: "asc" }], take: 251 }) : [];
    if (students.length > 250) fail("Choose a smaller promotion group.", "SCHOOL_OPERATIONS_LIMIT");
    return { cycles: cycles.map(cycle => ({ id: cycle.id, label: cycle.label, academicYear: cycle.academicYear, status: cycle.status, startDate: cycle.startDate?.toISOString().slice(0, 10) ?? null, endDate: cycle.endDate?.toISOString().slice(0, 10) ?? null })), classes: classes.map(cls => ({ id: cls.id, name: [cls.name, cls.section].filter(Boolean).join(" · "), academicYear: cls.academicYear })), students: students.map(student => ({ id: student.id, name: student.fullName, rollNo: student.rollNo, enrollmentId: student.enrollments.length === 1 && !student.enrollments[0].origin.startsWith("LEGACY") ? student.enrollments[0].id : null })) };
  });
}

async function previewSubstitutes(user: AuthUser, record: RecordWithCampus, tx: TxClient): Promise<SubstitutePreview> {
  const proposal = schoolOperationsProposalSchema.parse((record.data as { proposal: unknown }).proposal);
  if (proposal.operation !== "timetable.assign_substitutes") throw new Error("Substitute proposal required");
  const scope = scopeFor(user, record.campusId), { instant, locale } = await schoolDate(user, record.campusId, proposal.date, tx, false);
  const [slots, teachers, leaves, existing, lessons, exams, cycles] = await Promise.all([
    tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, id: { in: proposal.duties.map(item => item.slotId) }, dayOfWeek: examWeekday(proposal.date), slotType: "CLASS", timetable: { ...scope, status: "PUBLISHED", class: { status: "ACTIVE", archivedAt: null } } }, include: { timetable: { include: { class: { select: { name: true, section: true } } } }, subject: { select: { name: true } }, teacher: { select: { fullName: true } } }, orderBy: { id: "asc" } }),
    tx.user.findMany({ where: { ...scope, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } }, select: { id: true, fullName: true }, orderBy: { id: "asc" }, take: 1001 }),
    tx.leaveRequest.findMany({ where: { ...scope, status: "APPROVED", fromDate: { lt: new Date(instant.getTime() + 86400000) }, toDate: { gte: instant } }, orderBy: { id: "asc" } }),
    tx.schoolAiSubstituteDuty.findMany({ where: { ...scope, date: instant }, orderBy: { id: "asc" } }),
    tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, dayOfWeek: examWeekday(proposal.date), slotType: "CLASS", timetable: { ...scope, status: "PUBLISHED" } }, include: { timetable: { select: { academicYear: true, term: true } } }, orderBy: { id: "asc" }, take: 10001 }),
    getCampusExamReservations(tx, scope), tx.academicCycle.findMany({ where: scope, orderBy: { academicYear: "asc" } }),
  ]);
  if (slots.length !== proposal.duties.length || slots.some(slot => !slot.teacherId || !slot.subjectId) || teachers.length > 1000 || lessons.length > 10000) fail("Choose current published lessons with assigned teachers.", "SCHOOL_OPERATIONS_SCOPE");
  const overlap = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;
  const proposedBySlot = new Map(proposal.duties.map(duty => [duty.slotId, duty.teacherId]));
  const effectiveTeacher = (slot: typeof lessons[number]) => proposedBySlot.has(slot.id) ? proposedBySlot.get(slot.id) ?? slot.teacherId : existing.find(duty => duty.status === "ASSIGNED" && duty.timetableSlotId === slot.id)?.teacherId ?? slot.teacherId;
  const duties = proposal.duties.map(duty => {
    const slot = slots.find(item => item.id === duty.slotId)!, teacher = teachers.find(item => item.id === duty.teacherId), prior = existing.find(item => item.timetableSlotId === duty.slotId), cycle = cycles.find(item => item.academicYear === slot.timetable.academicYear);
    if (cycle && (cycle.status !== "ACTIVE" || cycle.startDate && instant < cycle.startDate || cycle.endDate && instant > cycle.endDate)) fail("Substitute coverage needs an active academic year on this date.", "SCHOOL_OPERATIONS_YEAR");
    if (duty.teacherId) {
      if (!teacher || duty.teacherId === slot.teacherId) fail("Choose a different active teacher in this campus.", "SCHOOL_OPERATIONS_TEACHER");
      if (leaves.some(leave => leave.userId === duty.teacherId)) fail("A selected substitute has approved leave.", "SCHOOL_OPERATIONS_LEAVE");
    } else if (!prior || prior.status !== "ASSIGNED") fail("There is no active substitute duty to cancel.", "SCHOOL_OPERATIONS_SCOPE");
    const resultingTeacher = duty.teacherId ?? slot.teacherId;
    if (lessons.some(other => other.id !== slot.id && other.timetable.academicYear === slot.timetable.academicYear && termsOverlap(other.timetable.term, slot.timetable.term) && effectiveTeacher(other) === resultingTeacher && overlap(slot, other))) fail("The resulting teacher is already teaching during this lesson.", "SCHOOL_OPERATIONS_TEACHER_CLASH");
    if (exams.some(exam => exam.date.toISOString().slice(0, 10) === proposal.date && exam.rooms.some(room => room.invigilation?.teacherId === resultingTeacher) && (!exam.periodDefinition || overlap(slot, exam.periodDefinition)))) fail("The resulting teacher is invigilating an exam during this lesson.", "SCHOOL_OPERATIONS_TEACHER_CLASH");
    return { slotId: slot.id, classId: slot.timetable.classId, academicYear: slot.timetable.academicYear, term: slot.timetable.term, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber, roomNumber: slot.roomNumber, className: [slot.timetable.class.name, slot.timetable.class.section].filter(Boolean).join(" · "), subjectName: slot.subject!.name, startTime: slot.startTime, endTime: slot.endTime, originalTeacherId: slot.teacherId!, originalTeacherName: slot.teacher?.fullName ?? "", teacherId: duty.teacherId, teacherName: teacher?.fullName ?? null, previousTeacherId: prior?.status === "ASSIGNED" ? prior.teacherId : null, previousVersion: prior?.version ?? null, reason: duty.reason };
  });
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, date: proposal.date, duties };
  return { ...preview, previewHash: workspaceRequestHash({ preview, slots, teachers, leaves, existing, lessons, exams, cycles, weekend: locale.weekend }) };
}

export async function getPublicationOptions(user: AuthUser, campusId: string): Promise<PublicationOptions> {
  return schoolAiTransaction(user, async tx => {
    await assertSchoolOperationsAccess(user, "timetable.publish_reviewed", tx, campusId, false);
    const boards = await tx.timetable.findMany({ where: { schoolId: user.schoolId, campusId, status: "DRAFT", class: { status: "ACTIVE", archivedAt: null } }, include: { class: { select: { name: true, section: true } }, _count: { select: { slots: { where: { slotType: "CLASS" } } } } }, orderBy: [{ academicYear: "desc" }, { id: "asc" }], take: 501 });
    if (boards.length > 500) fail("Narrow the publication scope.", "SCHOOL_OPERATIONS_LIMIT");
    return boards.map(board => ({ id: board.id, className: [board.class.name, board.class.section].filter(Boolean).join(" · "), academicYear: board.academicYear, term: board.term, lessons: board._count.slots }));
  });
}
