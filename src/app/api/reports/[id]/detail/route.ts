import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth";
import { billingAccessResponse } from "@/lib/billing/response";
import { isCampusAdminRole } from "@/lib/roles";
import { calculateWeightedGrade, getOrCreateGradeWeightConfig, gradeForMark, gradeForPercentage, type WeightConfig } from "@/lib/academic/grade-calculator";

export const runtime = "nodejs";

function canViewReportCards(role: string) {
  return role === "TEACHER" || role === "PRINCIPAL" || role === "SUPER_ADMIN" || isCampusAdminRole(role);
}

function weightForExamType(examType: string, config: WeightConfig): number {
  switch (examType) {
    case "QUIZ": return config.quizWeight;
    case "CLASS_TEST": return config.classTestWeight;
    case "MID_TERM": return config.midTermWeight;
    case "FINAL": return config.finalWeight;
    default: return 0;
  }
}

async function buildSubjectDistribution(opts: {
  studentId: string;
  campusId: string;
  classId: string;
  academicYear: number;
  weightConfig: WeightConfig;
  excludeExamId?: string;
}) {
  const subjects = await prisma.subject.findMany({
    where: { classId: opts.classId, campusId: opts.campusId },
    select: { id: true, name: true, totalMarks: true },
    orderBy: { name: "asc" },
  });
  const exams = await prisma.exam.findMany({
    where: {
      classId: opts.classId,
      campusId: opts.campusId,
      academicYear: opts.academicYear,
      status: { notIn: ["DRAFT", "ACTIVE"] },
    },
    select: { id: true, title: true, examType: true, subjectId: true },
    orderBy: [{ examType: "asc" }, { title: "asc" }],
  });
  const marks = await prisma.mark.findMany({
    where: {
      studentId: opts.studentId,
      examId: { in: exams.map((e) => e.id) },
      subjectId: { in: subjects.map((s) => s.id) },
    },
  });

  return subjects.map((subject) => {
    const subjectMarks = marks.filter((m) => m.subjectId === subject.id);
    const examRows = exams
      .filter((exam) => (exam.subjectId ? exam.subjectId === subject.id : exam.id !== opts.excludeExamId))
      .map((exam) => {
        const obtainedMarks = subjectMarks.filter((m) => m.examId === exam.id).reduce((sum, m) => sum + m.marksObtained, 0);
        const totalMarks = subject.totalMarks;
        const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
        const weight = weightForExamType(exam.examType, opts.weightConfig);
        return {
          examId: exam.id,
          examTitle: exam.title,
          examType: exam.examType,
          weight,
          obtainedMarks,
          totalMarks,
          percentage,
          grade: gradeForPercentage(percentage, opts.weightConfig.thresholds),
          contribution: (percentage * weight) / 100,
        };
      })
      .filter((row) => row.weight > 0);
    const totalTotal = subjectMarks.length > 0 ? subjectMarks.length * subject.totalMarks : subject.totalMarks;
    const obtainedTotal = subjectMarks.reduce((sum, m) => sum + m.marksObtained, 0);
    const percentage = totalTotal > 0 ? Math.round((obtainedTotal / totalTotal) * 100) : 0;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      totalMarks: totalTotal,
      obtainedMarks: obtainedTotal,
      percentage,
      grade: gradeForPercentage(percentage, opts.weightConfig.thresholds),
      exams: examRows,
    };
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const billingBlocked = await billingAccessResponse(user.schoolId);
  if (billingBlocked) return billingBlocked;
  if (!canViewReportCards(user.role)) {
    return Response.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { id } = await params;

  const reportCard = await prisma.reportCard.findFirst({
    where: { id, campus: { schoolId: user.schoolId } },
    include: {
      student: {
        select: {
          id: true,
          fullName: true,
          rollNo: true,
          profileImageUrl: true,
          class: { select: { id: true, name: true, section: true } },
        },
      },
      exam: {
        select: { id: true, title: true, term: true, status: true, examType: true, subjectId: true, academicYear: true },
      },
    },
  });

  if (!reportCard) return Response.json({ error: "Report card not found" }, { status: 404 });
  if (user.campusId && reportCard.campusId !== user.campusId) {
    return Response.json({ error: "Report card is outside your campus" }, { status: 403 });
  }

  const marks = await prisma.mark.findMany({
    where: { examId: reportCard.examId, studentId: reportCard.studentId },
    include: { subject: { select: { id: true, name: true, totalMarks: true } } },
    orderBy: { subject: { name: "asc" } },
  });

  let subjectBreakdown: any[] = [];
  let examResults: any[] = [];
  let subjectDistribution: any[] = [];
  let weightConfig: WeightConfig | null = null;
  let overall: { overallPercentage: number; overallGrade: string; passed: boolean } | null = null;

  const studentClassId = reportCard.student.class?.id;
  const isAggregateFinal = reportCard.exam.subjectId === null && reportCard.exam.examType === "FINAL";
  if (studentClassId) {
    try {
      const grade = await calculateWeightedGrade(
        reportCard.studentId,
        reportCard.campusId,
        studentClassId,
        reportCard.exam.academicYear
      );
      subjectBreakdown = grade.subjectBreakdown || [];
      examResults = (grade.examResults || []).filter((result) => !(isAggregateFinal && result.examId === reportCard.examId));
      overall = {
        overallPercentage: grade.overallPercentage,
        overallGrade: grade.overallGrade,
        passed: grade.passed,
      };
      weightConfig = await getOrCreateGradeWeightConfig(
        reportCard.campusId,
        studentClassId,
        reportCard.exam.academicYear
      );
      subjectDistribution = await buildSubjectDistribution({
        studentId: reportCard.studentId,
        campusId: reportCard.campusId,
        classId: studentClassId,
        academicYear: reportCard.exam.academicYear,
        weightConfig,
        ...(isAggregateFinal ? { excludeExamId: reportCard.examId } : {}),
      });
    } catch {}
  }

  if (marks.length > 0) {
    subjectBreakdown = marks.map((mark) => ({
      subjectId: mark.subject.id,
      subjectName: mark.subject.name,
      totalMarks: mark.subject.totalMarks,
      obtainedMarks: mark.marksObtained,
      percentage: mark.subject.totalMarks > 0 ? Math.round((mark.marksObtained / mark.subject.totalMarks) * 100) : 0,
      grade: mark.grade || gradeForMark(mark.marksObtained, mark.subject.totalMarks),
    }));
  }

  return Response.json({
    success: true,
    reportCard: {
      ...reportCard,
      ...(isAggregateFinal && overall
        ? { percentage: overall.overallPercentage, grade: overall.overallGrade }
        : {}),
      subjectBreakdown,
      examResults,
      subjectDistribution,
      weightConfig,
      overall,
    },
  });
}
