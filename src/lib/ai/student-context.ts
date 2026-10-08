import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { AccessDenied, studentScope, publishedMarksWhere, publishedReportsWhere } from "@/lib/auth/policy";

export async function getStudentContext(user: AuthUser, studentId?: string) {
  const student = await prisma.student.findFirst({
    where: {
      campus: { schoolId: user.schoolId },
      ...(studentId ? { id: studentId } : {}),
      ...studentScope(user),
    },
    include: {
      class: { select: { name: true, section: true, academicYear: true } },
      marks: {
        where: publishedMarksWhere,
        include: {
          subject: { select: { name: true, totalMarks: true } },
          exam: { select: { title: true, term: true, academicYear: true } },
        },
        take: 40,
      },
      reportCards: {
        where: publishedReportsWhere,
        include: { exam: { select: { title: true, term: true, academicYear: true } } },
        orderBy: { generatedAt: "desc" },
        take: 3,
      },
    },
  });

  if (studentId && !student) {
    throw new AccessDenied("student", "view", user);
  }

  return student;
}

