import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { bulkMarksSchema } from "@/lib/validators/schemas";
import { gradeForMark, isLockedStatus, thresholdsForClass } from "@/lib/academic/report-cards";
import { notify } from "@/lib/notifications/in-app";

function canEnterMarks(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

function markSnapshot(mark: {
  marksObtained: number;
  isAbsent?: boolean;
  grade: string | null;
  enteredBy: string | null;
}) {
  return {
    marksObtained: mark.marksObtained,
    isAbsent: mark.isAbsent ?? false,
    grade: mark.grade,
    enteredBy: mark.enteredBy,
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const billingBlocked = await billingAccessResponse(user.schoolId);
    if (billingBlocked) return billingBlocked;
    if (!canEnterMarks(user.role)) {
      return Response.json({ error: "Only academic staff can enter marks" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = bulkMarksSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const { examId } = parsed.data;
    const entries = [
      ...new Map(
        parsed.data.entries.map((entry) => [`${entry.studentId}:${entry.subjectId}`, entry])
      ).values(),
    ];

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        campusId: true,
        classId: true,
        academicYear: true,
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

    if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
    if (user.campusId && exam.campusId !== user.campusId) {
      return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
    }
    if (exam.isLocked || isLockedStatus(exam.status)) {
      return Response.json({ error: "Exam is locked; marks cannot be edited" }, { status: 403 });
    }
    if (exam.status === "DRAFT") {
      return Response.json({ error: "Activate the exam before marks entry" }, { status: 409 });
    }

    const studentIds = new Set(exam.class.students.map((student) => student.id));
    const subjectsById = new Map(exam.class.subjects.map((subject) => [subject.id, subject]));

    if (user.role === "TEACHER") {
      const isClassTeacher = exam.class.classTeacherId === user.userId;
      const allowedSubjectIds = new Set(
        exam.class.subjects
          .filter((subject) => subject.teacherId === user.userId || isClassTeacher)
          .map((subject) => subject.id)
      );

      if (!isClassTeacher && allowedSubjectIds.size === 0) {
        return Response.json({ error: "This exam is not assigned to you" }, { status: 403 });
      }

      if (entries.some((entry) => !allowedSubjectIds.has(entry.subjectId))) {
        return Response.json({ error: "You can only enter marks for your assigned subjects" }, { status: 403 });
      }
    }

    for (const entry of entries) {
      const subject = subjectsById.get(entry.subjectId);
      if (!studentIds.has(entry.studentId)) {
        return Response.json({ error: "One or more students are outside this exam class" }, { status: 400 });
      }
      if (!subject) {
        return Response.json({ error: "One or more subjects are outside this exam class" }, { status: 400 });
      }
      if (!entry.isAbsent && entry.marksObtained > subject.totalMarks) {
        return Response.json(
          { error: `Marks cannot exceed ${subject.totalMarks}` },
          { status: 400 }
        );
      }
      if (exam.subjectId && entry.subjectId !== exam.subjectId) {
        return Response.json({ error: "This exam only accepts marks for the assigned subject" }, { status: 400 });
      }
    }

    // Per-subject grades follow the class's configured ladder, the same one
    // the report card uses — otherwise a mark shows "B" on the marks screen
    // and "A" on the report card for the identical score.
    const thresholds = await thresholdsForClass(exam.classId, exam.academicYear);

    const existingMarks = await prisma.mark.findMany({ where: { examId } });
    const existingByKey = new Map(
      existingMarks.map((mark) => [`${mark.studentId}:${mark.subjectId}`, mark])
    );

    let changed = 0;
    let savedCount = 0;

    for (const entry of entries) {
      const subject = subjectsById.get(entry.subjectId)!;
      // An absent pupil has no score to grade. Storing 0 with a grade of "F"
      // is what made absence indistinguishable from a genuine zero.
      const absent = entry.isAbsent === true;
      const obtained = absent ? 0 : entry.marksObtained;
      const grade = absent ? null : gradeForMark(obtained, subject.totalMarks, thresholds);
      const key = `${entry.studentId}:${entry.subjectId}`;
      const oldMark = existingByKey.get(key);

      const mark = oldMark
        ? await prisma.mark.update({
            where: { id: oldMark.id },
            data: { marksObtained: obtained, isAbsent: absent, grade, enteredBy: user.userId },
          })
        : await prisma.mark.create({
            data: {
              campusId: exam.campusId,
              examId,
              studentId: entry.studentId,
              subjectId: entry.subjectId,
              marksObtained: obtained,
              isAbsent: absent,
              grade,
              enteredBy: user.userId,
            },
          });

      const didChange =
        !oldMark ||
        oldMark.marksObtained !== obtained ||
        oldMark.isAbsent !== absent ||
        oldMark.grade !== grade ||
        oldMark.enteredBy !== user.userId;

      if (didChange) {
        changed += 1;
        await prisma.auditLog.create({
          data: {
            tableName: "marks",
            recordId: mark.id,
            oldValue: oldMark ? markSnapshot(oldMark) : Prisma.JsonNull,
            newValue: markSnapshot(mark),
            userId: user.userId,
            ipAddress: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip"),
          },
        });
      }

      savedCount += 1;
    }

    if (exam.status === "ACTIVE") {
      await prisma.exam.update({
        where: { id: examId },
        data: { status: "MARKS_ENTRY", marksEntryAt: new Date() },
      });
    }

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

    return Response.json({ success: true, count: savedCount, changed });
  } catch (error: any) {
    console.error("Marks POST error:", error);
    return Response.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;

  const { searchParams } = new URL(req.url);
  const examId = searchParams.get("examId");
  if (!examId) return Response.json({ error: "examId required" }, { status: 400 });

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          section: true,
          classTeacherId: true,
          students: {
            select: { id: true, fullName: true, rollNo: true, profileImageUrl: true },
            orderBy: [{ rollNo: "asc" }, { fullName: "asc" }],
          },
          subjects: {
            select: { id: true, name: true, totalMarks: true, teacherId: true },
            orderBy: { name: "asc" },
          },
        },
      },
       locker: { select: { fullName: true } },
       subject: { select: { id: true, name: true } },
    },
  });

  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  if (user.campusId && exam.campusId !== user.campusId) {
    return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
  }

  // If exam is for a single subject, only show that subject
  const classSubjects = exam.class.subjects;
  const filteredSubjects = exam.subjectId
    ? classSubjects.filter((s) => s.id === exam.subjectId)
    : classSubjects;

  const isTeacher = user.role === "TEACHER";
  const isClassTeacher = exam.class.classTeacherId === user.userId;
  const visibleSubjects = isTeacher
    ? filteredSubjects.filter((subject) => subject.teacherId === user.userId || isClassTeacher)
    : filteredSubjects;
  const visibleSubjectIds = new Set(visibleSubjects.map((subject) => subject.id));

  if (isTeacher && !isClassTeacher && visibleSubjects.length === 0) {
    return Response.json({ error: "This exam is not assigned to you" }, { status: 403 });
  }

  const marks = await prisma.mark.findMany({
    where: {
      examId,
      campusId: exam.campusId,
      ...(isTeacher ? { subjectId: { in: [...visibleSubjectIds] } } : {}),
    },
    include: {
      student: { select: { fullName: true, rollNo: true } },
      subject: { select: { name: true, totalMarks: true } },
      enterer: { select: { fullName: true } },
    },
    orderBy: [{ student: { rollNo: "asc" } }, { subject: { name: "asc" } }],
  });

  const subjectTotals = new Map<string, { obtained: number; total: number; count: number }>();
  const studentTotals = new Map<string, { obtained: number; total: number }>();

  for (const mark of marks) {
    // A paper nobody sat is not a score of zero. Counting it as one would
    // report a class average that no pupil actually achieved, so absent rows
    // are left out of both the numerator and the denominator.
    if (mark.isAbsent) continue;

    const subjectTotal = subjectTotals.get(mark.subjectId) || { obtained: 0, total: 0, count: 0 };
    subjectTotal.obtained += mark.marksObtained;
    subjectTotal.total += mark.subject.totalMarks;
    subjectTotal.count += 1;
    subjectTotals.set(mark.subjectId, subjectTotal);

    const studentTotal = studentTotals.get(mark.studentId) || { obtained: 0, total: 0 };
    studentTotal.obtained += mark.marksObtained;
    studentTotal.total += mark.subject.totalMarks;
    studentTotals.set(mark.studentId, studentTotal);
  }

  const studentPercentages = [...studentTotals.values()]
    .filter((total) => total.total > 0)
    .map((total) => (total.obtained / total.total) * 100);

  const analytics = {
    classAverage: studentPercentages.length
      ? Math.round((studentPercentages.reduce((sum, pct) => sum + pct, 0) / studentPercentages.length) * 10) / 10
      : 0,
    subjectAverages: visibleSubjects.map((subject) => {
      const total = subjectTotals.get(subject.id);
      return {
        subjectId: subject.id,
        subject: subject.name,
        average: total && total.total > 0 ? Math.round((total.obtained / total.total) * 1000) / 10 : 0,
        entries: total?.count || 0,
      };
    }),
  };

  return Response.json({
    success: true,
    exam,
    students: exam.class.students,
    subjects: visibleSubjects,
    marks,
    analytics,
    debug: { examSubjectId: exam.subjectId, filteredCount: visibleSubjects.length, totalSubjectsInClass: classSubjects.length },
  });
}
