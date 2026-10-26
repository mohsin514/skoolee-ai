import { z } from "zod";
import type { AuthUser } from "@/lib/auth";
import { prisma, type TxClient } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { schoolToday } from "@/lib/datetime";
import { assertExamOffice, type Paper } from "@/lib/academic/datesheet-publication";
import { dayReadiness, deliveryReady, readinessDay, type ReadinessPaperInput } from "@/lib/academic/exam-readiness";
import { schoolAiTransaction } from "@/lib/school-ai/transaction";
import { lockTimetableCampus } from "@/lib/timetable/locking";

/**
 * SKO-506 office depth: the control tower for one exam session and the exceptions desk. Exceptions are
 * per learner and exam; an open exception, an open or upheld result appeal, or a pending result correction
 * on a sitting sent to the exam's gradebook keeps that exam's report cards unpublished.
 */
async function sessionFor(user: AuthUser, sessionId: string) {
  assertExamOffice(user);
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, schoolId: user.schoolId, ...(user.role === "SUPER_ADMIN" ? {} : { campusId: user.campusId ?? "" }) }, select: { id: true, campusId: true, title: true } });
  if (!session) throw new ApiError("Exam session not found", 404);
  return session;
}

/** What still keeps an exam's report cards from publication (empty when nothing does). */
export async function openExamExceptions(db: TxClient, schoolId: string, examId: string) {
  const schedules = await db.examSchedule.findMany({ where: { schoolId, examId }, select: { id: true } });
  const sittings = await db.schoolAiExamAssignment.findMany({ where: { schoolId, OR: [{ gradebookPublication: { path: ["examId"], equals: examId } }, { examScheduleId: { in: schedules.map(schedule => schedule.id) } }] }, select: { id: true } });
  const ids = sittings.map(row => row.id);
  const [exceptions, appeals, corrections] = await Promise.all([
    db.examException.count({ where: { schoolId, examId, status: "OPEN" } }),
    ids.length ? db.schoolAiExamAppeal.count({ where: { schoolId, assignmentId: { in: ids }, status: { in: ["OPEN", "UPHELD"] } } }) : 0,
    ids.length ? db.schoolAiResultCorrection.count({ where: { schoolId, assignmentId: { in: ids }, status: "PENDING" } }) : 0,
  ]);
  return { exceptions, appeals, corrections, total: exceptions + appeals + corrections };
}

export async function sessionReadiness(user: AuthUser, sessionId: string, requested?: string | null) {
  const session = await sessionFor(user, sessionId);
  const schedules = await prisma.examSchedule.findMany({
    where: { schoolId: user.schoolId, campusId: session.campusId, exam: { sessionId, status: { notIn: ["CANCELLED", "ARCHIVED"] } } },
    include: {
      subject: { select: { name: true } }, periodDefinition: { select: { startTime: true, endTime: true } },
      exam: { select: { id: true, classId: true, class: { select: { name: true, section: true } } } },
      paperSlot: { select: { id: true, sealedAt: true, sealHash: true, compromisedAt: true, cancelledAt: true, deliveryKind: true } },
      rooms: { select: { invigilation: { select: { id: true } } } },
      seats: { select: { studentId: true } },
    },
  });
  const classIds = [...new Set(schedules.map(row => row.exam.classId))];
  const [roster, latest, printed, scripts, online, today] = await Promise.all([
    prisma.student.findMany({ where: { schoolId: user.schoolId, classId: { in: classIds }, status: "active", archivedAt: null }, select: { id: true, classId: true } }),
    prisma.examDatesheetVersion.findFirst({ where: { schoolId: user.schoolId, sessionId }, orderBy: { version: "desc" }, select: { version: true, snapshot: true } }),
    prisma.examPrintRun.findMany({ where: { schoolId: user.schoolId, scheduleId: { in: schedules.map(row => row.id) } }, select: { scheduleId: true, sealPrefix: true, candidates: true, copies: true, createdAt: true } }),
    prisma.examPaperScript.findMany({ where: { schoolId: user.schoolId, scheduleId: { in: schedules.map(row => row.id) } }, select: { scheduleId: true, studentId: true, sealPrefix: true } }),
    prisma.schoolAiExamAssignment.findMany({ where: { schoolId: user.schoolId, examScheduleId: { in: schedules.map(row => row.id) }, status: "ACTIVE" }, select: { examScheduleId: true, contentHash: true, studentIds: true } }),
    schoolToday(user.schoolId, session.campusId),
  ]);
  const publishedRows = new Map(((latest?.snapshot as { papers?: Paper[] } | null)?.papers ?? []).map(paper => [paper.scheduleId, paper]));
  const papers: ReadinessPaperInput[] = schedules.map(row => {
    // Archived or inactive pupils are not candidates; only the current roster must be seated.
    const candidates = new Set(roster.filter(pupil => pupil.classId === row.exam.classId).map(pupil => pupil.id));
    const published = publishedRows.get(row.id);
    const delivered = deliveryReady(row.paperSlot, [...candidates], printed.filter(run => run.scheduleId === row.id), scripts.filter(script => script.scheduleId === row.id), online.filter(sitting => sitting.examScheduleId === row.id));
    return {
      scheduleId: row.id, label: `${[row.exam.class.name, row.exam.class.section].filter(Boolean).join(" ")} · ${row.subject.name}`,
      date: row.date.toISOString().slice(0, 10), startTime: row.periodDefinition?.startTime ?? null, endTime: row.periodDefinition?.endTime ?? null,
      published: published ? { date: published.date, startTime: published.startTime, endTime: published.endTime } : null,
      slot: row.paperSlot,
      printed: delivered, onlineSitting: delivered,
      rooms: row.rooms.map(room => ({ invigilated: Boolean(room.invigilation) })), candidates: candidates.size, seated: row.seats.filter(seat => candidates.has(seat.studentId)).length,
    };
  });
  const day = readinessDay(papers.map(paper => paper.date), today, requested);
  const examIds = [...new Set(schedules.map(row => row.exam.id))];
  const open = await Promise.all(examIds.map(examId => openExamExceptions(prisma, user.schoolId, examId)));
  return { session: { id: session.id, title: session.title }, publishedVersion: latest?.version ?? null, days: [...new Set(papers.map(paper => paper.date))].sort(), ...dayReadiness(papers, day, open.reduce((sum, row) => sum + row.total, 0)) };
}

const KINDS = ["ABSENT_MEDICAL", "ABSENT_LEAVE", "UNFAIR_MEANS", "EXEMPT", "RESIT"] as const;
const DECISIONS = ["RESIT_NEW_FORM", "RESIT_CAPPED", "RESIT_FULL", "RECORD_ABSENT", "EXEMPT_FROM_TOTAL", "NO_CHANGE"] as const;
const createSchema = z.strictObject({ examId: z.string().min(1).max(120), studentId: z.string().min(1).max(120), subjectId: z.string().min(1).max(120).optional(), kind: z.enum(KINDS), note: z.string().trim().min(3).max(2000) });
const resolveSchema = z.strictObject({ version: z.number().int().positive(), decision: z.enum(DECISIONS), resolution: z.string().trim().min(3).max(2000) });

export async function listExceptions(user: AuthUser, sessionId: string) {
  const session = await sessionFor(user, sessionId);
  const exams = await prisma.exam.findMany({ where: { schoolId: user.schoolId, campusId: session.campusId, sessionId }, select: { id: true, title: true, classId: true, class: { select: { name: true, section: true } } } });
  const rows = await prisma.examException.findMany({ where: { schoolId: user.schoolId, examId: { in: exams.map(exam => exam.id) } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 });
  const students = new Map((await prisma.student.findMany({ where: { schoolId: user.schoolId, id: { in: rows.map(row => row.studentId) } }, select: { id: true, fullName: true, rollNo: true } })).map(row => [row.id, row]));
  const roster = await prisma.student.findMany({ where: { schoolId: user.schoolId, classId: { in: exams.map(exam => exam.classId) }, status: "active", archivedAt: null }, select: { id: true, fullName: true, rollNo: true, classId: true }, orderBy: [{ rollNo: "asc" }] });
  const label = (exam: (typeof exams)[number]) => [exam.class.name, exam.class.section].filter(Boolean).join(" ");
  return {
    exams: exams.map(exam => ({ id: exam.id, label: label(exam), students: roster.filter(pupil => pupil.classId === exam.classId).map(pupil => ({ id: pupil.id, name: pupil.fullName, rollNo: pupil.rollNo })) })),
    exceptions: rows.map(row => ({ id: row.id, examId: row.examId, exam: label(exams.find(exam => exam.id === row.examId)!), student: students.get(row.studentId)?.fullName ?? null, rollNo: students.get(row.studentId)?.rollNo ?? null, kind: row.kind, note: row.note, status: row.status, decision: row.decision, resolution: row.resolution, version: row.version, createdAt: row.createdAt, resolvedAt: row.resolvedAt })),
  };
}

export async function createException(user: AuthUser, sessionId: string, raw: unknown) {
  const session = await sessionFor(user, sessionId);
  const input = createSchema.parse(raw);
  const exam = await prisma.exam.findFirst({ where: { id: input.examId, schoolId: user.schoolId, campusId: session.campusId, sessionId }, select: { id: true, classId: true } });
  if (!exam) throw new ApiError("Choose an exam of this session.", 404);
  const student = await prisma.student.findFirst({ where: { id: input.studentId, schoolId: user.schoolId, campusId: session.campusId, classId: exam.classId, status: "active", archivedAt: null }, select: { id: true } });
  if (!student) throw new ApiError("Choose a learner of this class.", 404);
  if (input.subjectId && !await prisma.examSchedule.count({ where: { schoolId: user.schoolId, campusId: session.campusId, examId: exam.id, subjectId: input.subjectId } })) throw new ApiError("Choose a subject scheduled for this exam.", 404);
  return schoolAiTransaction(user, async tx => {
    // Fence publication on the same campus so a new open exception cannot slip past its guard.
    await lockTimetableCampus(tx, user.schoolId, session.campusId);
    const row = await tx.examException.create({ data: { schoolId: user.schoolId, campusId: session.campusId, examId: exam.id, studentId: student.id, subjectId: input.subjectId ?? null, kind: input.kind, note: input.note, createdById: user.userId } });
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: session.campusId, tableName: "exam_exceptions", recordId: row.id, userId: user.userId, newValue: { action: "CREATE", examId: exam.id, studentId: student.id, kind: input.kind } } });
    return row;
  });
}

export async function resolveException(user: AuthUser, sessionId: string, exceptionId: string, raw: unknown) {
  const session = await sessionFor(user, sessionId);
  const input = resolveSchema.parse(raw);
  return schoolAiTransaction(user, async tx => {
    await lockTimetableCampus(tx, user.schoolId, session.campusId);
    const exams = await tx.exam.findMany({ where: { schoolId: user.schoolId, campusId: session.campusId, sessionId }, select: { id: true } });
    const row = await tx.examException.findFirst({ where: { id: exceptionId, schoolId: user.schoolId, campusId: session.campusId, examId: { in: exams.map(exam => exam.id) } } });
    if (!row) throw new ApiError("Exception not found.", 404);
    const done = await tx.examException.updateMany({ where: { id: row.id, version: input.version, status: "OPEN" }, data: { status: "RESOLVED", decision: input.decision, resolution: input.resolution, resolvedById: user.userId, resolvedAt: new Date(), version: { increment: 1 } } });
    if (done.count !== 1) throw new ApiError("This exception changed or was already resolved. Reload it.", 409);
    await tx.auditLog.create({ data: { schoolId: user.schoolId, campusId: session.campusId, tableName: "exam_exceptions", recordId: row.id, userId: user.userId, oldValue: { status: "OPEN" }, newValue: { action: "RESOLVE", decision: input.decision } } });
    return { id: row.id, status: "RESOLVED", version: input.version + 1 };
  });
}
