import { createHash } from "node:crypto";
import type { TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api/scope";
import { writeAuditEvent } from "@/lib/audit-events";
import { getLocalePackage } from "@/lib/locale/store";
import { schoolToday } from "@/lib/fees/statement";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";

// SKO-463: dated dormitory stays. A stay is the half-open range [start, end): `end` is the first day the
// pupil is no longer in the room, null means open-ended. Every write locks the rooms and the pupil it
// touches, so two staff taking the last place, or double-booking one pupil, cannot both succeed.

export type Stay = { id: string; startDate: Date; endDate: Date | null };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDay(value: unknown, label: string): Date {
  const text = String(value ?? "");
  if (!DAY.test(text)) throw new ApiError(`${label} must be a date (YYYY-MM-DD).`, 400);
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new ApiError(`${label} is not a real date.`, 400);
  return date;
}
export const dayText = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function overlaps(a: { startDate: Date; endDate: Date | null }, from: Date, to: Date | null) {
  return (to === null || a.startDate < to) && (a.endDate === null || a.endDate > from);
}

/** Highest number of stays present on any single day of [from, to). */
export function peakOccupancy(stays: { startDate: Date; endDate: Date | null }[], from: Date, to: Date | null) {
  const events: [number, number][] = [];
  for (const stay of stays) {
    if (!overlaps(stay, from, to)) continue;
    events.push([Math.max(stay.startDate.getTime(), from.getTime()), 1]);
    if (stay.endDate && (to === null || stay.endDate < to)) events.push([stay.endDate.getTime(), -1]);
  }
  // A stay ending on a day frees the place before another starts that day (half-open ranges).
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0, peak = 0;
  for (const [, delta] of events) { current += delta; peak = Math.max(peak, current); }
  return peak;
}

export async function campusToday(schoolId: string, campusId: string, db?: TxClient) {
  const policy = await getLocalePackage(schoolId, campusId, undefined, undefined, db);
  return parseDay(schoolToday(policy.timezone), "Today");
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function reasonOf(value: unknown, label = "Reason") {
  const reason = String(value ?? "").trim();
  if (reason.length < 3 || reason.length > 500) throw new ApiError(`${label} is required (3–500 characters).`, 400);
  return reason;
}

async function lockRooms(db: TxClient, user: AuthUser, campusId: string, roomIds: string[]) {
  const ids = [...new Set(roomIds)].sort();
  const rows = await db.$queryRaw<{ id: string; number: string; capacity: number; status: string }[]>`
    SELECT id, number, capacity, status FROM dorm_rooms WHERE id = ANY(${ids}) AND campus_id = ${campusId} AND school_id = ${user.schoolId} ORDER BY id FOR UPDATE`;
  if (rows.length !== ids.length) throw new ApiError("Room not found in this campus", 404);
  return new Map(rows.map(row => [row.id, row]));
}
async function lockStudent(db: TxClient, user: AuthUser, campusId: string, studentId: string) {
  const [row] = await db.$queryRaw<{ id: string; full_name: string; archived_at: Date | null }[]>`
    SELECT id, full_name, archived_at FROM students WHERE id = ${studentId} AND campus_id = ${campusId} AND school_id = ${user.schoolId} FOR UPDATE`;
  if (!row) throw new ApiError("Student not found in this campus", 404);
  return row;
}
const activeStays = (db: TxClient, where: { roomId?: string; studentId?: string }) =>
  db.dormAllocation.findMany({ where: { ...where, status: "ACTIVE" }, select: { id: true, roomId: true, startDate: true, endDate: true, room: { select: { number: true } } } });

async function assertStudentFree(db: TxClient, studentId: string, from: Date, to: Date | null, ignoreId?: string) {
  const clash = (await activeStays(db, { studentId })).find(stay => stay.id !== ignoreId && overlaps(stay, from, to));
  if (clash) throw new ApiError(`This student already has room ${clash.room.number} from ${dayText(clash.startDate)}${clash.endDate ? ` to ${dayText(clash.endDate)}` : " with no end date"}. End or move that stay first.`, 409, );
}
async function assertPlace(db: TxClient, room: { id: string; number: string; capacity: number; status: string }, from: Date, to: Date | null) {
  if (room.status !== "AVAILABLE") throw new ApiError(`Room ${room.number} is out of service and takes no new students.`, 409);
  const peak = peakOccupancy(await activeStays(db, { roomId: room.id }), from, to);
  if (peak >= room.capacity) throw new ApiError(`Room ${room.number} is full (${peak} of ${room.capacity} places) for part of these dates. Choose other dates or another room.`, 409);
  return peak;
}

/** Keeps Student.dormRoomId equal to the stay that covers today, for screens that still read it. */
async function syncCurrentRoom(db: TxClient, studentId: string, today: Date) {
  const current = (await activeStays(db, { studentId })).find(stay => overlaps(stay, today, new Date(today.getTime() + 86_400_000)));
  await db.student.update({ where: { id: studentId }, data: { dormRoomId: current?.roomId ?? null } });
}

type Body = Record<string, unknown>;

export async function allocate(user: AuthUser, campusId: string, body: Body) {
  return schoolAiTransaction(user, async db => {
    const studentId = String(body.studentId ?? ""), roomId = String(body.roomId ?? "");
    if (!studentId || !roomId) throw new ApiError("Choose a student and a room.", 400);
    const start = parseDay(body.startDate, "Start date");
    const end = body.endDate ? parseDay(body.endDate, "End date") : null;
    if (end && end <= start) throw new ApiError("The end date must be after the start date.", 400);
    const reason = reasonOf(body.reason);
    const key = body.idempotencyKey ? String(body.idempotencyKey) : null;
    const requestHash = hash({ studentId, roomId, start: dayText(start), end: dayText(end), reason });
    const rooms = await lockRooms(db, user, campusId, [roomId]);
    const student = await lockStudent(db, user, campusId, studentId);
    if (key) {
      const previous = await db.dormAllocation.findUnique({ where: { campusId_idempotencyKey: { campusId, idempotencyKey: key } } });
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ApiError("This retry does not match the original allocation. Start a new allocation instead.", 409);
        return { allocation: previous, replayed: true };
      }
    }
    if (student.archived_at) throw new ApiError("Archived students cannot be given a room.", 409);
    await assertStudentFree(db, studentId, start, end);
    await assertPlace(db, rooms.get(roomId)!, start, end);
    const allocation = await db.dormAllocation.create({ data: { schoolId: user.schoolId, campusId, roomId, studentId, startDate: start, endDate: end, reason, createdById: user.userId, idempotencyKey: key, requestHash: key ? requestHash : null } });
    await syncCurrentRoom(db, studentId, await campusToday(user.schoolId, campusId, db));
    await writeAuditEvent(db, user, { table: "dorm_allocations", recordId: allocation.id, action: "CREATE", campusId, after: { roomId, studentId, startDate: dayText(start), endDate: dayText(end), reason } });
    return { allocation, replayed: false };
  });
}

async function lockedStay(db: TxClient, user: AuthUser, campusId: string, id: string) {
  const stay = await db.dormAllocation.findFirst({ where: { id, campusId, schoolId: user.schoolId }, include: { next: true } });
  if (!stay) throw new ApiError("Allocation not found", 404);
  return stay;
}

export async function moveStay(user: AuthUser, campusId: string, body: Body) {
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? ""), toRoomId = String(body.toRoomId ?? "");
    const moveDate = parseDay(body.moveDate, "Move date");
    const reason = reasonOf(body.reason);
    const initial = await lockedStay(db, user, campusId, id);
    const rooms = await lockRooms(db, user, campusId, [initial.roomId, toRoomId]);
    await lockStudent(db, user, campusId, initial.studentId);
    const stay = await lockedStay(db, user, campusId, id);
    // A replayed move (lost response) finds the move it already made.
    if (stay.next) {
      if (stay.next.roomId === toRoomId && stay.next.startDate.getTime() === moveDate.getTime()) return { allocation: stay.next, replayed: true };
      throw new ApiError("This stay was already moved. Refresh to see the current room.", 409);
    }
    if (stay.status !== "ACTIVE") throw new ApiError("A cancelled reservation cannot be moved.", 409);
    if (toRoomId === stay.roomId) throw new ApiError("Choose a different room.", 400);
    if (moveDate <= stay.startDate || (stay.endDate && moveDate >= stay.endDate)) throw new ApiError(`The move date must fall inside the current stay (${dayText(stay.startDate)}${stay.endDate ? ` to ${dayText(stay.endDate)}` : " onwards"}).`, 400);
    await assertStudentFree(db, stay.studentId, moveDate, stay.endDate, stay.id);
    await assertPlace(db, rooms.get(toRoomId)!, moveDate, stay.endDate);
    await db.dormAllocation.update({ where: { id: stay.id }, data: { endDate: moveDate, endReason: `Moved: ${reason}`, endedById: user.userId } });
    const next = await db.dormAllocation.create({ data: { schoolId: user.schoolId, campusId, roomId: toRoomId, studentId: stay.studentId, startDate: moveDate, endDate: stay.endDate, reason, previousId: stay.id, createdById: user.userId } });
    await syncCurrentRoom(db, stay.studentId, await campusToday(user.schoolId, campusId, db));
    await writeAuditEvent(db, user, { table: "dorm_allocations", recordId: next.id, action: "UPDATE", campusId, before: { roomId: stay.roomId, allocationId: stay.id }, after: { roomId: toRoomId, moveDate: dayText(moveDate), reason } });
    return { allocation: next, replayed: false };
  });
}

export async function endStay(user: AuthUser, campusId: string, body: Body) {
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const endDate = parseDay(body.endDate, "End date");
    const reason = reasonOf(body.reason);
    const initial = await lockedStay(db, user, campusId, id);
    await lockRooms(db, user, campusId, [initial.roomId]);
    await lockStudent(db, user, campusId, initial.studentId);
    const stay = await lockedStay(db, user, campusId, id);
    if (stay.status !== "ACTIVE") throw new ApiError("A cancelled reservation has no stay to end.", 409);
    if (stay.next) throw new ApiError("This stay already ended with a move. End the current stay instead.", 409);
    if (stay.endDate && stay.endDate.getTime() === endDate.getTime()) return { allocation: stay, replayed: true };
    if (endDate <= stay.startDate) throw new ApiError("The end date must be after the start date. To remove a reservation that has not started, cancel it.", 400);
    if (stay.endDate && endDate > stay.endDate) throw new ApiError("A stay can be shortened here, not extended. Create a new allocation for the extra dates.", 400);
    const updated = await db.dormAllocation.update({ where: { id: stay.id }, data: { endDate, endReason: reason, endedById: user.userId } });
    await syncCurrentRoom(db, stay.studentId, await campusToday(user.schoolId, campusId, db));
    await writeAuditEvent(db, user, { table: "dorm_allocations", recordId: stay.id, action: "UPDATE", campusId, before: { endDate: dayText(stay.endDate) }, after: { endDate: dayText(endDate), reason } });
    return { allocation: updated, replayed: false };
  });
}

export async function cancelReservation(user: AuthUser, campusId: string, body: Body) {
  return schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const reason = reasonOf(body.reason);
    const initial = await lockedStay(db, user, campusId, id);
    await lockRooms(db, user, campusId, [initial.roomId]);
    await lockStudent(db, user, campusId, initial.studentId);
    const stay = await lockedStay(db, user, campusId, id);
    if (stay.status === "CANCELLED") return { allocation: stay, replayed: true };
    const today = await campusToday(user.schoolId, campusId, db);
    if (stay.startDate <= today || stay.previousId) throw new ApiError("Only a reservation that has not started can be cancelled. End the stay instead so its history is kept.", 409);
    const updated = await db.dormAllocation.update({ where: { id: stay.id }, data: { status: "CANCELLED", endReason: reason, endedById: user.userId } });
    await writeAuditEvent(db, user, { table: "dorm_allocations", recordId: stay.id, action: "UPDATE", campusId, before: { status: "ACTIVE" }, after: { status: "CANCELLED", reason } });
    return { allocation: updated, replayed: false };
  });
}

/** What a capacity or status change would do to the stays from today onwards. */
export async function roomChangeImpact(db: TxClient, room: { id: string; capacity: number }, today: Date, change: { capacity?: number; status?: string }) {
  const stays = (await db.dormAllocation.findMany({ where: { roomId: room.id, status: "ACTIVE" }, select: { id: true, startDate: true, endDate: true, student: { select: { fullName: true } } } }))
    .filter(stay => overlaps(stay, today, null));
  const peak = peakOccupancy(stays, today, null);
  const affected = stays.map(stay => ({ id: stay.id, studentName: stay.student.fullName, startDate: dayText(stay.startDate), endDate: dayText(stay.endDate) }));
  if (change.status === "OUT_OF_SERVICE" && stays.length) return { blocked: true as const, message: `${stays.length} current or future stay(s) use this room. Move or end them before taking it out of service.`, peak, affected };
  if (change.capacity !== undefined && change.capacity < peak) return { blocked: true as const, message: `Up to ${peak} students are allocated to this room from today. Move some before lowering capacity to ${change.capacity}.`, peak, affected };
  return { blocked: false as const, message: "", peak, affected };
}
