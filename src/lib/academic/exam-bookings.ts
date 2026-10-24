import type { TxClient } from "@/lib/db/prisma";
import { SchoolAiError } from "@/lib/school-ai/access";
import { loadLocaleTimeline } from "@/lib/locale/store";
import { getSubstituteBookings } from "@/lib/school-ai/school-operations-bookings";

export type ExamBookingScope = { schoolId: string; campusId: string; academicYear?: number; term?: string };
export type ExamReservation = { id: string; classId: string; academicYear: number; term: string; date: string; periodDefinitionId: string | null; roomIds: string[]; teacherIds: string[] };
const knownTerms = ["ANNUAL", "TERM_1", "TERM_2", "TERM_3"];
export function termsOverlap(first: string, second: string) { return first === second || first === "ANNUAL" || second === "ANNUAL" || !knownTerms.includes(first) || !knownTerms.includes(second); }
export function examWeekday(date: string) { return new Date(`${date}T00:00:00Z`).getUTCDay() || 7; }
export function validExamWindow(start: string, end: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) && start < end; }
function fail(message: string, code = "EXAM_PLAN_CLASH"): never { throw new SchoolAiError(message, 409, code); }
export async function getCampusExamReservations(db: TxClient, scope: ExamBookingScope) {
  const rows = await db.examSchedule.findMany({
    where: { schoolId: scope.schoolId, campusId: scope.campusId, exam: { status: { notIn: ["CANCELLED", "ARCHIVED"] }, class: { archivedAt: null }, ...(scope.academicYear ? { academicYear: scope.academicYear } : {}) } },
    include: { periodDefinition: true, room: { select: { id: true, roomNumber: true } }, exam: { select: { classId: true, academicYear: true, term: true, title: true, class: { select: { name: true, section: true } } } }, rooms: { include: { room: { select: { id: true, roomNumber: true } }, invigilation: { include: { teacher: { select: { id: true, fullName: true } } } } } } },
    orderBy: { id: "asc" }, take: 5001,
  });
  if (rows.length > 5000) fail("This campus needs a narrower exam planning scope.", "EXAM_PLAN_LIMIT");
  return rows.filter(row => !scope.term || termsOverlap(scope.term, row.exam.term));
}
export async function getExamBookingSlots(db: TxClient, scope: ExamBookingScope): Promise<Array<{ id: string; dayOfWeek: number; periodNumber: number; startTime: string; endTime: string; teacherId: string | null; roomId: string | null; teacherName: string | null; roomNumber: string | null; examTitle: string; className: string }>> {
  const rows = await getCampusExamReservations(db, scope);
  return rows.flatMap(row => {
    const rooms = row.rooms.map(room => ({ roomId: room.roomId, roomNumber: room.room.roomNumber, teacherId: room.invigilation?.teacherId ?? null, teacherName: room.invigilation?.teacher.fullName ?? null }));
    if (row.room && !rooms.some(room => room.roomId === row.room!.id)) rooms.push({ roomId: row.room.id, roomNumber: row.room.roomNumber, teacherId: null, teacherName: null });
    if (!rooms.length) return [];
    const period = row.periodDefinition;
    if (!period || !validExamWindow(period.startTime, period.endTime)) fail("An existing exam reservation has no valid time. Correct its datesheet before scheduling shared resources.", "EXAM_PLAN_EXISTING_INVALID");
    return rooms.map(room => ({ ...room, id: `${row.id}:${room.roomId}`, dayOfWeek: examWeekday(row.date.toISOString().slice(0, 10)), periodNumber: period.periodNumber, startTime: period.startTime, endTime: period.endTime, examTitle: row.exam.title, className: [row.exam.class.name, row.exam.class.section].filter(Boolean).join(" · ") }));
  });
}
/** Validate exact proposed reservations against one another and current exam/lesson commitments. Caller owns campus fence for writes. */
export async function assertExamReservations(db: TxClient, scope: { schoolId: string; campusId: string }, proposed: ExamReservation[], excludedIds: string[] = []) {
  if (!proposed.length) return;
  for (const item of proposed) {
    if (new Set(item.roomIds).size !== item.roomIds.length || new Set(item.teacherIds).size !== item.teacherIds.length) fail("Each room needs a distinct invigilator for this paper.");
  }
  const ids = [...new Set(proposed.flatMap(item => item.periodDefinitionId ? [item.periodDefinitionId] : []))];
  const [periods, existing, holidays, localeAt] = await Promise.all([
    db.periodDefinition.findMany({ where: { ...scope, id: { in: ids }, timeType: "EXAM" }, orderBy: { id: "asc" } }),
    getCampusExamReservations(db, scope),
    db.holiday.findMany({ where: scope, orderBy: { id: "asc" } }),
    loadLocaleTimeline(scope.schoolId, scope.campusId, db),
  ]);
  const classIds = [...new Set(proposed.map(item => item.classId))];
  const teacherIdsRequested = [...new Set(proposed.flatMap(item => item.teacherIds))];
  const [classes, cycles, teachers, rooms] = await Promise.all([
    db.class.findMany({ where: { ...scope, id: { in: classIds }, status: "ACTIVE", archivedAt: null }, select: { id: true, academicYear: true }, orderBy: { id: "asc" } }),
    db.academicCycle.findMany({ where: { ...scope, academicYear: { in: [...new Set(proposed.map(item => item.academicYear))] } }, select: { academicYear: true, status: true, startDate: true, endDate: true }, orderBy: { academicYear: "asc" } }),
    db.user.findMany({ where: { ...scope, id: { in: teacherIdsRequested }, role: { in: ["TEACHER", "PRINCIPAL"] }, isActive: true }, select: { id: true }, orderBy: { id: "asc" } }),
    db.classRoom.findMany({ where: { ...scope, id: { in: [...new Set(proposed.flatMap(item => item.roomIds))] } }, select: { id: true }, orderBy: { id: "asc" } }),
  ]);
  if (rooms.length !== new Set(proposed.flatMap(item => item.roomIds)).size || teachers.length !== teacherIdsRequested.length || proposed.some(item => !classes.some(cls => cls.id === item.classId && cls.academicYear === item.academicYear))) fail("The current class or invigilator is unavailable in this campus and year.", "EXAM_PLAN_REFERENCE");
  for (const item of proposed) {
    const cycle = cycles.find(year => year.academicYear === item.academicYear), date = new Date(`${item.date}T00:00:00Z`);
    if (cycle && (!["ACTIVE", "DRAFT"].includes(cycle.status) || cycle.startDate && date < cycle.startDate || cycle.endDate && date > cycle.endDate)) fail("This paper is outside an editable academic year.", "EXAM_PLAN_YEAR");
  }
  const rows = existing.filter(item => !excludedIds.includes(item.id));
  const windows = new Map(periods.map(period => [period.id, period]));
  const prepared = proposed.map(item => {
    const period = item.periodDefinitionId ? windows.get(item.periodDefinitionId) : null;
    if (item.periodDefinitionId && (!period || !validExamWindow(period.startTime, period.endTime))) fail("Choose a current EXAM period with valid start/end times.", "EXAM_PLAN_PERIOD");
    const date = new Date(`${item.date}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.date) fail("Choose a real calendar date.", "EXAM_PLAN_DATE");
    if (localeAt(date).weekend.map(day => day || 7).includes(examWeekday(item.date))) fail("A proposed exam falls on a campus weekend.", "EXAM_PLAN_WEEKEND");
    if (holidays.some(day => day.fromDate <= date && day.toDate >= date)) fail("A proposed exam falls on a campus holiday.", "EXAM_PLAN_HOLIDAY");
    return { ...item, startTime: period?.startTime ?? null, endTime: period?.endTime ?? null };
  });
  const substitutes = await getSubstituteBookings(db, scope);
  for (const item of prepared) if (substitutes.some(duty => duty.date === item.date && item.teacherIds.includes(duty.teacherId) && (!item.startTime || !item.endTime || duty.startTime < item.endTime && item.startTime < duty.endTime))) fail("An invigilator has substitute lesson cover during this paper.", "SCHOOL_OPERATIONS_TEACHER_CLASH");
  const overlaps = (a: { startTime: string | null; endTime: string | null }, b: { startTime: string | null; endTime: string | null }) => !a.startTime || !a.endTime || !b.startTime || !b.endTime || !validExamWindow(b.startTime, b.endTime) || a.startTime < b.endTime && b.startTime < a.endTime;
  const reservations = rows.map(row => ({ id: row.id, date: row.date.toISOString().slice(0, 10), classId: row.exam.classId, roomIds: [...new Set([...(row.roomId ? [row.roomId] : []), ...row.rooms.map(room => room.roomId)])], teacherIds: row.rooms.flatMap(room => room.invigilation ? [room.invigilation.teacherId] : []), startTime: row.periodDefinition?.startTime ?? null, endTime: row.periodDefinition?.endTime ?? null }));
  for (const [index, candidate] of prepared.entries()) {
    for (const other of [...reservations, ...prepared.slice(0, index)]) {
      if (candidate.date !== other.date || !overlaps(candidate, other)) continue;
      if (candidate.classId === other.classId || candidate.roomIds.some(id => other.roomIds.includes(id)) || candidate.teacherIds.some(id => other.teacherIds.includes(id))) fail("A class, room or invigilator is already reserved at this time.");
    }
  }
  const roomIds = [...new Set(proposed.flatMap(item => item.roomIds))], teacherIds = [...new Set(proposed.flatMap(item => item.teacherIds))];
  const [lessons, leaves] = await Promise.all([
    db.timetableSlot.findMany({ where: { schoolId: scope.schoolId, timetable: { campusId: scope.campusId, status: "PUBLISHED" }, slotType: "CLASS", OR: [{ roomId: { in: roomIds } }, { teacherId: { in: teacherIds } }, { timetable: { classId: { in: classIds } } }] }, include: { timetable: { select: { academicYear: true, term: true, classId: true } } }, take: 10001, orderBy: { id: "asc" } }),
    db.leaveRequest.findMany({ where: { ...scope, userId: { in: teacherIds }, status: "APPROVED" }, select: { userId: true, fromDate: true, toDate: true }, orderBy: { id: "asc" } }),
  ]);
  if (lessons.length > 10000) fail("This campus needs a narrower resource planning scope.", "EXAM_PLAN_LIMIT");
  for (const candidate of prepared) {
    if (lessons.some(lesson => lesson.timetable.academicYear === candidate.academicYear && termsOverlap(lesson.timetable.term, candidate.term) && lesson.dayOfWeek === examWeekday(candidate.date) && (lesson.timetable.classId === candidate.classId || lesson.roomId && candidate.roomIds.includes(lesson.roomId) || lesson.teacherId && candidate.teacherIds.includes(lesson.teacherId)) && overlaps(candidate, lesson))) fail("A published lesson already uses a selected room or invigilator at this time.", "EXAM_PLAN_LESSON_CLASH");
    if (leaves.some(leave => candidate.teacherIds.includes(leave.userId) && leave.fromDate.toISOString().slice(0, 10) <= candidate.date && leave.toDate.toISOString().slice(0, 10) >= candidate.date)) fail("A selected invigilator has approved leave on this date.", "EXAM_PLAN_LEAVE");
  }
  return { periods, rooms, existing: rows, holidays, lessons, leaves, classes, cycles, teachers, calendar: proposed.map(item => ({ date: item.date, weekend: localeAt(new Date(`${item.date}T00:00:00Z`)).weekend })) };
}
export async function validateStoredExamSchedules(db: TxClient, scope: { schoolId: string; campusId: string }, scheduleIds: string[]) {
  const rows = (await getCampusExamReservations(db, scope)).filter(row => scheduleIds.includes(row.id));
  if (rows.length !== new Set(scheduleIds).size) fail("A paper is no longer editable in this campus.", "EXAM_PLAN_REFERENCE");
  await assertExamReservations(db, scope, rows.map(row => ({ id: row.id, classId: row.exam.classId, academicYear: row.exam.academicYear, term: row.exam.term, date: row.date.toISOString().slice(0, 10), periodDefinitionId: row.periodDefinitionId, roomIds: [...new Set([...(row.roomId ? [row.roomId] : []), ...row.rooms.map(room => room.roomId)])], teacherIds: row.rooms.flatMap(room => room.invigilation ? [room.invigilation.teacherId] : []) })), rows.map(row => row.id));
}
