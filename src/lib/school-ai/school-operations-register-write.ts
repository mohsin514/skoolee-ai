import type { AuthUser } from "@/lib/auth";
import type { AttendanceStatus, Prisma } from "@prisma/client";
import { ApiError, canMarkAttendance } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { assertWorkspacePermission, loadWorkspacePermissionSnapshot } from "./access";
import { schoolAiTransaction } from "./transaction";
import { applySchoolOperations, previewAttendance } from "./school-operations-service";
import { attendanceProposalSchema, operationDate } from "./school-operations";

/** Ordinary register writes share enrollment/lock/permission fences with reviewed AI execution. */
export async function writeObservedAttendance(user: AuthUser, input: { campusId: string; classId: string; date: string; entries?: Array<{ studentId: string; status: AttendanceStatus }>; copyFrom?: string }) {
  if (!canMarkAttendance(user) || user.role !== "SUPER_ADMIN" && user.campusId !== input.campusId) throw new ApiError("Forbidden", 403);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, input.campusId);
    const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
    if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Account access changed", 403);
    const grants = await loadWorkspacePermissionSnapshot(user, tx); await assertWorkspacePermission(user, "attendance", "view", grants); await assertWorkspacePermission(user, "attendance", "add", grants); await assertSchoolOperational(user.schoolId, tx);
    const cls = await tx.class.findFirst({ where: { id: input.classId, schoolId: user.schoolId, campusId: input.campusId, ...(user.role === "TEACHER" ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } : {}) }, select: { id: true } });
    if (!cls) throw new ApiError("Class not found or no longer assigned to you", 404);
    const entries = input.copyFrom ? await tx.attendance.findMany({ where: { schoolId: user.schoolId, campusId: input.campusId, classId: cls.id, date: new Date(`${operationDate.parse(input.copyFrom)}T00:00:00Z`) }, select: { studentId: true, status: true } }) : input.entries;
    const proposal = attendanceProposalSchema.parse({ operation: "attendance.record_register", classId: cls.id, date: input.date, entries, observationConfirmed: true });
    const preview = await previewAttendance(user, { id: "manual-register", version: 1, campusId: input.campusId, data: { proposal } as unknown as Prisma.JsonValue }, tx);
    const previous = await tx.attendance.findMany({ where: { schoolId: user.schoolId, id: { in: preview.entries.flatMap(row => row.attendanceId ? [row.attendanceId] : []) } }, select: { id: true, notes: true } });
    // The legacy quick mark form does not edit notes; preserve the reviewed evidence.
    preview.entries = preview.entries.map(row => ({ ...row, note: previous.find(old => old.id === row.attendanceId)?.notes ?? "" }));
    const result = await applySchoolOperations(user, preview, tx);
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "attendance", recordId: cls.id, userId: user.userId, newValue: { classId: cls.id, date: input.date, attendanceIds: result.ids, mode: input.copyFrom ? "COPY_PREVIOUS_REVIEWED" : "MANUAL_REGISTER" } } });
    return tx.attendance.findMany({ where: { schoolId: user.schoolId, id: { in: result.ids } } });
  });
}
