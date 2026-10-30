import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/api/scope";
import { getSchoolTimeZone } from "@/lib/datetime";
import { publishedPapersForClasses } from "@/lib/academic/datesheet-publication";
import { DELIVERED_EXAM_MODES } from "./exam";
import { buildExamTimeline } from "./exam-timeline";

/**
 * SKO-505: the learner's date sheet and online sittings as one timeline. Paper sittings come only from the
 * published date-sheet snapshot (never the office's draft); seat, room and invigilator from the seat plan;
 * online sittings from the learner's own assignments and attempt.
 */
export async function examTimelineFor(schoolId: string, student: { id: string; classId: string; campusId: string }, now = new Date()) {
  const papers = (await publishedPapersForClasses(schoolId, [student.classId])).filter(paper => paper.classId === student.classId);
  const [seats, sittings, timeZone] = await Promise.all([
    papers.length ? prisma.examSeat.findMany({ where: { schoolId, studentId: student.id, examScheduleId: { in: papers.map(paper => paper.scheduleId) } }, select: { examScheduleId: true, seatNumber: true, rowNo: true, benchNo: true, examRoom: { select: { room: { select: { roomNumber: true } }, invigilation: { select: { teacher: { select: { fullName: true } } } } } } } }) : [],
    prisma.schoolAiExamAssignment.findMany({ where: { schoolId, campusId: student.campusId, classId: student.classId, status: "ACTIVE", mode: { in: DELIVERED_EXAM_MODES }, studentIds: { array_contains: [student.id] } }, select: { id: true, title: true, startsAt: true, endsAt: true, mode: true, resultsReleasedAt: true, paperSnapshot: true }, orderBy: { startsAt: "asc" }, take: 200 }),
    getSchoolTimeZone(schoolId, student.campusId),
  ]);
  const attempts = sittings.length ? await prisma.schoolAiExamAttempt.findMany({ where: { schoolId, studentId: student.id, assignmentId: { in: sittings.map(row => row.id) } }, select: { assignmentId: true, status: true, deadlineAt: true, pausedAt: true } }) : [];
  const subjectIds = [...new Set(sittings.map(row => (row.paperSnapshot as { subjectId?: string } | null)?.subjectId).filter((value): value is string => Boolean(value)))];
  const subjects = new Map((subjectIds.length ? await prisma.subject.findMany({ where: { schoolId, id: { in: subjectIds } }, select: { id: true, name: true } }) : []).map(row => [row.id, row.name]));
  return buildExamTimeline({
    now, timeZone,
    papers,
    seats: seats.map(row => ({ scheduleId: row.examScheduleId, room: row.examRoom.room.roomNumber, seat: row.rowNo ? `${row.rowNo}-${row.benchNo}` : String(row.seatNumber), invigilator: row.examRoom.invigilation?.teacher.fullName ?? null })),
    online: sittings.map(row => ({ id: row.id, title: row.title, subject: subjects.get((row.paperSnapshot as { subjectId?: string } | null)?.subjectId ?? "") ?? null, startsAt: row.startsAt, endsAt: row.endsAt, mode: row.mode, resultsReleasedAt: row.resultsReleasedAt, attempt: attempts.find(attempt => attempt.assignmentId === row.id) ?? null })),
  });
}

export async function myExamTimeline(user: AuthUser) {
  if (user.role !== "STUDENT") throw new ApiError("Only learners read their own exam timeline here.", 403);
  const student = await prisma.student.findFirst({ where: { schoolId: user.schoolId, studentUserId: user.userId, archivedAt: null, status: "active" }, select: { id: true, classId: true, campusId: true } });
  if (!student) throw new ApiError("An active student record is required.", 403);
  return examTimelineFor(user.schoolId, student);
}

/** SKO-505: a learner's released online results for their family — moderated marks and the teacher's feedback only. */
export async function familyExamResults(schoolId: string, studentId: string) {
  const student = await prisma.student.findFirst({ where: { schoolId, id: studentId }, select: { id: true, classId: true, campusId: true } });
  if (!student) return [];
  const sittings = await prisma.schoolAiExamAssignment.findMany({ where: { schoolId, campusId: student.campusId, classId: student.classId, resultsReleasedAt: { not: null }, endsAt: { lte: new Date() }, mode: { in: DELIVERED_EXAM_MODES }, studentIds: { array_contains: [student.id] } }, select: { id: true, title: true, resultsReleasedAt: true, paperSnapshot: true }, orderBy: { resultsReleasedAt: "desc" }, take: 30 });
  if (!sittings.length) return [];
  const attempts = await prisma.schoolAiExamAttempt.findMany({ where: { schoolId, studentId: student.id, status: "REVIEWED", assignmentId: { in: sittings.map(row => row.id) } }, select: { assignmentId: true, review: true, responses: true, reviewVersion: true } });
  const { paperDataSchema, curriculumDataSchema } = await import("./assessment");
  const { examReviewSchema, responsesSchema } = await import("./exam");
  const { deriveFeedback } = await import("./recovery");
  return Promise.all(sittings.flatMap(sitting => {
    const attempt = attempts.find(row => row.assignmentId === sitting.id);
    const paper = paperDataSchema.safeParse(sitting.paperSnapshot);
    if (!attempt?.review || !paper.success) return [];
    return [(async () => {
      const curriculum = await prisma.schoolAiRevision.findFirst({ where: { schoolId, recordId: paper.data.curriculumId, version: paper.data.curriculumVersion }, select: { data: true } });
      const parsed = curriculum ? curriculumDataSchema.safeParse(curriculum.data) : null;
      const titles = new Map(parsed?.success ? parsed.data.outcomes.map(outcome => [outcome.id, outcome.title]) : []);
      const stored = attempt.review as { marks?: unknown; note?: unknown; total?: unknown };
      const review = examReviewSchema.parse({ marks: stored.marks, note: stored.note });
      return { id: sitting.id, title: sitting.title, releasedAt: sitting.resultsReleasedAt, resultVersion: attempt.reviewVersion, total: review.marks.reduce((sum, mark) => sum + mark.marks, 0), maximum: paper.data.blueprint.totalMarks, note: review.note, feedback: deriveFeedback(paper.data, review, responsesSchema.parse(attempt.responses), titles) };
    })()];
  }));
}
