import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { assertSchoolOperational } from "@/lib/billing/entitlements";
import { moduleFlags, type PermissionAction } from "@/lib/permissions";
import { getLocalePackage } from "@/lib/locale/store";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "./locking";
import { validateTimetableSlots, type TimetableValidation } from "./validate";
import type { SuggestionAction } from "./suggest";
import { assertSubstituteLessonsUnchanged } from "@/lib/school-ai/school-operations-bookings";

export const timetableInclude = {
  class: { select: { id: true, name: true, section: true } },
  slots: { include: { subject: { select: { id: true, name: true } }, teacher: { select: { id: true, fullName: true } }, room: { select: { id: true, roomNumber: true, capacity: true } } }, orderBy: [{ dayOfWeek: "asc" as const }, { periodNumber: "asc" as const }] },
} satisfies Prisma.TimetableInclude;
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1).max(128);
const slotType = z.enum(["CLASS", "BREAK", "ASSEMBLY", "PRAYER", "ACTIVITY"]);
const patchSchema = z.array(z.object({ id, subjectId: id.nullish(), teacherId: id.nullish(), roomId: id.nullish(), slotType: slotType.optional(), startTime: clock.optional(), endTime: clock.optional() })).min(1).max(210).refine(rows => new Set(rows.map(row => row.id)).size === rows.length);
const createSchema = z.object({ classId: id, academicYear: z.number().int().min(2000).max(2100), term: z.string().trim().min(1).max(100).default("ANNUAL"), periods: z.array(z.object({ period: z.number().int().min(1).max(30), start: clock, end: clock, type: slotType.optional() })).min(1).max(30).optional() });
export class TimetableValidationError extends ApiError {
  constructor(public validation: TimetableValidation) { super(validation.conflicts.find(conflict => conflict.severity === "CRITICAL")?.message ?? "Resolve timetable conflicts first", 409); }
}
/** Locate only within the actor's tenant/campus; the write transaction reloads it. */
export async function resolveTimetableCampus(user: AuthUser, timetableId: string) {
  const board = await prisma.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { campusId: true } });
  if (!board) throw new ApiError("Timetable not found", 404);
  return board.campusId;
}
export async function resolveTimetableCreateCampus(user: AuthUser, input: unknown) {
  const parsed = z.object({ classId: id, campusId: id.optional() }).safeParse(input);
  if (!parsed.success) throw new ApiError("Provide a class and valid selected campus", 400);
  const cls = await prisma.class.findFirst({ where: { id: parsed.data.classId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { campusId: true } });
  if (!cls) throw new ApiError("Class not found", 404);
  if (parsed.data.campusId && parsed.data.campusId !== cls.campusId) throw new ApiError("The selected campus does not contain this class", 403);
  return cls.campusId;
}
export async function assertTimetableWriteAccess(user: AuthUser, campusId: string, action: PermissionAction, tx: TxClient) {
  if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Forbidden", 403);
  const actor = await tx.user.findFirst({ where: { id: user.userId, schoolId: user.schoolId, isActive: true }, select: { role: true, campusId: true, accessVersion: true } });
  if (!actor || actor.role !== user.role || actor.campusId !== user.campusId || user.accessVersion !== undefined && actor.accessVersion !== user.accessVersion) throw new ApiError("Your account access changed. Sign in again.", 403);
  const grants = await tx.rolePermission.findMany({ where: { schoolId: user.schoolId, role: user.role }, select: { module: true, canView: true, canAdd: true, canEdit: true, canDelete: true } });
  const flags = moduleFlags(grants, user.role, "timetable");
  if (!flags[{ view: "canView", add: "canAdd", edit: "canEdit", delete: "canDelete" }[action] as keyof typeof flags]) throw new ApiError(`Insufficient permissions: timetable.${action}`, 403);
  await assertSchoolOperational(user.schoolId, tx);
}
async function write<T>(user: AuthUser, campusId: string, action: PermissionAction, work: (tx: TxClient) => Promise<T>, allowArchivedCleanup = false) {
  if (!canManageOperations(user) || user.role !== "SUPER_ADMIN" && user.campusId !== campusId) throw new ApiError("Forbidden", 403);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, campusId, allowArchivedCleanup);
    await assertTimetableWriteAccess(user, campusId, action, tx);
    return work(tx);
  });
}
async function load(user: AuthUser, campusId: string, timetableId: string, tx: TxClient) {
  const timetable = await tx.timetable.findFirst({ where: { id: timetableId, schoolId: user.schoolId, campusId }, include: timetableInclude });
  if (!timetable) throw new ApiError("Timetable not found", 404);
  return timetable;
}
type Board = Awaited<ReturnType<typeof load>>;
async function assertActiveClass(user: AuthUser, board: { campusId: string; classId: string; academicYear: number }, tx: TxClient) {
  const cls = await tx.class.findFirst({ where: { id: board.classId, schoolId: user.schoolId, campusId: board.campusId, academicYear: board.academicYear, archivedAt: null, status: "ACTIVE" }, select: { id: true } });
  const cycle = await tx.academicCycle.findFirst({ where: { schoolId: user.schoolId, campusId: board.campusId, academicYear: board.academicYear }, select: { status: true } });
  if (!cls || cycle && !["DRAFT", "ACTIVE"].includes(cycle.status)) throw new ApiError("The class or academic year is no longer active", 409);
}
function validateWindows(slots: Array<{ dayOfWeek: number; periodNumber: number; startTime: string; endTime: string }>) {
  const windows = new Map<number, string>();
  for (const [index, slot] of slots.entries()) {
    if (!clock.safeParse(slot.startTime).success || !clock.safeParse(slot.endTime).success || slot.startTime >= slot.endTime) throw new ApiError("Enter valid period start and end times", 400);
    const window = `${slot.startTime}:${slot.endTime}`;
    if (windows.has(slot.periodNumber) && windows.get(slot.periodNumber) !== window) throw new ApiError("Use the same clock times for each period number across all days", 409);
    windows.set(slot.periodNumber, window);
    if (slots.slice(0, index).some(other => other.dayOfWeek === slot.dayOfWeek && other.startTime < slot.endTime && slot.startTime < other.endTime)) throw new ApiError("Periods on the same day cannot overlap", 409);
  }
}
async function validateResult(user: AuthUser, board: Board, slots: Board["slots"], tx: TxClient, requireComplete = false, inspectConflicts = false) {
  await assertActiveClass(user, board, tx);
  validateWindows(slots);
  const teachers = [...new Set(slots.flatMap(slot => slot.teacherId ? [slot.teacherId] : []))], rooms = [...new Set(slots.flatMap(slot => slot.roomId ? [slot.roomId] : []))], subjects = [...new Set(slots.flatMap(slot => slot.subjectId ? [slot.subjectId] : []))];
  const [teacherCount, roomRows, subjectCount, locale] = await Promise.all([
    tx.user.count({ where: { id: { in: teachers }, schoolId: user.schoolId, campusId: board.campusId, isActive: true, role: { in: ["TEACHER", "PRINCIPAL"] } } }),
    tx.classRoom.findMany({ where: { id: { in: rooms }, schoolId: user.schoolId, campusId: board.campusId }, select: { id: true, roomNumber: true } }),
    tx.subject.count({ where: { id: { in: subjects }, schoolId: user.schoolId, campusId: board.campusId, classId: board.classId } }),
    getLocalePackage(user.schoolId, board.campusId, new Date(), undefined, tx),
  ]);
  if (teacherCount !== teachers.length || roomRows.length !== rooms.length || subjectCount !== subjects.length) throw new ApiError("Every subject, active teacher and room must belong to this class and campus", 400);
  if (slots.some(slot => slot.slotType !== "CLASS" && (slot.subjectId || slot.teacherId || slot.roomId))) throw new ApiError("Non-teaching periods cannot reserve a subject, teacher or room", 400);
  const weekend = locale.weekend.map(day => day || 7);
  if (slots.some(slot => slot.slotType === "CLASS" && (slot.subjectId || slot.teacherId || slot.roomId) && weekend.includes(slot.dayOfWeek))) throw new ApiError("A lesson falls on a configured campus weekend", 409);
  const validation = await validateTimetableSlots({ campusId: board.campusId, timetableId: board.id, classId: board.classId, academicYear: board.academicYear, term: board.term, slots, requireComplete }, tx);
  if (!inspectConflicts && !validation.canPublish) throw new TimetableValidationError(validation);
  return { validation, roomRows };
}
async function saveInTransaction(user: AuthUser, board: Board, input: unknown, tx: TxClient, suggestion = false) {
  const parsed = patchSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("Provide unique owned slot IDs and valid period details", 400);
  if (parsed.data.some(patch => !board.slots.some(slot => slot.id === patch.id))) throw new ApiError("One or more slots do not belong to this timetable", 400);
  const merged = board.slots.map(slot => {
    const patch = parsed.data.find(item => item.id === slot.id);
    return patch ? { ...slot, ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) } : slot;
  });
  await assertSubstituteLessonsUnchanged(tx, user.schoolId, board.campusId, board.slots, merged);
  const { validation, roomRows } = await validateResult(user, board, merged, tx, suggestion, suggestion);
  if (suggestion) {
    const before = await validateTimetableSlots({ campusId: board.campusId, timetableId: board.id, classId: board.classId, academicYear: board.academicYear, term: board.term, slots: board.slots, requireComplete: true }, tx);
    const critical = (result: TimetableValidation) => new Set(result.conflicts.filter(item => item.severity === "CRITICAL").map(item => item.identity));
    const prior = critical(before), next = critical(validation);
    // A repair may leave independent existing clashes, but may neither replace
    // one clash with a different booking nor introduce another hidden clash.
    const noNewCritical = !next.has(undefined) && [...next].every(identity => prior.has(identity));
    const improves = prior.size > 0 ? next.size < prior.size : next.size === 0 && validation.counts.warning < before.counts.warning;
    if (!noNewCritical || !improves) throw new ApiError("This suggestion no longer reduces the existing conflicts safely. Refresh suggestions.", 409);
  }
  for (const patch of parsed.data) {
    const slot = merged.find(item => item.id === patch.id)!;
    await tx.timetableSlot.update({ where: { id: slot.id }, data: { subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId, roomNumber: roomRows.find(room => room.id === slot.roomId)?.roomNumber ?? null, slotType: slot.slotType, startTime: slot.startTime, endTime: slot.endTime } });
  }
  await tx.timetable.update({ where: { id: board.id }, data: { updatedAt: new Date() } });
  return { data: await load(user, board.campusId, board.id, tx), validation };
}
export async function saveManualTimetable(user: AuthUser, campusId: string, timetableId: string, slots: unknown) {
  return write(user, campusId, "edit", async tx => saveInTransaction(user, await load(user, campusId, timetableId, tx), slots, tx));
}
export async function changeManualTimetableStatus(user: AuthUser, campusId: string, timetableId: string, action: "publish" | "unpublish") {
  return write(user, campusId, "edit", async tx => {
    const board = await load(user, campusId, timetableId, tx);
    const validation = action === "publish" ? (await validateResult(user, board, board.slots, tx, true)).validation : undefined;
    const status = action === "publish" ? "PUBLISHED" : "DRAFT";
    const changed = board.status !== status;
    if (changed && action === "unpublish") await assertSubstituteLessonsUnchanged(tx, user.schoolId, campusId, board.slots, []);
    if (changed) await tx.timetable.update({ where: { id: board.id }, data: { status, publishedAt: action === "publish" ? new Date() : null } });
    return { data: await load(user, campusId, timetableId, tx), validation, changed };
  }, action === "unpublish");
}
export async function deleteManualTimetable(user: AuthUser, campusId: string, timetableId: string) {
  return write(user, campusId, "delete", async tx => { const board = await load(user, campusId, timetableId, tx); if (await tx.schoolAiSubstituteDuty.count({ where: { schoolId: user.schoolId, campusId, timetableSlotId: { in: board.slots.map(slot => slot.id) } } })) throw new ApiError("This timetable has dated substitute history. Keep it for the academic record.", 409); await tx.timetable.delete({ where: { id: board.id } }); return board; }, true);
}
export async function createManualTimetable(user: AuthUser, campusId: string, input: unknown) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) throw new ApiError("Provide a class, academic year and valid period definitions", 400);
  return write(user, campusId, "add", async tx => {
    const { classId, academicYear, term } = parsed.data;
    await assertActiveClass(user, { classId, campusId, academicYear }, tx);
    const termScope = ["TERM_1", "TERM_2", "TERM_3"].includes(term) ? { OR: [{ term: { in: ["ANNUAL", term] } }, { term: { notIn: ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"] } }] } : {};
    if (await tx.timetable.findFirst({ where: { schoolId: user.schoolId, campusId, classId, academicYear, ...termScope }, select: { id: true } })) throw new ApiError("Timetable already exists for this class and overlapping year/term", 409);
    const periods = parsed.data.periods ?? [{ period: 1, start: "08:00", end: "08:40" }, { period: 2, start: "08:40", end: "09:20" }, { period: 3, start: "09:20", end: "10:00" }, { period: 4, start: "10:00", end: "10:20", type: "BREAK" }, { period: 5, start: "10:20", end: "11:00" }, { period: 6, start: "11:00", end: "11:40" }, { period: 7, start: "11:40", end: "12:10", type: "PRAYER" }, { period: 8, start: "12:10", end: "12:50" }];
    if (new Set(periods.map(period => period.period)).size !== periods.length) throw new ApiError("Period numbers must be unique", 400);
    const locale = await getLocalePackage(user.schoolId, campusId, new Date(), undefined, tx);
    const days = [1, 2, 3, 4, 5, 6, 7].filter(day => !locale.weekend.map(value => value || 7).includes(day));
    const slots = days.flatMap(day => periods.map(period => ({ schoolId: user.schoolId, dayOfWeek: day, periodNumber: period.period, startTime: period.start, endTime: period.end, slotType: period.type ?? "CLASS" })));
    validateWindows(slots);
    return tx.timetable.create({ data: { schoolId: user.schoolId, campusId, classId, academicYear, term, slots: { create: slots } }, include: timetableInclude });
  });
}
export async function applyManualTimetableSuggestion(user: AuthUser, campusId: string, timetableId: string, action: SuggestionAction) {
  return write(user, campusId, "edit", async tx => {
    const board = await load(user, campusId, timetableId, tx);
    const slot = board.slots.find(item => item.id === action.slotId);
    if (!slot) throw new ApiError("That slot is not part of this timetable", 400);
    if (action.type === "REASSIGN_TEACHER" && action.teacherId) return saveInTransaction(user, board, [{ id: slot.id, teacherId: action.teacherId }], tx, true);
    if (action.type === "REASSIGN_ROOM" && action.roomId) return saveInTransaction(user, board, [{ id: slot.id, roomId: action.roomId }], tx, true);
    if (action.type === "MOVE_SLOT" && action.targetSlotId) {
      const target = board.slots.find(item => item.id === action.targetSlotId);
      if (!target || target.id === slot.id || target.slotType !== "CLASS" || target.subjectId || target.teacherId || target.roomId || !slot.subjectId) throw new ApiError("That target period is no longer empty; refresh suggestions", 409);
      return saveInTransaction(user, board, [{ id: target.id, subjectId: slot.subjectId, teacherId: slot.teacherId, roomId: slot.roomId }, { id: slot.id, subjectId: null, teacherId: null, roomId: null }], tx, true);
    }
    throw new ApiError("Unknown or incomplete suggestion action", 400);
  });
}

/** The reviewed AI publication uses the same current-resource validation as the manual publish control. */
export async function reviewTimetablePublication(user: AuthUser, campusId: string, timetableId: string, tx: TxClient) {
  await assertTimetableWriteAccess(user, campusId, "edit", tx);
  const board = await load(user, campusId, timetableId, tx);
  if (board.status !== "DRAFT") throw new ApiError("Choose a current draft timetable to publish.", 409);
  const { validation } = await validateResult(user, board, board.slots, tx, true);
  const lessons = board.slots.filter(slot => slot.slotType === "CLASS");
  if (!lessons.length || lessons.some(slot => !slot.subjectId || !slot.teacherId || !slot.roomId || !slot.room || slot.room.capacity <= 0) || validation.conflicts.length) throw new ApiError("Complete every teaching lesson and resolve capacity or resource warnings before reviewed publication.", 409);
  return board;
}
