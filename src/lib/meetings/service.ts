import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { calendarDateIn } from "@/lib/datetime";
import { getLocalePackage } from "@/lib/locale/store";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { hhmm, localParts, minutes, zonedInstant } from "./time";

// SKO-420: parent–teacher meetings.
// - A teacher opens windows in school-local time; slots are computed from them and hidden where the teacher
//   teaches on the published timetable, is on approved leave, or the slot is past or taken.
// - A guardian with the communication permission for the child books one of the child's own teachers.
//   One live booking per teacher and start instant is enforced by a partial unique index, so two families
//   racing for the last slot get one booking and one clear "just booked" answer.
// - Every change is a versioned event (receipt). Reschedule happens in one transaction: if the new slot is
//   gone the original booking is untouched.
// - Follow-up: a shared summary and at most five owned actions reach the family only once shared; staff
//   notes are a separate table that no family function reads.
// This module sends no notifications (see ./notify) so it never opens the notification connection.

export const LIVE = ["CONFIRMED", "RESCHEDULE_NEEDED"];
const DAY = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORIZON_DAYS = 42, MAX_ACTIONS = 5;
const text = (value: unknown, max: number) => { const s = String(value ?? "").trim(); return s ? s.slice(0, max) : null; };

async function timezoneFor(schoolId: string, campusId: string | null) { return (await getLocalePackage(schoolId, campusId)).timezone; }

type Busy = { lessons: { weekday: number; start: number; end: number }[]; leave: { from: string; to: string }[] };
async function teacherBusy(db: TxClient, schoolId: string, teacherId: string): Promise<Busy> {
  const [lessons, leave] = await Promise.all([
    db.timetableSlot.findMany({ where: { schoolId, teacherId, slotType: "CLASS", timetable: { status: "PUBLISHED" } }, select: { dayOfWeek: true, startTime: true, endTime: true } }),
    db.leaveRequest.findMany({ where: { schoolId, userId: teacherId, status: "APPROVED" }, select: { fromDate: true, toDate: true } }),
  ]);
  return { lessons: lessons.filter(l => TIME.test(l.startTime) && TIME.test(l.endTime)).map(l => ({ weekday: l.dayOfWeek, start: minutes(l.startTime), end: minutes(l.endTime) })), leave: leave.map(l => ({ from: l.fromDate.toISOString().slice(0, 10), to: l.toDate.toISOString().slice(0, 10) })) };
}
/** Why a teacher cannot meet at this school-local time, or null. */
function conflict(busy: Busy, date: string, start: number, end: number, weekday: number) {
  if (busy.leave.some(l => l.from <= date && date <= l.to)) return "LEAVE" as const;
  if (busy.lessons.some(l => l.weekday === weekday && l.start < end && start < l.end)) return "TIMETABLE" as const;
  return null;
}

type Window = Prisma.MeetingWindowGetPayload<object>;
/** Slots of a window with their state for the viewer: open, taken, or blocked by lessons/leave/time. */
function windowSlots(window: Window, busy: Busy, taken: Set<number>, liveCount: number, now: Date) {
  const out: { startsAt: string; endsAt: string; start: string; end: string; state: "OPEN" | "TAKEN" | "BLOCKED" | "PAST" }[] = [];
  const from = minutes(window.startTime), to = minutes(window.endTime);
  const full = window.maxBookings !== null && liveCount >= window.maxBookings;
  for (let t = from; t + window.slotMinutes <= to; t += window.slotMinutes + window.bufferMinutes) {
    const startsAt = zonedInstant(window.localDate, hhmm(t), window.timezone), endsAt = zonedInstant(window.localDate, hhmm(t + window.slotMinutes), window.timezone);
    const weekday = localParts(startsAt, window.timezone).weekday;
    const state = startsAt <= now ? "PAST" : taken.has(startsAt.getTime()) ? "TAKEN" : conflict(busy, window.localDate, t, t + window.slotMinutes, weekday) || full ? "BLOCKED" : "OPEN";
    out.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), start: hhmm(t), end: hhmm(t + window.slotMinutes), state });
  }
  return out;
}

async function liveByWindow(db: TxClient, windowIds: string[]) {
  const rows = windowIds.length ? await db.meetingBooking.findMany({ where: { windowId: { in: windowIds }, status: { in: LIVE } }, select: { windowId: true, teacherId: true, startsAt: true } }) : [];
  return rows;
}

// ─── Staff ────────────────────────────────────────────────────────────────

function assertStaff(user: AuthUser) { if (user.role !== "TEACHER" && !canManageOperations(user)) throw new ApiError("Only staff can manage meetings.", 403); }

export async function createWindow(user: AuthUser, body: Record<string, unknown>) {
  assertStaff(user);
  const localDate = String(body.localDate ?? ""), startTime = String(body.startTime ?? ""), endTime = String(body.endTime ?? "");
  if (!DAY.test(localDate)) throw new ApiError("Choose the meeting day.", 400);
  if (!TIME.test(startTime) || !TIME.test(endTime) || minutes(endTime) <= minutes(startTime)) throw new ApiError("The window must end after it starts.", 400);
  const slotMinutes = Number(body.slotMinutes ?? 15), bufferMinutes = Number(body.bufferMinutes ?? 0);
  if (!Number.isInteger(slotMinutes) || slotMinutes < 5 || slotMinutes > 120) throw new ApiError("Meetings last between 5 and 120 minutes.", 400);
  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 60) throw new ApiError("The gap between meetings is at most 60 minutes.", 400);
  if (minutes(endTime) - minutes(startTime) < slotMinutes) throw new ApiError("The window is shorter than one meeting.", 400);
  const maxBookings = body.maxBookings === undefined || body.maxBookings === null || body.maxBookings === "" ? null : Number(body.maxBookings);
  if (maxBookings !== null && (!Number.isInteger(maxBookings) || maxBookings < 1)) throw new ApiError("The booking limit must be a whole number above zero.", 400);
  const mode = String(body.mode ?? "IN_PERSON");
  if (!["IN_PERSON", "REMOTE", "EITHER"].includes(mode)) throw new ApiError("Choose in person, remote, or either.", 400);
  const location = text(body.location, 200);
  if (mode !== "REMOTE" && !location) throw new ApiError("Say where in-person meetings take place.", 400);
  const cancellationPolicy = text(body.cancellationPolicy, 500);
  if (!cancellationPolicy) throw new ApiError("Explain how families can cancel or change a meeting.", 400);
  const timezone = await timezoneFor(user.schoolId, user.campusId ?? null);
  if (localDate < calendarDateIn(timezone)) throw new ApiError("Choose today or a later day.", 400);
  return prisma.meetingWindow.create({ data: { schoolId: user.schoolId, campusId: user.campusId ?? "", teacherId: user.userId, localDate, startTime, endTime, timezone, slotMinutes, bufferMinutes, maxBookings, mode, location, cancellationPolicy, createdById: user.userId } });
}

/** Withdraw a window; any live booking in it needs a new time and both sides are told (see ./notify). */
export async function withdrawWindow(user: AuthUser, windowId: string) {
  assertStaff(user);
  return schoolAiTransaction(user, async tx => {
    const window = await tx.meetingWindow.findFirst({ where: { id: windowId, schoolId: user.schoolId, teacherId: user.userId } });
    if (!window) throw new ApiError("Meeting window not found", 404);
    await tx.meetingWindow.update({ where: { id: window.id }, data: { status: "WITHDRAWN" } });
    const live = await tx.meetingBooking.findMany({ where: { windowId, status: "CONFIRMED", startsAt: { gt: new Date() } } });
    for (const booking of live) await markConflict(tx, booking, "WINDOW_WITHDRAWN", user.userId);
    return { affected: live.map(b => b.id) };
  });
}

async function event(tx: TxClient, booking: { id: string; schoolId: string }, version: number, action: string, actorId: string | null, detail: Record<string, unknown>) {
  await tx.meetingBookingEvent.create({ data: { schoolId: booking.schoolId, bookingId: booking.id, version, action, actorId, detail: detail as Prisma.InputJsonValue } });
}
export async function markConflict(tx: TxClient, booking: { id: string; schoolId: string; version: number }, reason: string, actorId: string | null) {
  const updated = await tx.meetingBooking.updateMany({ where: { id: booking.id, version: booking.version, status: "CONFIRMED" }, data: { status: "RESCHEDULE_NEEDED", conflictReason: reason, version: { increment: 1 } } });
  if (updated.count) await event(tx, booking, booking.version + 1, "CONFLICT", actorId, { reason });
  return updated.count > 0;
}

/**
 * Recheck a teacher's upcoming confirmed bookings against the published timetable and approved leave.
 * Returns the bookings that now need a new time (callers notify both sides).
 */
export async function findConflicts(schoolId: string, teacherIds: string[], actorId: string | null) {
  const affected: string[] = [];
  for (const teacherId of [...new Set(teacherIds)]) {
    const busy = await teacherBusy(prisma, schoolId, teacherId);
    const bookings = await prisma.meetingBooking.findMany({ where: { schoolId, teacherId, status: "CONFIRMED", startsAt: { gt: new Date() } }, include: { window: { select: { timezone: true } } } });
    for (const b of bookings) {
      const start = localParts(b.startsAt, b.window.timezone), end = localParts(b.endsAt, b.window.timezone);
      const reason = conflict(busy, start.date, minutes(start.time), minutes(end.time) || 24 * 60, start.weekday);
      if (reason && await prisma.$transaction(tx => markConflict(tx as TxClient, b, reason, actorId))) affected.push(b.id);
    }
  }
  return affected;
}

const sharedView = (b: Prisma.MeetingBookingGetPayload<{ include: { followUp: true; actions: true } }>) => ({
  followUp: b.followUp?.sharedAt ? { summary: b.followUp.summary, sharedAt: b.followUp.sharedAt } : null,
  actions: b.followUp?.sharedAt ? b.actions.map(a => ({ id: a.id, text: a.text, ownerRole: a.ownerRole, dueDate: a.dueDate, status: a.status, completedAt: a.completedAt })) : [],
});

export async function staffDesk(user: AuthUser) {
  assertStaff(user);
  const timezone = await timezoneFor(user.schoolId, user.campusId ?? null);
  const today = calendarDateIn(timezone), now = new Date();
  const windows = await prisma.meetingWindow.findMany({ where: { schoolId: user.schoolId, teacherId: user.userId, status: "OPEN", localDate: { gte: today } }, orderBy: [{ localDate: "asc" }, { startTime: "asc" }] });
  const busy = await teacherBusy(prisma, user.schoolId, user.userId);
  const live = await liveByWindow(prisma, windows.map(w => w.id));
  const bookings = await prisma.meetingBooking.findMany({ where: { schoolId: user.schoolId, teacherId: user.userId, OR: [{ status: { in: LIVE } }, { startsAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }] }, include: { followUp: true, actions: { orderBy: { createdAt: "asc" } }, notes: { orderBy: { createdAt: "asc" } }, events: { orderBy: { version: "asc" } }, window: { select: { location: true, timezone: true } } }, orderBy: { startsAt: "asc" } });
  const people = await peopleFor(user.schoolId, bookings);
  return {
    timezone, today,
    windows: windows.map(w => ({ ...w, slots: windowSlots(w, busy, new Set(live.filter(l => l.windowId === w.id).map(l => l.startsAt.getTime())), live.filter(l => l.windowId === w.id).length, now) })),
    bookings: bookings.map(b => ({ id: b.id, status: b.status, conflictReason: b.conflictReason, version: b.version, startsAt: b.startsAt, endsAt: b.endsAt, local: { ...localParts(b.startsAt, b.window.timezone), end: localParts(b.endsAt, b.window.timezone).time }, mode: b.mode, location: b.window.location, agenda: b.agenda, accessNeeds: b.accessNeeds, studentName: people.students.get(b.studentId) ?? "", guardianName: people.users.get(b.guardianUserId) ?? "", followUp: b.followUp ? { summary: b.followUp.summary, sharedAt: b.followUp.sharedAt } : null, actions: b.actions, notes: b.notes.map(n => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: people.users.get(n.authorId) ?? "" })), events: b.events.map(e => ({ version: e.version, action: e.action, createdAt: e.createdAt, detail: e.detail })) })),
  };
}

async function peopleFor(schoolId: string, bookings: { studentId: string; guardianUserId: string; teacherId: string; notes?: { authorId: string }[] }[]) {
  const studentIds = [...new Set(bookings.map(b => b.studentId))], userIds = [...new Set(bookings.flatMap(b => [b.guardianUserId, b.teacherId, ...(b.notes ?? []).map(n => n.authorId)]))];
  const [students, users] = await Promise.all([
    studentIds.length ? prisma.student.findMany({ where: { schoolId, id: { in: studentIds } }, select: { id: true, fullName: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { schoolId, id: { in: userIds } }, select: { id: true, fullName: true } }) : [],
  ]);
  return { students: new Map(students.map(s => [s.id, s.fullName])), users: new Map(users.map(u => [u.id, u.fullName ?? ""])) };
}

async function staffBooking(user: AuthUser, tx: TxClient, bookingId: string, lock = true) {
  assertStaff(user);
  if (lock) await tx.$queryRaw`SELECT id FROM meeting_bookings WHERE id = ${bookingId} AND school_id = ${user.schoolId} FOR UPDATE`;
  const booking = await tx.meetingBooking.findFirst({ where: { id: bookingId, schoolId: user.schoolId, teacherId: user.userId } });
  if (!booking) throw new ApiError("Meeting not found", 404);
  return booking;
}

/** Record whether the meeting took place. Neutral wording only: no automatic no-show label. */
export async function recordOutcome(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const booking = await staffBooking(user, tx, String(body.bookingId ?? ""));
    const outcome = String(body.outcome ?? "");
    if (!["HELD", "NOT_HELD"].includes(outcome)) throw new ApiError("Say whether the meeting took place.", 400);
    if (!["CONFIRMED", "HELD", "NOT_HELD"].includes(booking.status)) throw new ApiError("This meeting is not confirmed.", 409);
    if (booking.startsAt > new Date()) throw new ApiError("Record the outcome after the meeting time.", 409);
    await tx.meetingBooking.update({ where: { id: booking.id }, data: { status: outcome, version: { increment: 1 } } });
    await event(tx, booking, booking.version + 1, outcome, user.userId, {});
    return { status: outcome };
  });
}

/** Save the shared summary draft and agreed actions (each with one owner and a due date). */
export async function saveFollowUp(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const booking = await staffBooking(user, tx, String(body.bookingId ?? ""));
    if (booking.status !== "HELD") throw new ApiError("Record that the meeting took place before writing the follow-up.", 409);
    const existing = await tx.meetingFollowUp.findUnique({ where: { bookingId: booking.id } });
    if (existing?.sharedAt) throw new ApiError("The follow-up was already shared with the family.", 409);
    const summary = text(body.summary, 2000);
    if (!summary) throw new ApiError("Write the summary the family will read.", 400);
    const raw = Array.isArray(body.actions) ? body.actions as Record<string, unknown>[] : [];
    if (raw.length > MAX_ACTIONS) throw new ApiError("Agree at most five actions.", 400);
    const actions = raw.map(a => {
      const t = text(a.text, 300), ownerRole = String(a.ownerRole ?? ""), dueDate = String(a.dueDate ?? "");
      if (!t) throw new ApiError("Describe each action.", 400);
      if (!["FAMILY", "STAFF"].includes(ownerRole)) throw new ApiError("Give each action an owner.", 400);
      if (!DAY.test(dueDate)) throw new ApiError("Give each action a due date.", 400);
      return { text: t, ownerRole, dueDate, ownerUserId: ownerRole === "FAMILY" ? booking.guardianUserId : booking.teacherId };
    });
    await tx.meetingFollowUp.upsert({ where: { bookingId: booking.id }, create: { schoolId: user.schoolId, bookingId: booking.id, summary, updatedById: user.userId }, update: { summary, updatedById: user.userId } });
    await tx.meetingAction.deleteMany({ where: { bookingId: booking.id } });
    for (const a of actions) await tx.meetingAction.create({ data: { schoolId: user.schoolId, bookingId: booking.id, studentId: booking.studentId, createdById: user.userId, ...a } });
    return { actions: actions.length };
  });
}

/** Share the reviewed summary and actions with the family (once). Returns the guardian to notify. */
export async function shareFollowUp(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const booking = await staffBooking(user, tx, String(body.bookingId ?? ""));
    const followUp = await tx.meetingFollowUp.findUnique({ where: { bookingId: booking.id } });
    if (!followUp) throw new ApiError("Write the follow-up before sharing it.", 409);
    if (followUp.sharedAt) return { shared: false, guardianUserId: booking.guardianUserId, campusId: booking.campusId };
    await tx.meetingFollowUp.update({ where: { id: followUp.id }, data: { sharedAt: new Date(), sharedById: user.userId } });
    return { shared: true, guardianUserId: booking.guardianUserId, campusId: booking.campusId, actions: await tx.meetingAction.count({ where: { bookingId: booking.id } }) };
  });
}

export async function addStaffNote(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const booking = await staffBooking(user, tx, String(body.bookingId ?? ""), false);
    const note = text(body.body, 4000);
    if (!note) throw new ApiError("Write the note.", 400);
    return tx.meetingStaffNote.create({ data: { schoolId: user.schoolId, bookingId: booking.id, authorId: user.userId, body: note } });
  });
}

// ─── Guardians ────────────────────────────────────────────────────────────

async function guardianChild(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can book a meeting for a child.", 403);
  const student = await prisma.student.findFirst({ where: { id: studentId, schoolId: user.schoolId, archivedAt: null }, select: { id: true, campusId: true, classId: true, fullName: true, class: { select: { classTeacherId: true } } } });
  const relation = student ? await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "communication" }) : null;
  if (!student || !relation) throw new ApiError("You are not authorized to book for this child.", 404);
  return { student, relationshipId: relation.id };
}
/** The child's own teachers: the class teacher and the class's subject teachers. */
async function childTeachers(schoolId: string, student: { classId: string | null; class: { classTeacherId: string | null } | null }) {
  if (!student.classId) return [];
  const subjects = await prisma.subject.findMany({ where: { schoolId, classId: student.classId, teacherId: { not: null } }, select: { name: true, teacherId: true } });
  const ids = [...new Set([student.class?.classTeacherId, ...subjects.map(s => s.teacherId)].filter((id): id is string => Boolean(id)))];
  const users = ids.length ? await prisma.user.findMany({ where: { schoolId, id: { in: ids }, isActive: true }, select: { id: true, fullName: true } }) : [];
  return users.map(u => ({ id: u.id, name: u.fullName ?? "", classTeacher: u.id === student.class?.classTeacherId, subjects: subjects.filter(s => s.teacherId === u.id).map(s => s.name) }));
}

export async function familyMeetings(user: AuthUser, studentId: string) {
  const { student } = await guardianChild(user, studentId);
  const timezone = await timezoneFor(user.schoolId, student.campusId);
  const today = calendarDateIn(timezone), now = new Date();
  const last = calendarDateIn(timezone, new Date(now.getTime() + HORIZON_DAYS * 86_400_000));
  const teachers = await childTeachers(user.schoolId, student);
  const windows = teachers.length ? await prisma.meetingWindow.findMany({ where: { schoolId: user.schoolId, teacherId: { in: teachers.map(t => t.id) }, status: "OPEN", localDate: { gte: today, lte: last } }, orderBy: [{ localDate: "asc" }, { startTime: "asc" }] }) : [];
  const live = await liveByWindow(prisma, windows.map(w => w.id));
  const busy = new Map<string, Busy>();
  for (const t of new Set(windows.map(w => w.teacherId))) busy.set(t, await teacherBusy(prisma, user.schoolId, t));
  const bookings = await prisma.meetingBooking.findMany({ where: { schoolId: user.schoolId, studentId: student.id }, include: { followUp: true, actions: { orderBy: { createdAt: "asc" } }, window: { select: { location: true, timezone: true, cancellationPolicy: true } }, events: { orderBy: { version: "desc" }, take: 1 } }, orderBy: { startsAt: "desc" }, take: 20 });
  const names = new Map(teachers.map(t => [t.id, t.name]));
  return {
    timezone, child: { id: student.id, name: student.fullName }, teachers,
    windows: windows.map(w => ({ id: w.id, teacherId: w.teacherId, localDate: w.localDate, mode: w.mode, location: w.location, slotMinutes: w.slotMinutes, cancellationPolicy: w.cancellationPolicy, slots: windowSlots(w, busy.get(w.teacherId)!, new Set(live.filter(l => l.windowId === w.id).map(l => l.startsAt.getTime())), live.filter(l => l.windowId === w.id).length, now).filter(s => s.state === "OPEN").map(({ state: _state, ...s }) => s) })).filter(w => w.slots.length),
    bookings: bookings.map(b => ({ id: b.id, status: b.status, conflictReason: b.conflictReason, version: b.version, teacherId: b.teacherId, teacherName: names.get(b.teacherId) ?? "", startsAt: b.startsAt, endsAt: b.endsAt, local: { ...localParts(b.startsAt, b.window.timezone), end: localParts(b.endsAt, b.window.timezone).time }, mode: b.mode, location: b.window.location, cancellationPolicy: b.window.cancellationPolicy, agenda: b.agenda, accessNeeds: b.accessNeeds, mine: b.guardianUserId === user.userId, lastChange: b.events[0] ? { version: b.events[0].version, action: b.events[0].action, at: b.events[0].createdAt } : null, ...sharedView(b) })),
  };
}

/** Lock and recheck a slot for booking: window open, the child's teacher, a real open slot, under the limit. */
async function openSlot(tx: TxClient, schoolId: string, windowId: string, startsAtIso: string, teacherIds: string[], ignoreBookingId?: string) {
  await tx.$queryRaw`SELECT id FROM meeting_windows WHERE id = ${windowId} AND school_id = ${schoolId} FOR UPDATE`;
  const window = await tx.meetingWindow.findFirst({ where: { id: windowId, schoolId, status: "OPEN" } });
  if (!window || !teacherIds.includes(window.teacherId)) throw new ApiError("That time is no longer available. Choose another available time.", 409);
  const live = (await tx.meetingBooking.findMany({ where: { windowId, status: { in: LIVE }, ...(ignoreBookingId ? { id: { not: ignoreBookingId } } : {}) }, select: { startsAt: true } }));
  const slots = windowSlots(window, await teacherBusy(tx, schoolId, window.teacherId), new Set(live.map(l => l.startsAt.getTime())), live.length, new Date());
  const slot = slots.find(s => s.startsAt === new Date(startsAtIso).toISOString());
  if (!slot) throw new ApiError("That time is not one of this teacher's slots.", 400);
  if (slot.state === "TAKEN") throw new ApiError("That slot was just booked. Choose another available time.", 409);
  if (slot.state !== "OPEN") throw new ApiError("That time is no longer available. Choose another available time.", 409);
  return { window, slot };
}
const chooseMode = (windowMode: string, requested: unknown) => {
  if (windowMode !== "EITHER") return windowMode;
  const mode = String(requested ?? "");
  if (!["IN_PERSON", "REMOTE"].includes(mode)) throw new ApiError("Choose in person or remote.", 400);
  return mode;
};
const isSlotRace = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && !String(error.meta?.target ?? "").includes("request_key");

export async function bookMeeting(user: AuthUser, body: Record<string, unknown>) {
  const { student, relationshipId } = await guardianChild(user, String(body.studentId ?? ""));
  const requestKey = String(body.requestKey ?? "");
  if (requestKey.length < 8 || requestKey.length > 120) throw new ApiError("Missing request key.", 400);
  const repeated = await prisma.meetingBooking.findFirst({ where: { requestKey, schoolId: user.schoolId, guardianUserId: user.userId } });
  if (repeated) return { booking: repeated, repeated: true };
  const teachers = (await childTeachers(user.schoolId, student)).map(t => t.id);
  try {
    return await schoolAiTransaction(user, async tx => {
      const { window, slot } = await openSlot(tx, user.schoolId, String(body.windowId ?? ""), String(body.startsAt ?? ""), teachers);
      const already = await tx.meetingBooking.findFirst({ where: { schoolId: user.schoolId, studentId: student.id, teacherId: window.teacherId, status: { in: LIVE }, startsAt: { gt: new Date() } } });
      if (already) throw new ApiError("This child already has a meeting with this teacher. Change that meeting instead.", 409);
      const booking = await tx.meetingBooking.create({ data: { schoolId: user.schoolId, campusId: window.campusId, windowId: window.id, teacherId: window.teacherId, studentId: student.id, guardianUserId: user.userId, relationshipId, startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt), mode: chooseMode(window.mode, body.mode), agenda: text(body.agenda, 1000), accessNeeds: text(body.accessNeeds, 500), requestKey } });
      await event(tx, booking, 1, "BOOKED", user.userId, { startsAt: slot.startsAt, endsAt: slot.endsAt });
      return { booking, repeated: false };
    });
  } catch (error) {
    if (isSlotRace(error)) throw new ApiError("That slot was just booked. Choose another available time.", 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const again = await prisma.meetingBooking.findFirst({ where: { requestKey, guardianUserId: user.userId } }); if (again) return { booking: again, repeated: true }; }
    throw error;
  }
}

/** Load a booking for its guardian (relationship rechecked) or its teacher, locked. */
async function participantBooking(user: AuthUser, tx: TxClient, bookingId: string) {
  await tx.$queryRaw`SELECT id FROM meeting_bookings WHERE id = ${bookingId} AND school_id = ${user.schoolId} FOR UPDATE`;
  const booking = await tx.meetingBooking.findFirst({ where: { id: bookingId, schoolId: user.schoolId } });
  if (!booking) throw new ApiError("Meeting not found", 404);
  if (user.role === "PARENT") {
    if (booking.guardianUserId !== user.userId || !(await guardianHasAccess({ schoolId: user.schoolId, studentId: booking.studentId, guardianUserId: user.userId, permission: "communication" }))) throw new ApiError("Meeting not found", 404);
  } else if (booking.teacherId !== user.userId) throw new ApiError("Meeting not found", 404);
  return booking;
}
const otherParty = (user: AuthUser, booking: { guardianUserId: string; teacherId: string }) => user.role === "PARENT" ? booking.teacherId : booking.guardianUserId;

/** Move a live booking to another open slot of the same teacher. If the slot is gone, nothing changes. */
export async function rescheduleMeeting(user: AuthUser, body: Record<string, unknown>) {
  try {
    return await schoolAiTransaction(user, async tx => {
      const booking = await participantBooking(user, tx, String(body.bookingId ?? ""));
      if (!LIVE.includes(booking.status)) throw new ApiError("Only an upcoming meeting can be moved.", 409);
      if (Number(body.knownVersion) !== booking.version) throw new ApiError("This meeting changed since you opened it. Review the latest details.", 409);
      const { window, slot } = await openSlot(tx, user.schoolId, String(body.windowId ?? ""), String(body.startsAt ?? ""), [booking.teacherId], booking.id);
      await tx.meetingBooking.update({ where: { id: booking.id }, data: { windowId: window.id, startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt), mode: chooseMode(window.mode, body.mode ?? booking.mode), status: "CONFIRMED", conflictReason: null, remindedAt: null, version: { increment: 1 } } });
      await event(tx, booking, booking.version + 1, "RESCHEDULED", user.userId, { from: booking.startsAt.toISOString(), to: slot.startsAt });
      return { bookingId: booking.id, version: booking.version + 1, startsAt: slot.startsAt, notify: otherParty(user, booking), campusId: booking.campusId };
    });
  } catch (error) {
    if (isSlotRace(error)) throw new ApiError("That slot was just booked. Choose another available time.", 409);
    throw error;
  }
}

export async function cancelMeeting(user: AuthUser, body: Record<string, unknown>) {
  return schoolAiTransaction(user, async tx => {
    const booking = await participantBooking(user, tx, String(body.bookingId ?? ""));
    if (!LIVE.includes(booking.status)) throw new ApiError("Only an upcoming meeting can be cancelled.", 409);
    if (Number(body.knownVersion) !== booking.version) throw new ApiError("This meeting changed since you opened it. Review the latest details.", 409);
    await tx.meetingBooking.update({ where: { id: booking.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
    await event(tx, booking, booking.version + 1, "CANCELLED", user.userId, { by: user.role === "PARENT" ? "FAMILY" : "STAFF", reason: text(body.reason, 300) });
    return { bookingId: booking.id, version: booking.version + 1, notify: otherParty(user, booking), campusId: booking.campusId };
  });
}

/** The owner of an agreed action (or the teacher) marks it done; the completion is kept. */
export async function completeAction(user: AuthUser, actionId: string) {
  return schoolAiTransaction(user, async tx => {
    const action = await tx.meetingAction.findFirst({ where: { id: actionId, schoolId: user.schoolId }, include: { booking: { include: { followUp: true } } } });
    if (!action || !action.booking.followUp?.sharedAt) throw new ApiError("Action not found", 404);
    const allowed = user.role === "PARENT" ? action.ownerRole === "FAMILY" && action.booking.guardianUserId === user.userId && Boolean(await guardianHasAccess({ schoolId: user.schoolId, studentId: action.studentId, guardianUserId: user.userId, permission: "communication" })) : action.booking.teacherId === user.userId;
    if (!allowed) throw new ApiError("Action not found", 404);
    if (action.status === "DONE") return action;
    return tx.meetingAction.update({ where: { id: action.id }, data: { status: "DONE", completedAt: new Date(), completedById: user.userId } });
  });
}

/** Open family-owned actions and meetings that need a new time, for the family inbox. */
export async function familyMeetingItems(schoolId: string, guardianUserId: string, studentIds: string[]) {
  if (!studentIds.length) return { actions: [], reschedule: [] };
  const [actions, reschedule] = await Promise.all([
    prisma.meetingAction.findMany({ where: { schoolId, studentId: { in: studentIds }, ownerRole: "FAMILY", booking: { guardianUserId, followUp: { sharedAt: { not: null } } } }, orderBy: { dueDate: "asc" }, take: 30 }),
    prisma.meetingBooking.findMany({ where: { schoolId, studentId: { in: studentIds }, guardianUserId, status: "RESCHEDULE_NEEDED" }, select: { id: true, studentId: true, startsAt: true, conflictReason: true, updatedAt: true } }),
  ]);
  return { actions, reschedule };
}

/** Confirmed meetings starting within the next day that have not been reminded (cron). */
export async function dueReminders(now = new Date()) {
  return prisma.meetingBooking.findMany({ where: { status: "CONFIRMED", remindedAt: null, startsAt: { gt: now, lte: new Date(now.getTime() + 86_400_000) } }, select: { id: true, schoolId: true, campusId: true, guardianUserId: true, teacherId: true, startsAt: true }, take: 500 });
}
