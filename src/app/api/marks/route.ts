import { ApiError, assertModuleRead, errorResponse } from "@/lib/api/scope";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { bulkMarksSchema } from "@/lib/validators/schemas";
import { enterBulkMarks } from "@/lib/marks/enter-bulk-command";
import { clientIp } from "@/lib/http/client-ip";

function canEnterMarks(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
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

    const { savedCount, changed } = await enterBulkMarks(user, {
      examId: parsed.data.examId,
      entries: parsed.data.entries,
      expectedMarks: body.expectedMarks,
      ipAddress: clientIp(req.headers),
    });

    return Response.json({ success: true, count: savedCount, changed });
  } catch (error: any) {
    if (error?.message === "RECORD_CHANGED" || error?.code === "P2034") return Response.json({ conflict: true, error: "This marks sheet changed. Review your draft against the current server values before saving." }, { status: 409 });
    if (error instanceof ApiError) return Response.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    console.error("Marks POST error:", error);
    return Response.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { await assertModuleRead(user, "exams"); } catch (error) { return errorResponse(error); }
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
