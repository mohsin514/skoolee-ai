import { familyVersion, getPublishedVersion } from "@/lib/academic/report-versions";
import { prisma } from "@/lib/db/prisma";
import type { AuthUser } from "@/lib/auth";
import { AccessDenied, studentScope, publishedReportsWhere } from "@/lib/auth/policy";

export async function getStudentContext(user: AuthUser, studentId?: string) {
  const student = await prisma.student.findFirst({
    where: {
      campus: { schoolId: user.schoolId },
      consolidatedIntoId: null,
      ...(studentId ? { id: studentId } : {}),
      ...studentScope(user),
    },
    include: {
      class: { select: { name: true, section: true, academicYear: true } },
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

  if (!student) return null;
  const reports = await Promise.all(student.reportCards.map(async r => familyVersion(await getPublishedVersion(r.id))));
  return { ...student, reportCards: reports, marks: reports.flatMap(r => r.marks.map(m => ({ ...m, examId: r.examId, marksObtained: m.obtained, subject: { name: m.subject, totalMarks: m.total }, exam: { title: r.examTitle, term: r.term, academicYear: r.academicYear } }))) };
}

