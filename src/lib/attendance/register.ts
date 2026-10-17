import type { AttendanceStatus, Prisma } from "@prisma/client";
import { prisma, type TxClient } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { ApiError, assertPermission, canMarkAttendance, canManageOperations } from "@/lib/api/scope";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";
import { guardianHasAccess } from "@/lib/parent/guardian-access";
import { liveGuardianRelationshipWhere } from "@/lib/parent/guardian-query";
import { deliverNotification } from "@/lib/notifications/in-app";
import { triggerRepeatedAbsenceAlert } from "@/lib/notifications/automation";
import { ATTENDANCE_STATUSES, DEFAULT_ATTENDANCE_RULE } from "@/lib/attendance";
import { attendanceRuleFor, explainClosed } from "./rule";
export { attendanceRuleFor, EXPLAIN_WINDOW_DAYS } from "./rule";

// SKO-405: the class register. A register is one class on one school day; its roster is the pupils
// enrolled in that class on that date (dated enrollment), so a pupil who later moved still appears on the
// days they belonged. Unmarked is a state of its own: nothing is inferred from a missing mark, absence
// alerts fire only for a recorded absence, and a register cannot be submitted while anyone is unmarked.
// Every write names the status the person last saw; a different current value is a conflict to review,
// never a silent overwrite. Once submitted, any change is a correction with a reason. A guardian's
// explanation never edits the register: staff accept it, which records a reasoned correction.

export type Status = (typeof ATTENDANCE_STATUSES)[number];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayDate = (value: string) => {
  if (!DAY.test(value)) throw new ApiError("Use a date like 2026-10-17.", 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ApiError("That date does not exist.", 400);
  return date;
};
const text = (value: unknown, label: string, min: number, max: number) => {
  const out = String(value ?? "").trim();
  if (out.length < min) throw new ApiError(`${label} needs at least ${min} characters.`, 400);
  if (out.length > max) throw new ApiError(`${label} is too long (max ${max}).`, 400);
  return out;
};

export async function publishRule(user: AuthUser, body: Record<string, unknown>) {
  if (!canManageOperations(user)) throw new ApiError("Only school leaders can change how attendance is counted.", 403);
  const attended = (Array.isArray(body.attended) ? body.attended : []).map(String), excluded = (Array.isArray(body.excluded) ? body.excluded : []).map(String);
  for (const status of [...attended, ...excluded]) if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) throw new ApiError(`Unknown status ${status}.`, 400);
  if (attended.some(status => excluded.includes(status))) throw new ApiError("A status cannot both count as attended and be left out.", 400);
  if (!attended.includes("PRESENT") || attended.includes("ABSENT") || excluded.includes("ABSENT") || excluded.includes("PRESENT")) throw new ApiError("Present always counts as attended and absent always counts against attendance.", 400);
  const note = text(body.note, "Reason for the change", 5, 500);
  return schoolAiTransaction(user, async db => {
    const latest = await db.attendanceRuleVersion.findFirst({ where: { schoolId: user.schoolId }, orderBy: { version: "desc" } });
    const current = latest ?? DEFAULT_ATTENDANCE_RULE;
    if (JSON.stringify([...current.attended].sort()) === JSON.stringify([...attended].sort()) && JSON.stringify([...current.excluded].sort()) === JSON.stringify([...excluded].sort())) throw new ApiError("This is already the rule in force.", 409);
    return db.attendanceRuleVersion.create({ data: { schoolId: user.schoolId, version: (latest?.version ?? 0) + 1, attended, excluded, note, publishedById: user.userId } });
  });
}

async function assignedClass(db: TxClient, user: AuthUser, classId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }), ...(user.role === "TEACHER" ? { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } : {}) },
    select: { id: true, campusId: true, name: true, section: true, academicYear: true },
  });
  if (!cls) throw new ApiError("You are not assigned to register this class.", 404);
  return cls;
}

/** Pupils enrolled in the class on the date, whatever their class is today. */
async function datedRoster(db: TxClient, user: AuthUser, classId: string, date: Date) {
  const enrollments = await db.studentEnrollment.findMany({
    where: { schoolId: user.schoolId, classId, startDate: { lte: date }, OR: [{ endDate: null }, { endDate: { gt: date } }] },
    select: { id: true, studentId: true, rollNo: true, student: { select: { id: true, fullName: true, classId: true, profileImageUrl: true } } },
    orderBy: [{ rollNo: "asc" }, { studentId: "asc" }],
  });
  return enrollments;
}

export async function registerView(user: AuthUser, classId: string, dateText: string) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot view attendance registers.", 403);
  const date = dayDate(dateText);
  const cls = await assignedClass(prisma, user, classId);
  const [roster, register, rule] = await Promise.all([datedRoster(prisma, user, cls.id, date), prisma.attendanceRegister.findUnique({ where: { classId_date: { classId: cls.id, date } } }), attendanceRuleFor(user.schoolId)]);
  const rows = await prisma.attendance.findMany({ where: { schoolId: user.schoolId, studentId: { in: roster.map(r => r.studentId) }, date }, include: { marker: { select: { fullName: true } }, explanations: { where: { status: { in: ["PENDING", "CLARIFICATION"] } }, select: { id: true, status: true } } } });
  const byStudent = new Map(rows.map(row => [row.studentId, row]));
  const entries = roster.map(enrollment => {
    const row = byStudent.get(enrollment.studentId);
    return { studentId: enrollment.studentId, enrollmentId: enrollment.id, name: enrollment.student.fullName, rollNo: enrollment.rollNo, movedSince: enrollment.student.classId !== cls.id, photo: enrollment.student.profileImageUrl,
      status: (row?.status ?? null) as Status | null, arrivalTime: row?.arrivalTime ?? null, departureTime: row?.departureTime ?? null, note: row?.notes ?? null, version: row?.version ?? 0, markedBy: row?.marker?.fullName ?? null, markedAt: row?.markedAt ?? null, openExplanation: row?.explanations[0]?.status ?? null };
  });
  const counts = Object.fromEntries([...ATTENDANCE_STATUSES, "UNMARKED"].map(status => [status, entries.filter(entry => (entry.status ?? "UNMARKED") === status).length]));
  return { class: { id: cls.id, name: [cls.name, cls.section].filter(Boolean).join(" "), academicYear: cls.academicYear }, date: dateText, register: register ? { status: register.status, submittedAt: register.submittedAt, version: register.version } : { status: "OPEN", submittedAt: null, version: 0 }, entries, counts, rule };
}

type EntryInput = { studentId: string; status: Status; knownStatus: Status | null; arrivalTime?: string | null; departureTime?: string | null; note?: string | null; reviewedConflict?: boolean };
export type Conflict = { studentId: string; name: string; current: string | null; yours: string; seen: string | null; markedBy: string | null };

/**
 * Save marks, and optionally submit. Returns conflicts (nothing written for those pupils) when someone else
 * changed a pupil after the reader loaded the register; the reader reviews and resends them.
 */
export async function saveRegister(user: AuthUser, body: Record<string, unknown>) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot mark attendance.", 403);
  await assertPermission(user, "attendance", "add");
  const date = dayDate(String(body.date ?? ""));
  const entries = (Array.isArray(body.entries) ? body.entries : []) as EntryInput[];
  if (entries.length > 300) throw new ApiError("A register holds at most 300 pupils.", 400);
  if (new Set(entries.map(entry => entry.studentId)).size !== entries.length) throw new ApiError("Each pupil can be marked once.", 400);
  for (const entry of entries) {
    if (!(ATTENDANCE_STATUSES as readonly string[]).includes(entry.status)) throw new ApiError("Unknown attendance status.", 400);
    for (const time of [entry.arrivalTime, entry.departureTime]) if (time && !TIME.test(time)) throw new ApiError("Use times like 08:15.", 400);
    if (entry.status === "LATE" && !entry.arrivalTime) throw new ApiError("A late arrival needs the arrival time.", 400);
    if (entry.status === "PARTIAL" && !entry.arrivalTime && !entry.departureTime) throw new ApiError("A part-day record needs an arrival or departure time.", 400);
  }
  const reason = body.reason ? text(body.reason, "Reason for the correction", 5, 500) : null;
  const submit = body.submit === true;
  const result = await schoolAiTransaction(user, async db => {
    const cls = await assignedClass(db, user, String(body.classId ?? ""));
    await lockTimetableCampus(db, user.schoolId, cls.campusId);
    const roster = await datedRoster(db, user, cls.id, date);
    const enrollment = new Map(roster.map(row => [row.studentId, row]));
    for (const entry of entries) if (!enrollment.has(entry.studentId)) throw new ApiError("A pupil in this register was not enrolled in the class on that date.", 400);
    let register = await db.attendanceRegister.findUnique({ where: { classId_date: { classId: cls.id, date } } });
    if (!register) register = await db.attendanceRegister.create({ data: { schoolId: user.schoolId, campusId: cls.campusId, classId: cls.id, date } });
    await db.$queryRaw`SELECT id FROM attendance_registers WHERE id = ${register.id} FOR UPDATE`;
    register = await db.attendanceRegister.findUniqueOrThrow({ where: { id: register.id } });
    const submitted = register.status === "SUBMITTED";
    const existing = await db.attendance.findMany({ where: { schoolId: user.schoolId, studentId: { in: roster.map(r => r.studentId) }, date }, include: { marker: { select: { fullName: true } } } });
    const current = new Map(existing.map(row => [row.studentId, row]));
    const conflicts: Conflict[] = [], written: string[] = [], becameAbsent: string[] = [], leftAbsent: string[] = [];
    for (const entry of entries) {
      const row = current.get(entry.studentId);
      const now = (row?.status ?? null) as string | null;
      if (now === entry.status && (row?.arrivalTime ?? null) === (entry.arrivalTime ?? null) && (row?.departureTime ?? null) === (entry.departureTime ?? null)) continue;
      if (now !== (entry.knownStatus ?? null) && !entry.reviewedConflict) { conflicts.push({ studentId: entry.studentId, name: enrollment.get(entry.studentId)!.student.fullName, current: now, yours: entry.status, seen: entry.knownStatus ?? null, markedBy: row?.marker?.fullName ?? null }); continue; }
      if (row?.isLocked) throw new ApiError("This register is locked.", 409);
      if (submitted && row && now !== entry.status && !reason) throw new ApiError("Changing a recorded mark is a correction. Give the reason.", 400);
      // Changing your own mark in an open register is still marking; anything else is an edit.
      if (row && now !== null && now !== entry.status && (submitted || row.markedBy !== user.userId)) await assertPermission(user, "attendance", "edit");
      const data = { status: entry.status as AttendanceStatus, arrivalTime: entry.arrivalTime ?? null, departureTime: entry.departureTime ?? null, notes: entry.note?.trim() ? entry.note.trim().slice(0, 500) : row?.notes ?? null, markedBy: user.userId, markedAt: new Date() };
      if (row) {
        await db.attendance.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } });
        if (now !== entry.status) await db.attendanceEditHistory.create({ data: { schoolId: user.schoolId, attendanceId: row.id, oldStatus: now ?? "UNMARKED", newStatus: entry.status, editedBy: user.userId, reason: submitted ? reason : reason ?? null, source: submitted ? "CORRECTION" : "REGISTER" } });
        written.push(row.id);
      } else {
        const created = await db.attendance.create({ data: { ...data, schoolId: user.schoolId, campusId: cls.campusId, classId: cls.id, studentId: entry.studentId, date, enrollmentId: enrollment.get(entry.studentId)!.id } });
        written.push(created.id);
      }
      if (entry.status === "ABSENT" && now !== "ABSENT") becameAbsent.push(entry.studentId);
      if (now === "ABSENT" && entry.status !== "ABSENT") leftAbsent.push(entry.studentId);
    }
    let unmarked: { studentId: string; name: string }[] = [];
    let didSubmit = false;
    if (submit && !conflicts.length) {
      const marked = new Set([...existing.map(row => row.studentId), ...entries.map(entry => entry.studentId)]);
      unmarked = roster.filter(row => !marked.has(row.studentId)).map(row => ({ studentId: row.studentId, name: row.student.fullName }));
      if (!unmarked.length && !submitted) {
        await db.attendanceRegister.update({ where: { id: register.id }, data: { status: "SUBMITTED", submittedAt: new Date(), submittedById: user.userId, rosterCount: roster.length, version: { increment: 1 } } });
        didSubmit = true;
      }
    }
    if (written.length) await db.auditLog.create({ data: { schoolId: user.schoolId, campusId: cls.campusId, tableName: "attendance_register", recordId: register.id, userId: user.userId, newValue: { classId: cls.id, date: date.toISOString().slice(0, 10), written: written.length, reason, submitted: didSubmit } as Prisma.InputJsonValue } });
    return { conflicts, written: written.length, unmarked, submitted: didSubmit || submitted, becameAbsent, leftAbsent, campusId: cls.campusId, submittedNow: didSubmit, className: [cls.name, cls.section].filter(Boolean).join(" "), rosterCount: roster.length };
  });
  // Families hear only about recorded facts: repeated absence (deduplicated by the existing alert), and
  // one correction notice when an absence is changed to something else.
  for (const studentId of result.becameAbsent) await triggerRepeatedAbsenceAlert({ studentId, date, createdById: user.userId }).catch(error => console.error("[attendance] absence alert failed", error));
  for (const studentId of result.leftAbsent) await notifyCorrection(user, result.campusId, studentId, date);
  const { becameAbsent: _a, leftAbsent: _b, ...response } = result;
  return response;
}

async function notifyCorrection(user: AuthUser, campusId: string, studentId: string, date: Date) {
  const row = await prisma.attendance.findFirst({ where: { schoolId: user.schoolId, studentId, date }, select: { id: true, status: true, student: { select: { fullName: true } } } });
  if (!row) return;
  const guardians = await prisma.guardianRelationship.findMany({ where: { studentId, ...liveGuardianRelationshipWhere(null, "attendance", new Date(), user.schoolId) }, select: { guardianUserId: true } });
  const ids = [...new Set(guardians.map(g => g.guardianUserId).filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  await deliverNotification("ATTENDANCE_CORRECTED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName ?? null, guardianIds: ids, attendanceId: row.id, studentName: row.student.fullName, date: date.toISOString().slice(0, 10), status: row.status })
    .catch(error => console.error("[attendance] correction notice failed", error));
}

/** A guardian explains an absence or a late arrival. It waits for staff; the register is unchanged. */
export async function submitExplanation(user: AuthUser, body: Record<string, unknown>) {
  if (user.role !== "PARENT") throw new ApiError("Only a guardian can explain a child's absence here.", 403);
  const attendance = await prisma.attendance.findFirst({ where: { id: String(body.attendanceId ?? ""), schoolId: user.schoolId } });
  if (!attendance || !(await guardianHasAccess({ schoolId: user.schoolId, studentId: attendance.studentId, guardianUserId: user.userId, permission: "attendance" }))) throw new ApiError("Attendance record not found", 404);
  if (!["ABSENT", "LATE"].includes(attendance.status)) throw new ApiError("Only an absence or a late arrival can be explained.", 409);
  if (explainClosed(attendance.date)) throw new ApiError("The time to explain this day has passed. Contact the school.", 409);
  const proposedStatus = String(body.proposedStatus ?? "EXCUSED");
  if (!["EXCUSED", "LATE"].includes(proposedStatus)) throw new ApiError("Choose whether the child was absent for a reason or arrived late.", 400);
  const arrivalTime = proposedStatus === "LATE" ? String(body.arrivalTime ?? "") : null;
  if (arrivalTime !== null && !TIME.test(arrivalTime)) throw new ApiError("Give the arrival time, like 09:10.", 400);
  const reason = text(body.reason, "Explanation", 5, 1000);
  // A reply to the school's request for clarification continues the same explanation.
  const asked = await prisma.attendanceExplanation.findFirst({ where: { schoolId: user.schoolId, attendanceId: attendance.id, status: "CLARIFICATION" } });
  if (asked) return prisma.attendanceExplanation.update({ where: { id: asked.id }, data: { status: "PENDING", reason: `${asked.reason}\n\n${reason}`.slice(0, 2000), proposedStatus, arrivalTime } });
  try {
    return await prisma.attendanceExplanation.create({ data: { schoolId: user.schoolId, campusId: attendance.campusId, attendanceId: attendance.id, studentId: attendance.studentId, submittedById: user.userId, reason, proposedStatus, arrivalTime } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw new ApiError("An explanation for this day is already waiting for the school.", 409);
    throw error;
  }
}

/** Staff decide an explanation. Accepting records a correction with the explanation as its reason. */
export async function reviewExplanation(user: AuthUser, body: Record<string, unknown>) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot review explanations.", 403);
  await assertPermission(user, "attendance", "edit");
  const action = String(body.action ?? "");
  const note = body.note ? text(body.note, "Note", 2, 500) : null;
  const outcome = await schoolAiTransaction(user, async db => {
    const id = String(body.id ?? "");
    const [locked] = await db.$queryRaw<{ id: string }[]>`SELECT id FROM attendance_explanations WHERE id = ${id} AND school_id = ${user.schoolId} FOR UPDATE`;
    const explanation = locked ? await db.attendanceExplanation.findUnique({ where: { id }, include: { attendance: true } }) : null;
    if (!explanation || (user.role !== "SUPER_ADMIN" && explanation.campusId !== user.campusId)) throw new ApiError("Explanation not found", 404);
    if (user.role === "TEACHER") await assignedClass(db, user, explanation.attendance.classId ?? "");
    if (!["PENDING", "CLARIFICATION"].includes(explanation.status)) throw new ApiError("This explanation has already been decided.", 409);
    const decided = { reviewedById: user.userId, reviewedAt: new Date(), reviewNote: note };
    if (action === "reject") { if (!note) throw new ApiError("Say why the explanation is not accepted.", 400); return { explanation: await db.attendanceExplanation.update({ where: { id }, data: { status: "REJECTED", ...decided } }), corrected: false }; }
    if (action === "clarify") { if (!note) throw new ApiError("Say what the family needs to clarify.", 400); return { explanation: await db.attendanceExplanation.update({ where: { id }, data: { status: "CLARIFICATION", ...decided } }), corrected: false }; }
    if (action !== "accept") throw new ApiError("Unknown action", 400);
    const row = explanation.attendance;
    if (body.knownVersion !== undefined && Number(body.knownVersion) !== row.version) throw new ApiError("This day's mark changed since you opened it. Reload before accepting.", 409);
    const status = explanation.proposedStatus as AttendanceStatus;
    await db.attendance.update({ where: { id: row.id }, data: { status, arrivalTime: explanation.arrivalTime ?? row.arrivalTime, markedBy: user.userId, markedAt: new Date(), version: { increment: 1 } } });
    await db.attendanceEditHistory.create({ data: { schoolId: user.schoolId, attendanceId: row.id, oldStatus: row.status, newStatus: status, editedBy: user.userId, reason: `Guardian explanation accepted: ${explanation.reason}`.slice(0, 1000), source: "EXPLANATION" } });
    return { explanation: await db.attendanceExplanation.update({ where: { id }, data: { status: "ACCEPTED", ...decided } }), corrected: row.status === "ABSENT", studentId: row.studentId, date: row.date, campusId: row.campusId };
  });
  if (outcome.corrected && "studentId" in outcome && outcome.studentId) await notifyCorrection(user, outcome.campusId!, outcome.studentId, outcome.date!);
  return outcome.explanation;
}

/** Work that needs a person: open registers with unmarked pupils, unexplained absences and explanations to decide. */
export async function exceptionQueue(user: AuthUser, campusId: string, todayText: string) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot view attendance exceptions.", 403);
  const today = dayDate(todayText), since = new Date(today.getTime() - 14 * 86_400_000);
  const classFilter: Prisma.AttendanceWhereInput = user.role === "TEACHER" ? { class: { OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId } } }] } } : {};
  const [absences, explanations, openRegisters] = await Promise.all([
    prisma.attendance.findMany({ where: { schoolId: user.schoolId, campusId, status: "ABSENT", date: { gte: since, lte: today }, explanations: { none: { status: { in: ["PENDING", "CLARIFICATION", "ACCEPTED"] } } }, ...classFilter }, select: { id: true, date: true, version: true, student: { select: { id: true, fullName: true } }, class: { select: { name: true, section: true } } }, orderBy: { date: "desc" }, take: 200 }),
    prisma.attendanceExplanation.findMany({ where: { schoolId: user.schoolId, campusId, status: { in: ["PENDING", "CLARIFICATION"] }, ...(user.role === "TEACHER" ? { attendance: classFilter } : {}) }, include: { attendance: { select: { id: true, date: true, status: true, version: true, student: { select: { fullName: true } }, class: { select: { name: true, section: true } } } } }, orderBy: { createdAt: "asc" } }),
    prisma.attendanceRegister.findMany({ where: { schoolId: user.schoolId, campusId, status: "OPEN", date: { gte: since, lte: today } }, select: { id: true, date: true, classId: true }, orderBy: { date: "desc" } }),
  ]);
  return {
    unexplainedAbsences: absences.map(row => ({ attendanceId: row.id, date: row.date.toISOString().slice(0, 10), studentId: row.student.id, studentName: row.student.fullName, className: [row.class?.name, row.class?.section].filter(Boolean).join(" "), version: row.version })),
    explanations: explanations.map(row => ({ id: row.id, status: row.status, reason: row.reason, proposedStatus: row.proposedStatus, arrivalTime: row.arrivalTime, reviewNote: row.reviewNote, attendanceId: row.attendance.id, date: row.attendance.date.toISOString().slice(0, 10), currentStatus: row.attendance.status, version: row.attendance.version, studentName: row.attendance.student.fullName, className: [row.attendance.class?.name, row.attendance.class?.section].filter(Boolean).join(" ") })),
    openRegisters: openRegisters.map(row => ({ id: row.id, date: row.date.toISOString().slice(0, 10), classId: row.classId })),
  };
}

/** One pupil-day's history: the original mark and every change, with reasons. */
export async function entryHistory(user: AuthUser, attendanceId: string) {
  if (!canMarkAttendance(user)) throw new ApiError("You cannot view attendance history.", 403);
  const row = await prisma.attendance.findFirst({ where: { id: attendanceId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, include: { editHistory: { orderBy: { editedAt: "asc" } }, explanations: { orderBy: { createdAt: "asc" } } } });
  if (!row) throw new ApiError("Attendance record not found", 404);
  const ids = [...new Set([...row.editHistory.map(h => h.editedBy), row.markedBy].filter((v): v is string => Boolean(v)))];
  const people = new Map((await prisma.user.findMany({ where: { schoolId: user.schoolId, id: { in: ids } }, select: { id: true, fullName: true } })).map(p => [p.id, p.fullName]));
  return { status: row.status, version: row.version, changes: row.editHistory.map(h => ({ at: h.editedAt, from: h.oldStatus, to: h.newStatus, by: h.editedBy ? people.get(h.editedBy) ?? null : null, reason: h.reason, source: h.source })), explanations: row.explanations.map(e => ({ status: e.status, reason: e.reason, proposedStatus: e.proposedStatus, reviewNote: e.reviewNote, at: e.createdAt })) };
}

/** A guardian's view of a child's recent absences and their explanations. */
export async function guardianAbsences(user: AuthUser, studentId: string) {
  if (user.role !== "PARENT" || !(await guardianHasAccess({ schoolId: user.schoolId, studentId, guardianUserId: user.userId, permission: "attendance" }))) throw new ApiError("Not found", 404);
  const rows = await prisma.attendance.findMany({ where: { schoolId: user.schoolId, studentId, status: { in: ["ABSENT", "LATE"] }, date: { gte: new Date(Date.now() - 60 * 86_400_000) } }, select: { id: true, date: true, status: true, arrivalTime: true, explanations: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, reviewNote: true, proposedStatus: true } } }, orderBy: { date: "desc" } });
  return rows.map(row => ({ attendanceId: row.id, date: row.date.toISOString().slice(0, 10), status: row.status, arrivalTime: row.arrivalTime, explanation: row.explanations[0] ?? null, closed: explainClosed(row.date) }));
}
