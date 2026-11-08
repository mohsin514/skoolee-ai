import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { ApiError, canLeadAcademics, canManageAcademics, errorResponse } from "@/lib/api/scope";
import { prisma } from "@/lib/db/prisma";
import { canManageExamType, TERM_EXAM_DENIED_MESSAGE } from "@/lib/academic/exam-permissions";
import { generateReportCardsForLockedExam } from "@/lib/academic/report-cards";
import { resolveExamSchedulingCampus, withExamSchedulingWrite } from "@/lib/academic/exam-scheduling-write";
import { notify } from "@/lib/notifications/in-app";
import { writeAuditEvent } from "@/lib/audit-events";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) throw new ApiError("Unauthorized", 401);
    const isTeacher = user.role === "TEACHER";
    // The group admin no longer runs campus exams (§7.6 "scheduling stays office minus SA").
    if (!isTeacher && (!canManageAcademics(user) || user.role === "SUPER_ADMIN")) throw new ApiError("Exam marks are locked by your principal.", 403);
    const { id } = await params;
    const campusId = await resolveExamSchedulingCampus(user, null, { kind: "exam", id });
    // G30: a teacher locks the quizzes and class tests they teach; every other lock is the academic lead's
    // act (the principal, or a campus operator while the campus has no principal) [R-I5].
    const target = await prisma.exam.findFirst({ where: { id, schoolId: user.schoolId, campusId }, select: { examType: true, classId: true, subjectId: true } });
    if (!target) throw new ApiError("Exam not found", 404);
    if (isTeacher) {
      if (!canManageExamType("TEACHER", target.examType)) throw new ApiError(TERM_EXAM_DENIED_MESSAGE, 403);
      const teaches = await prisma.class.findFirst({
        where: {
          id: target.classId, schoolId: user.schoolId, campusId,
          OR: [{ classTeacherId: user.userId }, { subjects: { some: { teacherId: user.userId, ...(target.subjectId ? { id: target.subjectId } : {}) } } }],
        },
        select: { id: true },
      });
      if (!teaches) throw new ApiError("You can lock only the tests for classes you teach.", 403);
    } else if (!(await canLeadAcademics(user, campusId))) {
      throw new ApiError("Exam marks are locked by your principal.", 403);
    }
    // Lock generates this exam's own result cards (per exam, never a term aggregate), which is what the
    // academic lead reviews and publishes next; a class test therefore needs no separate SUBMITTED state.
    const { locked, generated } = await withExamSchedulingWrite(user, campusId, "edit", async tx => {
      const exam = await tx.exam.findFirst({ where: { id, schoolId: user.schoolId, campusId }, include: { class: { include: { students: { select: { id: true } }, subjects: { select: { id: true } } } } } });
      if (!exam) throw new ApiError("Exam not found", 404);
      if (exam.isLocked) throw new ApiError("Exam already locked", 400);
      if (!["DRAFT", "ACTIVE", "MARKS_ENTRY"].includes(exam.status)) throw new ApiError("This exam cannot be locked from its current state.", 409);
      const subjects = exam.subjectId ? exam.class.subjects.filter(subject => subject.id === exam.subjectId) : exam.class.subjects;
      const expected = exam.class.students.length * subjects.length;
      if (!expected) throw new ApiError("Add students and subjects before locking this exam", 409);
      const marks = await tx.mark.findMany({ where: { schoolId: user.schoolId, campusId, examId: id, studentId: { in: exam.class.students.map(student => student.id) }, subjectId: { in: subjects.map(subject => subject.id) } }, select: { studentId: true, subjectId: true } });
      const entered = new Set(marks.map(mark => `${mark.studentId}:${mark.subjectId}`)).size;
      if (entered < expected) throw new ApiError(`Marks entry is incomplete (${entered}/${expected})`, 409);
      const locked = await tx.exam.update({ where: { id }, data: { isLocked: true, status: "LOCKED", lockedBy: user.userId, lockedAt: new Date(), rejectionReason: null, rejectedBy: null, rejectedAt: null }, include: { class: { select: { id: true, name: true, section: true, academicYear: true } }, locker: { select: { fullName: true } }, _count: { select: { marks: true, reportCards: true } } } });
      // A rejection cannot interleave between locking and report creation.
      const generated = await generateReportCardsForLockedExam(id, tx);
      await writeAuditEvent(tx, user, { table: "exams", recordId: id, action: "LOCK", campusId, before: { status: exam.status, isLocked: exam.isLocked }, after: { status: locked.status, isLocked: true, reportCardsGenerated: generated.generated } });
      return { locked, generated: generated.generated };
    }, isTeacher);
    notify("EXAM_LOCKED", { schoolId: user.schoolId, campusId, actorId: user.userId, actorName: user.fullName, examTitle: locked.title, className: [locked.class.name, locked.class.section].filter(Boolean).join(" "), classId: locked.classId, reportCardsGenerated: generated });
    return Response.json({ success: true, exam: { ...locked, _count: { ...locked._count, reportCards: generated } }, reportCardsGenerated: generated });
  } catch (error) { return errorResponse(error, "Unable to lock this exam."); }
}
