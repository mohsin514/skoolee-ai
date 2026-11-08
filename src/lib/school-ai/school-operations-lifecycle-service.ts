import { Prisma, type SchoolAiRecord } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { TxClient } from "@/lib/db/prisma";
import { getYearClosureReport } from "@/lib/academic/year-closure";
import { applyEnrollment, enrollmentImpact } from "@/lib/students/enrollment";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { SchoolAiError } from "./access";
import { workspaceRequestHash } from "./repository";
import { academicLifecycleProposalSchema, promotionProposalSchema, type AcademicLifecyclePreview, type PromotionPreview } from "./school-operations-lifecycle";
type RecordWithCampus = SchoolAiRecord & { campusId: string };
function fail(message: string, code = "SCHOOL_OPERATIONS_YEAR"): never { throw new SchoolAiError(message, 409, code); }
export async function previewAcademicLifecycle(user: AuthUser, record: RecordWithCampus, tx: TxClient): Promise<AcademicLifecyclePreview> {
  const proposal = academicLifecycleProposalSchema.parse((record.data as { proposal: unknown }).proposal), scope = { schoolId: user.schoolId, campusId: record.campusId };
  const cycles = await tx.academicCycle.findMany({ where: scope, orderBy: { academicYear: "asc" } }), cycle = cycles.find(item => item.id === proposal.cycleId);
  if (!cycle) fail("The academic year is outside this campus.", "SCHOOL_OPERATIONS_SCOPE");
  if (proposal.action === "activate" && cycle.status !== "DRAFT" || proposal.action === "resume" && cycle.status !== "PAUSED" || proposal.action === "pause" && cycle.status !== "ACTIVE" || proposal.action === "close" && !["ACTIVE", "PAUSED"].includes(cycle.status)) fail("This academic year no longer permits the selected transition.");
  const starting = proposal.action === "activate" || proposal.action === "resume", nextStatus = starting ? "ACTIVE" as const : proposal.action === "pause" ? "PAUSED" as const : "ENDED" as const;
  if (starting && cycles.some(item => item.id !== cycle.id && (item.status === "ACTIVE" || item.academicYear < cycle.academicYear && item.status !== "ENDED"))) fail("Close earlier years and pause or close the active year before starting this one.");
  if (starting && (!cycle.startDate || !cycle.endDate || cycle.startDate > cycle.endDate)) fail("Save and review the academic year start and end dates first.");
  const classes = await tx.class.findMany({ where: { ...scope, academicYear: cycle.academicYear }, select: { id: true, name: true, status: true, archivedAt: true }, orderBy: { id: "asc" } });
  if (starting && !classes.some(cls => cls.status === "ACTIVE" && !cls.archivedAt)) fail("Create an active class before starting the academic year.");
  const liveAttempts = await tx.schoolAiExamAttempt.count({ where: { ...scope, status: "IN_PROGRESS", assignment: { classId: { in: classes.map(cls => cls.id) } } } });
  if (!starting && liveAttempts) fail("Finish or expire active online exam attempts before pausing or closing this year.");
  const pendingDuties = await tx.schoolAiSubstituteDuty.count({ where: { ...scope, status: "ASSIGNED", timetableSlotId: { in: (await tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, timetable: { ...scope, academicYear: cycle.academicYear } }, select: { id: true } })).map(slot => slot.id) }, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } } });
  if (!starting && pendingDuties) fail("Cancel future substitute coverage before pausing or closing this year.");
  const report = proposal.action === "close" ? await getYearClosureReport(record.campusId, cycle.academicYear, tx) : null;
  if (report && !report.canClose) fail("Complete marking, principal review and publication of all results before closing this year.", "SCHOOL_OPERATIONS_CLOSURE");
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, cycleId: cycle.id, label: cycle.label, academicYear: cycle.academicYear, previousStatus: cycle.status, nextStatus, startDate: cycle.startDate?.toISOString().slice(0, 10) ?? null, endDate: cycle.endDate?.toISOString().slice(0, 10) ?? null, reason: proposal.reason, closure: report?.steps.map(step => ({ id: step.id, done: step.done, outstanding: step.outstanding })) ?? [] };
  return { ...preview, previewHash: workspaceRequestHash({ preview, cycles, classes, report, liveAttempts, pendingDuties }) };
}
export async function applyAcademicLifecycle(user: AuthUser, preview: AcademicLifecyclePreview, tx: TxClient) {
  const changed = await tx.academicCycle.updateMany({ where: { schoolId: user.schoolId, campusId: preview.campusId, id: preview.cycleId, status: preview.previousStatus }, data: { status: preview.nextStatus } });
  if (changed.count !== 1) fail("The year changed during execution.", "STALE_EXECUTION_PREVIEW");
  await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "academic_cycles", recordId: preview.cycleId, userId: user.userId, oldValue: { status: preview.previousStatus }, newValue: { status: preview.nextStatus, reason: preview.reason, reviewedVersion: preview.version } } });
  return { operation: preview.operation, ids: [preview.cycleId], count: 1 };
}
export async function previewPromotions(user: AuthUser, record: RecordWithCampus, tx: TxClient): Promise<PromotionPreview> {
  const proposal = promotionProposalSchema.parse((record.data as { proposal: unknown }).proposal), scope = { schoolId: user.schoolId, campusId: record.campusId };
  const [from, target, locale] = await Promise.all([tx.class.findFirst({ where: { ...scope, id: proposal.fromClassId, archivedAt: null } }), tx.class.findFirst({ where: { ...scope, id: proposal.targetClassId, archivedAt: null, status: "ACTIVE" } }), getLocalePackage(user.schoolId, record.campusId, new Date(), undefined, tx)]);
  if (!from || !target || target.academicYear !== from.academicYear + 1) fail("Choose source and next-year classes in this campus.", "SCHOOL_OPERATIONS_SCOPE");
  const date = new Date(`${proposal.effectiveDate}T00:00:00Z`), today = calendarDateIn(locale.timezone);
  if (proposal.effectiveDate > today) fail("Save the proposal now and apply it on or after its effective date.", "SCHOOL_OPERATIONS_DATE");
  const [oldCycle, nextCycle, targetStudents, existingHistory] = await Promise.all([
    tx.academicCycle.findFirst({ where: { ...scope, academicYear: from.academicYear } }), tx.academicCycle.findFirst({ where: { ...scope, academicYear: target.academicYear } }),
    tx.student.findMany({ where: { ...scope, OR: [{ classId: target.id }, { rollNo: { in: proposal.entries.map(item => item.rollNo) } }] }, select: { id: true, rollNo: true, classId: true }, orderBy: { id: "asc" } }),
    tx.studentClassHistory.findMany({ where: { ...scope, studentId: { in: proposal.entries.map(item => item.studentId) }, classId: from.id, academicYear: from.academicYear }, orderBy: { studentId: "asc" } }),
  ]);
  if (!oldCycle || oldCycle.status !== "ENDED" || !nextCycle || !["DRAFT", "ACTIVE"].includes(nextCycle.status) || nextCycle.startDate && date < nextCycle.startDate || nextCycle.endDate && date > nextCycle.endDate) fail("Close the outgoing year and choose a date within the next draft or active academic year.");
  if (existingHistory.length) fail("Some pupils already have a year-end decision. Review their existing history before making another decision.", "SCHOOL_OPERATIONS_PROMOTION_HISTORY");
  if (targetStudents.some(student => proposal.entries.some(item => item.rollNo === student.rollNo && item.studentId !== student.id))) fail("A destination roll number is already in use in this campus.", "SCHOOL_OPERATIONS_ROLL");
  const impacts = [];
  for (const entry of proposal.entries) {
    const pupil = await tx.student.findFirst({ where: { ...scope, id: entry.studentId, classId: from.id, archivedAt: null, status: "active" }, select: { id: true } });
    if (!pupil) fail("A selected pupil is no longer active in the source class.", "SCHOOL_OPERATIONS_ENROLLMENT");
    const impact = await enrollmentImpact(tx, entry.studentId, entry.fromEnrollmentId, target.id, date);
    if (impact.from.origin.startsWith("LEGACY") || impact.from.schoolId !== user.schoolId || impact.from.campusId !== record.campusId) fail("Reconcile the pupil's current enrollment before promotion.", "SCHOOL_OPERATIONS_ENROLLMENT");
    impacts.push({ ...entry, impact });
  }
  const entries = impacts.map(({ studentId, fromEnrollmentId, rollNo, impact }) => ({ studentId, fromEnrollmentId, rollNo, name: impact.pupil.fullName, oldRollNo: impact.pupil.rollNo, preserved: impact.preserved }));
  const targetOccupancy = targetStudents.filter(student => student.classId === target.id).length;
  const preview = { operation: proposal.operation, recordId: record.id, version: record.version, campusId: record.campusId, fromClassId: from.id, targetClassId: target.id, fromClassName: [from.name, from.section].filter(Boolean).join(" · "), targetClassName: [target.name, target.section].filter(Boolean).join(" · "), academicYear: from.academicYear, effectiveDate: proposal.effectiveDate, reason: proposal.reason, targetOccupancy, afterOccupancy: targetOccupancy + entries.length, entries };
  return { ...preview, previewHash: workspaceRequestHash({ preview, from, target, oldCycle, nextCycle, targetStudents, impacts }) };
}
export async function applyPromotions(user: AuthUser, preview: PromotionPreview, tx: TxClient) {
  const ids: string[] = [];
  for (const entry of preview.entries) {
    const result = await applyEnrollment(tx, { studentId: entry.studentId, fromId: entry.fromEnrollmentId, targetClassId: preview.targetClassId, effectiveDate: new Date(`${preview.effectiveDate}T00:00:00Z`), rollNo: entry.rollNo, actorId: user.userId, reason: preview.reason });
    await tx.studentClassHistory.create({ data: { schoolId: user.schoolId, campusId: preview.campusId, studentId: entry.studentId, classId: preview.fromClassId, academicYear: preview.academicYear, rollNo: entry.oldRollNo, status: "PROMOTED", promotedToClassId: preview.targetClassId } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "students", recordId: entry.studentId, userId: user.userId, oldValue: { classId: preview.fromClassId, enrollmentId: entry.fromEnrollmentId }, newValue: { classId: preview.targetClassId, enrollmentId: result.enrollment.id, preserved: entry.preserved, workspaceVersion: preview.version } as Prisma.InputJsonValue } });
    ids.push(result.enrollment.id);
  }
  return { operation: preview.operation, ids, count: ids.length };
}
