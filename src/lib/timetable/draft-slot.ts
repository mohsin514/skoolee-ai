import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { getLocalePackage } from "@/lib/locale/store";
import { moduleFlags } from "@/lib/permissions";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "./locking";

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const draftTimetableSlotSchema = z.strictObject({
  dayOfWeek: z.number().int().min(1).max(7),
  periodNumber: z.number().int().min(1).max(30),
  startTime: clockTime,
  endTime: clockTime,
}).refine(value => value.startTime < value.endTime, { message: "The end time must follow the start time.", path: ["endTime"] });

export class DraftTimetableSlotError extends ApiError {
  constructor(message: string, status: number, public code: string) { super(message, status); }
}
const include = {
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, fullName: true } },
  room: { select: { id: true, roomNumber: true, capacity: true } },
} as const;

/** A manual editor operation: reserve one empty cell, never assign or replace a lesson. */
export async function createDraftTimetableSlot(user: AuthUser, timetableId: string, input: unknown) {
  if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && !user.campusId) throw new DraftTimetableSlotError("Only an authorized timetable manager can add a period.", 403, "PERMISSION_DENIED");
  const parsed = draftTimetableSlotSchema.safeParse(input);
  if (!parsed.success || !z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/).safeParse(timetableId).success) throw new DraftTimetableSlotError("Enter a working day, a period number and valid start and end times.", 400, "TIMETABLE_SLOT_INVALID");
  const value = parsed.data;
  return schoolAiTransaction(user, async tx => {
    const scope = await tx.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId! }) }, select: { campusId: true } });
    if (!scope) throw new DraftTimetableSlotError("Timetable not found in your campus.", 404, "TIMETABLE_NOT_FOUND");
    await lockTimetableCampus(tx, user.schoolId, scope.campusId);
    // A row lock serializes additions and existing publish/delete writes for this
    // timetable. The scoped lookup reveals nothing about another campus.
    const locked = user.role === "SUPER_ADMIN"
      ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM timetables WHERE id = ${timetableId} AND school_id = ${user.schoolId} FOR UPDATE`
      : await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM timetables WHERE id = ${timetableId} AND school_id = ${user.schoolId} AND campus_id = ${user.campusId} FOR UPDATE`;
    if (!locked.length) throw new DraftTimetableSlotError("Timetable not found in your campus.", 404, "TIMETABLE_NOT_FOUND");
    const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
    if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new DraftTimetableSlotError("Your account access changed. Sign in again.", 403, "PERMISSION_DENIED");
    const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true, updatedAt: true } });
    if (!moduleFlags(grants, user.role, "timetable").canEdit) throw new DraftTimetableSlotError("Your timetable editing permission is no longer available.", 403, "PERMISSION_DENIED");
    await assertSchoolOperational(user.schoolId, tx);
    const timetable = await tx.timetable.findFirstOrThrow({ where: { id: timetableId, schoolId: user.schoolId }, include: { class: { select: { academicYear: true, campusId: true, status: true, archivedAt: true } }, campus: { select: { archivedAt: true } } } });
    if (timetable.status !== "DRAFT") throw new DraftTimetableSlotError("Return this timetable to draft before adding a period.", 409, "TIMETABLE_DRAFT_REQUIRED");
    if (timetable.campus.archivedAt || timetable.class.archivedAt || timetable.class.status !== "ACTIVE" || timetable.class.campusId !== timetable.campusId || timetable.class.academicYear !== timetable.academicYear) throw new DraftTimetableSlotError("The class or campus is no longer active for this academic year.", 409, "TIMETABLE_SCOPE");
    const cycle = await tx.academicCycle.findFirst({ where: { schoolId: user.schoolId, campusId: timetable.campusId, academicYear: timetable.academicYear }, select: { status: true } });
    if (cycle && !["DRAFT", "ACTIVE"].includes(cycle.status)) throw new DraftTimetableSlotError("This academic year is paused or ended.", 409, "TIMETABLE_SCOPE");
    const existing = await tx.timetableSlot.findFirst({ where: { schoolId: user.schoolId, timetableId, dayOfWeek: value.dayOfWeek, periodNumber: value.periodNumber }, include });
    if (existing) {
      if (existing.startTime !== value.startTime || existing.endTime !== value.endTime) throw new DraftTimetableSlotError("This period already exists with different times. Review it in the timetable.", 409, "TIMETABLE_SLOT_EXISTS");
      return existing;
    }
    const locale = await getLocalePackage(user.schoolId, timetable.campusId, new Date(), undefined, tx);
    if (locale.weekend.map(day => day || 7).includes(value.dayOfWeek)) throw new DraftTimetableSlotError("Choose a working day from the current campus calendar.", 409, "TIMETABLE_WEEKEND");
    const periods = await tx.periodDefinition.findMany({ where: { schoolId: user.schoolId, campusId: timetable.campusId, timeType: "CLASS" }, select: { periodNumber: true, startTime: true, endTime: true } });
    if (periods.length && !periods.some(period => period.periodNumber === value.periodNumber && period.startTime === value.startTime && period.endTime === value.endTime)) throw new DraftTimetableSlotError("Use the current campus period number and its exact times.", 409, "TIMETABLE_PERIOD_CHANGED");
    const slots = await tx.timetableSlot.findMany({ where: { schoolId: user.schoolId, timetableId }, select: { dayOfWeek: true, periodNumber: true, startTime: true, endTime: true } });
    if (slots.some(slot => !clockTime.safeParse(slot.startTime).success || !clockTime.safeParse(slot.endTime).success || slot.startTime >= slot.endTime)) throw new DraftTimetableSlotError("Correct invalid existing period times first.", 409, "TIMETABLE_EXISTING_INVALID");
    if (slots.some(slot => slot.periodNumber === value.periodNumber && (slot.startTime !== value.startTime || slot.endTime !== value.endTime))) throw new DraftTimetableSlotError("Use the same start and end times for this period number on every day.", 409, "TIMETABLE_PERIOD_INCONSISTENT");
    if (slots.some(slot => slot.dayOfWeek === value.dayOfWeek && slot.startTime < value.endTime && value.startTime < slot.endTime)) throw new DraftTimetableSlotError("This period overlaps another period on the same day.", 409, "TIMETABLE_SLOT_OVERLAP");
    const slot = await tx.timetableSlot.create({ data: { schoolId: user.schoolId, timetableId, ...value, slotType: "CLASS", subjectId: null, teacherId: null, roomId: null, roomNumber: null }, include });
    await tx.timetable.update({ where: { id: timetableId }, data: { updatedAt: new Date() } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, tableName: "timetable_slots", recordId: slot.id, userId: user.userId, newValue: { action: "ADD_EMPTY_DRAFT_PERIOD", timetableId, dayOfWeek: value.dayOfWeek, periodNumber: value.periodNumber } } });
    return slot;
  });
}
