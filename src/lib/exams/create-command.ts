import { withExamSchedulingWrite } from "@/lib/academic/exam-scheduling-write";
import { resolveAcademicModelVersionForTerm } from "@/lib/academic/model-service";
import {
  canCreateExamType,
  CLASSROOM_EXAM_DENIED_MESSAGE,
  isOfficeRole,
  TERM_EXAM_DENIED_MESSAGE,
} from "@/lib/academic/exam-permissions";
import { ApiError } from "@/lib/api/scope";
import type { AuthUser } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit-events";
import { prisma } from "@/lib/db/prisma";
import { notify } from "@/lib/notifications/in-app";

/**
 * Creating one exam (POST /api/exams), shared by the exams route and the AI Workflows `exams.create`
 * capability. The caller has already passed the route's role, billing and permission-matrix checks.
 * Here: the class must be on the caller's campus and active in the year; a teacher must lead or teach
 * in it; the type split holds (teachers: quizzes and class tests, the office: term exams); one term
 * exam per class, year and term; totals come from the class's subjects. EXAM_CREATED goes to the
 * academic lead and the class's teachers once the write commits.
 * Every refusal is an ApiError whose message and status the route already returned.
 */
export interface CreateExamInput {
  classId: string;
  title: string;
  term: string;
  academicYear: number;
  subjectId?: string;
  /** Already defaulted by the caller (the route keeps `body.examType || role default`). */
  examType: string;
}

export const defaultExamType = (role: string) => (role === "TEACHER" ? "CLASS_TEST" : "MID_TERM");

export async function createExamCommand(user: AuthUser, input: CreateExamInput) {
  const cls = await prisma.class.findFirst({
    where: {
      id: input.classId,
      // Exam creators are campus-pinned (the group admin no longer schedules campus exams).
      campus: { schoolId: user.schoolId, id: user.campusId || "" },
    },
    select: { id: true, campusId: true },
  });
  if (!cls) throw new ApiError("Class not found", 404);

  const exam = await withExamSchedulingWrite(user, cls.campusId, "add", async (tx) => {
    const currentClass = await tx.class.findFirst({ where: { id: cls.id, schoolId: user.schoolId, campusId: cls.campusId, status: "ACTIVE", archivedAt: null, academicYear: input.academicYear } });
    if (!currentClass) throw new ApiError("Class is not active in this academic year.", 409);
    // If teacher, verify they are assigned to this class
    if (user.role === "TEACHER") {
      const isAssigned = await tx.subject.findFirst({
        where: { classId: input.classId, teacherId: user.userId, campusId: cls.campusId },
      });
      const isClassTeacher = await tx.class.findFirst({
        where: { id: input.classId, classTeacherId: user.userId },
      });
      if (!isAssigned && !isClassTeacher) throw new ApiError("You are not assigned to this class", 403);
    }

    // Teachers own quizzes and class tests; term exams belong to the office.
    // Since §80 the split is enforced in both directions — the office creating
    // a quiz was how classroom assessments ended up on the exam board needing
    // date sheets and seating plans they would never have.
    const examType = input.examType;
    if (!canCreateExamType(user.role, examType)) {
      throw new ApiError(isOfficeRole(user.role) ? CLASSROOM_EXAM_DENIED_MESSAGE : TERM_EXAM_DENIED_MESSAGE, 403);
    }

    if (["MID_TERM", "FINAL"].includes(examType)) {
      const duplicate = await tx.exam.findFirst({ where: { schoolId: user.schoolId, campusId: cls.campusId, classId: cls.id, academicYear: input.academicYear, examType, term: { equals: input.term, mode: "insensitive" } } });
      if (duplicate) throw new ApiError("This class already has this term exam. Edit its existing session.", 409);
    }
    const subjectFilter = input.subjectId ? { id: input.subjectId } : {};
    const subjects = await tx.subject.findMany({
      where: { classId: input.classId, campusId: cls.campusId, ...subjectFilter },
      select: { totalMarks: true },
    });
    const totalMarks = subjects.reduce((sum, s) => sum + s.totalMarks, 0);

    const academicModelVersionId = await resolveAcademicModelVersionForTerm({
      campusId: cls.campusId,
      classId: input.classId,
      academicYear: input.academicYear,
      term: input.term,
    }, tx);

    // If a specific subject is selected, verify it belongs to the class
    if (input.subjectId && subjects.length === 0) throw new ApiError("Selected subject not found in this class", 400);

    const created = await tx.exam.create({
      data: {
        campusId: cls.campusId,
        classId: input.classId,
        title: input.title,
        term: input.term,
        academicYear: input.academicYear,
        academicModelVersionId,
        examType,
        subjectId: input.subjectId || null,
        totalMarks,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
      include: {
        class: { select: { id: true, name: true, section: true, academicYear: true } },
        _count: { select: { marks: true, reportCards: true } },
      },
    });

    await writeAuditEvent(tx, user, {
      table: "exams", recordId: created.id, action: "CREATE", campusId: created.campusId,
      after: { status: created.status, examType: created.examType, academicYear: created.academicYear, totalMarks: created.totalMarks },
    });
    return created;
  }, true);

  notify("EXAM_CREATED", {
    schoolId: user.schoolId,
    campusId: cls.campusId,
    actorId: user.userId,
    actorName: user.fullName,
    examTitle: exam.title,
    className: [exam.class?.name, exam.class?.section].filter(Boolean).join(" "),
    classId: input.classId,
  });
  return exam;
}
