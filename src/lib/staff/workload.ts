import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, canManageOperations } from "@/lib/api/scope";
import { createWorkspaceRecord } from "@/lib/school-ai/repository";
import { writeAuditEvent } from "@/lib/audit-events";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { otherCampusClashes, TRAVEL_MINUTES } from "@/lib/cover/travel";

// SKO-399: teaching workload and absence cover, connected to the hierarchy but separate from access.
// Workload names its period and counts published teaching periods, dated cover duties, exam invigilation
// and approved leave; capacity is the contracted figure on the staff profile, or "unknown". Cover lists
// every lesson whose teacher is on approved leave and has no cover, with each candidate's reasons. A
// proposal goes to the existing reviewed substitution workflow — nothing here edits a timetable.

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const parseDay = (value: string | null, label: string) => {
  if (!value || !DAY.test(value)) throw new ApiError(`${label} must be a date (YYYY-MM-DD).`, 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ApiError(`${label} is not a real date.`, 400);
  return date;
};
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
/** Timetable days are 1=Mon … 6=Sat (7=Sun). */
const timetableDay = (date: Date) => ((date.getUTCDay() + 6) % 7) + 1;
const overlap = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

export function assertWorkloadAccess(user: AuthUser) {
  if (!canManageOperations(user)) throw new ApiError("Workload and cover are for campus leaders.", 403);
}

async function activeYear(schoolId: string, campusId: string) {
  const cycle = await prisma.academicCycle.findFirst({ where: { schoolId, campusId, status: "ACTIVE" }, select: { academicYear: true } });
  return cycle?.academicYear ?? null;
}

async function publishedSlots(schoolId: string, campusId: string) {
  const year = await activeYear(schoolId, campusId);
  if (!year) return [];
  return prisma.timetableSlot.findMany({
    where: { schoolId, slotType: "CLASS", teacherId: { not: null }, timetable: { campusId, status: "PUBLISHED", academicYear: year, class: { archivedAt: null } } },
    select: { id: true, dayOfWeek: true, periodNumber: true, startTime: true, endTime: true, teacherId: true, subjectId: true, subject: { select: { name: true } }, timetable: { select: { classId: true, class: { select: { name: true, section: true } } } } },
  });
}

const teachersOf = (schoolId: string, campusId: string) => prisma.user.findMany({
  where: { schoolId, campusId, isActive: true, role: "TEACHER" },
  select: { id: true, fullName: true, staffProfile: { select: { contractedPeriodsPerWeek: true, designation: true, primaryDepartment: { select: { name: true } } } } },
  orderBy: { fullName: "asc" },
});

export async function weekWorkload(user: AuthUser, campusId: string, weekStartText: string | null) {
  assertWorkloadAccess(user);
  const weekStart = parseDay(weekStartText, "Week start");
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const [teachers, slots, cover, invigilation, leave] = await Promise.all([
    teachersOf(user.schoolId, campusId),
    publishedSlots(user.schoolId, campusId),
    prisma.schoolAiSubstituteDuty.findMany({ where: { schoolId: user.schoolId, campusId, status: "ASSIGNED", date: { gte: weekStart, lt: weekEnd } }, select: { teacherId: true } }),
    prisma.examInvigilation.findMany({ where: { schoolId: user.schoolId, campusId, examRoom: { examSchedule: { date: { gte: weekStart, lt: weekEnd } } } }, select: { teacherId: true } }),
    prisma.leaveRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: "APPROVED", fromDate: { lt: weekEnd }, toDate: { gte: weekStart } }, select: { userId: true, fromDate: true, toDate: true } }),
  ]);
  const rows = teachers.map(teacher => {
    // The same weekly slot can appear in more than one term's timetable; count each day/period once.
    const teaching = new Set(slots.filter(slot => slot.teacherId === teacher.id).map(slot => `${slot.dayOfWeek}:${slot.periodNumber}`)).size;
    const coverDuties = cover.filter(duty => duty.teacherId === teacher.id).length;
    const invigilations = invigilation.filter(row => row.teacherId === teacher.id).length;
    let leaveDays = 0;
    for (const request of leave.filter(row => row.userId === teacher.id)) {
      for (let day = new Date(Math.max(request.fromDate.getTime(), weekStart.getTime())); day < weekEnd && day <= request.toDate; day = new Date(day.getTime() + 86_400_000)) leaveDays += 1;
    }
    const capacity = teacher.staffProfile?.contractedPeriodsPerWeek ?? null;
    const load = teaching + coverDuties;
    return {
      id: teacher.id, name: teacher.fullName, rank: teacher.staffProfile?.designation ?? null, department: teacher.staffProfile?.primaryDepartment?.name ?? null,
      teaching, coverDuties, invigilations, leaveDays, capacity, load,
      percent: capacity ? Math.round((load / capacity) * 100) : null,
      overCapacity: capacity !== null && load > capacity,
    };
  });
  return { weekStart: isoDay(weekStart), weekEnd: isoDay(new Date(weekEnd.getTime() - 86_400_000)), definition: "Load = published weekly teaching periods + dated cover duties this week. Invigilation and approved leave are shown beside it. Capacity is the contracted periods per week on the staff profile; when it is not set, no percentage is shown.", rows };
}

export async function setCapacity(user: AuthUser, campusId: string, staffId: string, value: unknown) {
  assertWorkloadAccess(user);
  const capacity = value === null || value === "" ? null : Number(value);
  if (capacity !== null && (!Number.isInteger(capacity) || capacity < 0 || capacity > 80)) throw new ApiError("Capacity must be a whole number of periods from 0 to 80, or empty for unknown.", 400);
  return schoolAiTransaction(user, async db => {
    const staff = await db.user.findFirst({ where: { id: staffId, schoolId: user.schoolId, campusId, isActive: true }, select: { id: true, staffProfile: { select: { contractedPeriodsPerWeek: true } } } });
    if (!staff) throw new ApiError("Staff member not found in this campus", 404);
    await db.staffProfile.upsert({ where: { userId: staffId }, create: { schoolId: user.schoolId, userId: staffId, contractedPeriodsPerWeek: capacity }, update: { contractedPeriodsPerWeek: capacity } });
    await writeAuditEvent(db, user, { table: "staff_profiles", recordId: staffId, action: "UPDATE", campusId, before: { contractedPeriodsPerWeek: staff.staffProfile?.contractedPeriodsPerWeek ?? null }, after: { contractedPeriodsPerWeek: capacity } });
    return { capacity };
  });
}

export type Candidate = { id: string; name: string; eligible: boolean; reasons: string[]; conflicts: string[]; warnings: string[] };

/** Lessons on `date` whose teacher is on approved leave and has no assigned cover, with candidates. */
export async function coverBoard(user: AuthUser, campusId: string, dateText: string | null) {
  assertWorkloadAccess(user);
  const date = parseDay(dateText, "Date");
  const day = timetableDay(date);
  const weekStart = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000);
  const [teachers, slots, onLeave, duties, exams, workload] = await Promise.all([
    teachersOf(user.schoolId, campusId),
    publishedSlots(user.schoolId, campusId),
    prisma.leaveRequest.findMany({ where: { schoolId: user.schoolId, campusId, status: "APPROVED", fromDate: { lte: date }, toDate: { gte: date } }, select: { userId: true } }),
    prisma.schoolAiSubstituteDuty.findMany({ where: { schoolId: user.schoolId, campusId, status: "ASSIGNED", date }, select: { timetableSlotId: true, teacherId: true } }),
    prisma.examInvigilation.findMany({ where: { schoolId: user.schoolId, campusId, examRoom: { examSchedule: { date } } }, select: { teacherId: true, examRoom: { select: { examSchedule: { select: { periodDefinition: { select: { startTime: true, endTime: true } } } } } } } }),
    weekWorkload(user, campusId, isoDay(weekStart)),
  ]);
  const absent = new Set(onLeave.map(row => row.userId));
  const covered = new Set(duties.map(duty => duty.timetableSlotId));
  const today = slots.filter(slot => slot.dayOfWeek === day);
  const uncovered = today.filter(slot => slot.teacherId && absent.has(slot.teacherId) && !covered.has(slot.id))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const loads = new Map(workload.rows.map(row => [row.id, row]));
  // SKO-442: a candidate teaching at another campus near this time needs travel time in between.
  const travel = new Map<string, Awaited<ReturnType<typeof otherCampusClashes>>>();
  for (const slot of uncovered) travel.set(slot.id, await otherCampusClashes(prisma, { schoolId: user.schoolId, campusId, teacherIds: teachers.map(t => t.id), dayOfWeek: day, startTime: slot.startTime, endTime: slot.endTime }));
  const lessons = uncovered.map(slot => {
    const candidates: Candidate[] = teachers.filter(teacher => teacher.id !== slot.teacherId).map(teacher => {
      const reasons: string[] = [], conflicts: string[] = [], warnings: string[] = [];
      if (absent.has(teacher.id)) conflicts.push("On approved leave that day");
      const clash = today.find(other => other.id !== slot.id && overlap(other, slot) && (duties.find(d => d.timetableSlotId === other.id)?.teacherId ?? other.teacherId) === teacher.id);
      if (clash) conflicts.push(`Teaching ${clash.timetable.class.name}${clash.timetable.class.section ? ` ${clash.timetable.class.section}` : ""} at this time`);
      const covering = duties.some(d => d.teacherId === teacher.id && today.some(other => other.id === d.timetableSlotId && overlap(other, slot)));
      if (covering) conflicts.push("Already covering another lesson at this time");
      const exam = exams.find(row => row.teacherId === teacher.id && (!row.examRoom.examSchedule.periodDefinition || overlap(row.examRoom.examSchedule.periodDefinition, slot)));
      if (exam) conflicts.push("Invigilating an exam at this time");
      const away = travel.get(slot.id)?.get(teacher.id);
      if (away) conflicts.push(`Teaching at ${away.campusName} ${away.startTime}–${away.endTime}; not enough travel time (${TRAVEL_MINUTES} min)`);
      if (!conflicts.length) reasons.push("No lesson, cover or invigilation at this time");
      // Each class has its own subject row, so suitability is the same subject name taught anywhere.
      const subjectName = slot.subject?.name?.trim().toLowerCase();
      if (subjectName && slots.some(other => other.teacherId === teacher.id && other.subject?.name?.trim().toLowerCase() === subjectName)) reasons.push(`Teaches ${slot.subject!.name}`);
      const load = loads.get(teacher.id);
      if (load?.capacity === null || load?.capacity === undefined) warnings.push("Contracted capacity is not set");
      else if (load.load + 1 > load.capacity) warnings.push(`Would exceed contracted capacity this week (${load.load + 1} of ${load.capacity})`);
      return { id: teacher.id, name: teacher.fullName, eligible: conflicts.length === 0, reasons, conflicts, warnings };
    }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.reasons.length - a.reasons.length || a.warnings.length - b.warnings.length || a.name.localeCompare(b.name));
    const original = teachers.find(t => t.id === slot.teacherId);
    return { slotId: slot.id, startTime: slot.startTime, endTime: slot.endTime, period: slot.periodNumber, className: `${slot.timetable.class.name}${slot.timetable.class.section ? ` ${slot.timetable.class.section}` : ""}`, subject: slot.subject?.name ?? null, absentTeacher: original?.fullName ?? null, candidates };
  });
  return { date: isoDay(date), lessons, scopeNote: `Only staff of this campus are considered; a lesson at another campus within ${TRAVEL_MINUTES} minutes of travel counts as a clash.` };
}

/** Recheck eligibility, then hand the reviewed proposal to the substitution workflow (School AI record). */
export async function proposeCover(user: AuthUser, campusId: string, body: { date?: unknown; duties?: unknown; idempotencyKey?: unknown }) {
  assertWorkloadAccess(user);
  const dateText = String(body.date ?? "");
  const duties = Array.isArray(body.duties) ? body.duties as { slotId?: unknown; teacherId?: unknown; reason?: unknown }[] : [];
  if (!duties.length || duties.length > 100) throw new ApiError("Choose at least one lesson to cover.", 400);
  const board = await coverBoard(user, campusId, dateText);
  const normalized = duties.map(duty => {
    const lesson = board.lessons.find(item => item.slotId === String(duty.slotId ?? ""));
    if (!lesson) throw new ApiError("A lesson is no longer uncovered. Review the cover list again.", 409);
    const candidate = lesson.candidates.find(item => item.id === String(duty.teacherId ?? ""));
    if (!candidate) throw new ApiError("Choose a staff member from this campus.", 400);
    if (!candidate.eligible) throw new ApiError(`${candidate.name} is not available: ${candidate.conflicts.join("; ")}. Review the candidates again.`, 409);
    const reason = String(duty.reason ?? "").trim() || `Cover for ${lesson.absentTeacher ?? "an absent teacher"} (approved leave)`;
    return { slotId: lesson.slotId, teacherId: candidate.id, reason: reason.slice(0, 1000) };
  });
  const key = String(body.idempotencyKey ?? "");
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(key)) throw new ApiError("Invalid idempotency key", 400);
  const record = await createWorkspaceRecord(user, {
    kind: "WORKFLOW", title: `Cover for ${board.date}`, campusId,
    data: { goal: `Cover ${normalized.length} lesson(s) on ${board.date} while staff are on approved leave.`, steps: [], sourceIds: [], missingInformation: [], proposal: { operation: "timetable.assign_substitutes", date: board.date, duties: normalized } },
    idempotencyKey: `cover-${key}`,
  });
  return { recordId: record.id, status: record.status, duties: normalized.length };
}
