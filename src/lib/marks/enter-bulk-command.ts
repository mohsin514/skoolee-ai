import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { gradeForMark, isLockedStatus, thresholdsForClass } from "@/lib/academic/report-cards";
import { notify } from "@/lib/notifications/in-app";

/**
 * Saving a marks sheet (POST /api/marks), shared by the marks route and the AI Workflows
 * `marks.enter_bulk` capability. The caller has already passed the route's role and billing checks.
 * Here: the exam is on the caller's campus, open (not draft, not locked); a teacher enters only the
 * subjects they teach or, as class teacher, every subject of the class; every pupil and subject is the
 * exam's own; a mark never exceeds the subject total; the room sheet's absences win. The rows are an
 * absolute set (re-saving the same values changes nothing and writes no audit row). MARKS_ENTERED
 * goes to the academic lead and the class teacher after commit.
 * Refusals are ApiErrors carrying the message, status and (room sheet) code the route always returned;
 * a stale sheet throws Error("RECORD_CHANGED") as before.
 */
export interface BulkMarkEntry { studentId: string; subjectId: string; marksObtained: number; isAbsent?: boolean; isExempt?: boolean }
export interface EnterBulkMarksInput {
  examId: string;
  entries: BulkMarkEntry[];
  /** `{ "studentId:subjectId": previousMarks }` the client saw; a difference is RECORD_CHANGED. */
  expectedMarks?: unknown;
  ipAddress: string | null;
}

function markSnapshot(mark: { marksObtained: number; isAbsent?: boolean; isExempt?: boolean; grade: string | null; enteredBy: string | null }) {
  return {
    marksObtained: mark.marksObtained,
    isAbsent: mark.isAbsent ?? false,
    isExempt: mark.isExempt ?? false,
    grade: mark.grade,
    enteredBy: mark.enteredBy,
  };
}

export async function enterBulkMarks(user: AuthUser, input: EnterBulkMarksInput) {
  const { examId } = input;
  const entries = [...new Map(input.entries.map((entry) => [`${entry.studentId}:${entry.subjectId}`, entry])).values()];

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      campusId: true,
      classId: true,
      academicYear: true,
      academicModelVersionId: true,
      status: true,
      isLocked: true,
      subjectId: true,
      title: true,
      class: {
        select: {
          id: true,
          name: true,
          section: true,
          classTeacherId: true,
          students: { select: { id: true } },
          subjects: { select: { id: true, totalMarks: true, teacherId: true } },
        },
      },
    },
  });

  if (!exam) throw new ApiError("Exam not found", 404);
  if (user.campusId && exam.campusId !== user.campusId) throw new ApiError("Exam is outside your campus", 403);
  if (exam.isLocked || isLockedStatus(exam.status)) throw new ApiError("Exam is locked; marks cannot be edited", 403);
  if (exam.status === "DRAFT") throw new ApiError("Activate the exam before marks entry", 409);

  const studentIds = new Set(exam.class.students.map((student) => student.id));
  const subjectsById = new Map(exam.class.subjects.map((subject) => [subject.id, subject]));

  if (user.role === "TEACHER") {
    const isClassTeacher = exam.class.classTeacherId === user.userId;
    const allowedSubjectIds = new Set(
      exam.class.subjects.filter((subject) => subject.teacherId === user.userId || isClassTeacher).map((subject) => subject.id),
    );
    if (!isClassTeacher && allowedSubjectIds.size === 0) throw new ApiError("This exam is not assigned to you", 403);
    if (entries.some((entry) => !allowedSubjectIds.has(entry.subjectId))) throw new ApiError("You can only enter marks for your assigned subjects", 403);
  }

  for (const entry of entries) {
    const subject = subjectsById.get(entry.subjectId);
    if (!studentIds.has(entry.studentId)) throw new ApiError("One or more students are outside this exam class", 400);
    if (!subject) throw new ApiError("One or more subjects are outside this exam class", 400);
    if (entry.isAbsent && entry.isExempt) throw new ApiError("A result cannot be both absent and exempt", 400);
    if (!entry.isAbsent && !entry.isExempt && entry.marksObtained > subject.totalMarks) throw new ApiError(`Marks cannot exceed ${subject.totalMarks}`, 400);
    if (exam.subjectId && entry.subjectId !== exam.subjectId) throw new ApiError("This exam only accepts marks for the assigned subject", 400);
  }

  // SKO-503: the room sheet is authoritative. A pupil recorded absent for this exam and subject gets no mark
  // until the exam office reopens the entry; recording them absent here stays allowed.
  const absentees = await prisma.examAttendance.findMany({
    where: { schoolId: user.schoolId, status: "ABSENT", studentId: { in: entries.filter((entry) => !entry.isAbsent && !entry.isExempt).map((entry) => entry.studentId) }, scheduleId: { in: (await prisma.examSchedule.findMany({ where: { schoolId: user.schoolId, examId, subjectId: { in: entries.map((entry) => entry.subjectId) } }, select: { id: true } })).map((row) => row.id) } },
    select: { studentId: true },
  });
  if (absentees.length) {
    throw new ApiError("A pupil is recorded absent on the room sheet. The exam office must reopen the entry before a mark is entered.", 409, "ROOM_SHEET_ABSENT");
  }

  // Per-subject grades follow the class's configured ladder, the same one
  // the report card uses — otherwise a mark shows "B" on the marks screen
  // and "A" on the report card for the identical score.
  const thresholds = await thresholdsForClass(exam.classId, exam.academicYear, prisma, exam.academicModelVersionId);
  const expectedMarks = input.expectedMarks && typeof input.expectedMarks === "object" ? input.expectedMarks as Record<string, unknown> : null;

  const { savedCount, changed } = await prisma.$transaction(async (tx) => {
    const existingMarks = await tx.mark.findMany({ where: { examId } });
    const existingByKey = new Map(existingMarks.map((mark) => [`${mark.studentId}:${mark.subjectId}`, mark]));

    if (expectedMarks) {
      for (const entry of entries) {
        const key = `${entry.studentId}:${entry.subjectId}`;
        const actual = existingByKey.get(key);
        const expected = expectedMarks[key];
        if ((actual ? String(actual.marksObtained) : "") !== String(expected ?? "")) throw new Error("RECORD_CHANGED");
      }
    }
    let changed = 0;
    let savedCount = 0;

    for (const entry of entries) {
      const subject = subjectsById.get(entry.subjectId)!;
      // An absent pupil has no score to grade. Storing 0 with a grade of "F"
      // is what made absence indistinguishable from a genuine zero.
      const absent = entry.isAbsent === true;
      const exempt = entry.isExempt === true;
      const obtained = absent || exempt ? 0 : entry.marksObtained;
      const grade = absent || exempt ? null : gradeForMark(obtained, subject.totalMarks, thresholds);
      const key = `${entry.studentId}:${entry.subjectId}`;
      const oldMark = existingByKey.get(key);

      const mark = oldMark
        ? await tx.mark.update({
            where: { id: oldMark.id },
            data: { marksObtained: obtained, isAbsent: absent, isExempt: exempt, grade, enteredBy: user.userId },
          })
        : await tx.mark.create({
            data: {
              campusId: exam.campusId,
              examId,
              studentId: entry.studentId,
              subjectId: entry.subjectId,
              marksObtained: obtained,
              isAbsent: absent,
              isExempt: exempt,
              grade,
              enteredBy: user.userId,
            },
          });

      const didChange =
        !oldMark ||
        oldMark.marksObtained !== obtained ||
        oldMark.isAbsent !== absent ||
        oldMark.isExempt !== exempt ||
        oldMark.grade !== grade ||
        oldMark.enteredBy !== user.userId;

      if (didChange) {
        changed += 1;
        await tx.auditLog.create({
          data: {
            tableName: "marks",
            recordId: mark.id,
            oldValue: oldMark ? markSnapshot(oldMark) : Prisma.JsonNull,
            newValue: markSnapshot(mark),
            userId: user.userId,
            ipAddress: input.ipAddress,
          },
        });
      }

      savedCount += 1;
    }

    if (exam.status === "ACTIVE") {
      await tx.exam.update({
        where: { id: examId },
        data: { status: "MARKS_ENTRY", marksEntryAt: new Date() },
      });
    }

    return { savedCount, changed };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  notify("MARKS_ENTERED", {
    schoolId: user.schoolId,
    campusId: exam.campusId,
    actorId: user.userId,
    actorName: user.fullName,
    examTitle: exam.title,
    className: [exam.class?.name, exam.class?.section].join(" "),
    classId: exam.classId,
    count: savedCount,
  });

  return { savedCount, changed, exam: { id: exam.id, classId: exam.classId, campusId: exam.campusId } };
}
