import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { generateReportCardsForLockedExam } from "@/lib/academic/report-cards";

function canLockExam(role: string) {
  return role === "SUPER_ADMIN" || role === "PRINCIPAL" || isCampusAdminRole(role);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canLockExam(user.role)) {
    return Response.json({ error: "Only admins/principals can lock exams" }, { status: 403 });
  }

  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      class: {
        include: {
          students: { select: { id: true } },
          subjects: { select: { id: true } },
        },
      },
      _count: { select: { marks: true } },
    },
  });

  if (!exam) return Response.json({ error: "Exam not found" }, { status: 404 });
  if (user.campusId && exam.campusId !== user.campusId) {
    return Response.json({ error: "Exam is outside your campus" }, { status: 403 });
  }
  if (exam.isLocked) return Response.json({ error: "Exam already locked" }, { status: 400 });

  const expectedMarks = exam.class.students.length * exam.class.subjects.length;
  if (expectedMarks === 0) {
    return Response.json({ error: "Add students and subjects before locking this exam" }, { status: 409 });
  }
  const studentIds = new Set(exam.class.students.map((student) => student.id));
  const subjectIds = new Set(exam.class.subjects.map((subject) => subject.id));
  const validMarks = await prisma.mark.findMany({
    where: {
      examId: id,
      campusId: exam.campusId,
      studentId: { in: [...studentIds] },
      subjectId: { in: [...subjectIds] },
    },
    select: { studentId: true, subjectId: true },
  });
  const enteredPairs = new Set(validMarks.map((mark) => `${mark.studentId}:${mark.subjectId}`));

  if (enteredPairs.size < expectedMarks) {
    return Response.json(
      { error: `Marks entry is incomplete (${enteredPairs.size}/${expectedMarks})` },
      { status: 409 }
    );
  }

  const locked = await prisma.exam.update({
    where: { id },
    data: {
      isLocked: true,
      status: "LOCKED",
      lockedBy: user.userId,
      lockedAt: new Date(),
    },
    include: {
      class: { select: { id: true, name: true, section: true, academicYear: true } },
      locker: { select: { fullName: true } },
      _count: { select: { marks: true, reportCards: true } },
    },
  });

  const generated = await generateReportCardsForLockedExam(id);

  return Response.json({
    success: true,
    exam: { ...locked, _count: { ...locked._count, reportCards: generated.generated } },
    reportCardsGenerated: generated.generated,
  });
}
