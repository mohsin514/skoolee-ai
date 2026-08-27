import { prisma } from "@/lib/db/prisma";
import {
  buildSubjectDistribution,
  calculateWeightedGrade,
  getOrCreateGradeWeightConfig,
  gradeForPercentage,
  type GradeThresholds,
  type WeightConfig,
} from "@/lib/academic/grade-calculator";

export const EXAM_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "MARKS_ENTRY",
  "LOCKED",
  "PRINCIPAL_REVIEWED",
  "PUBLISHED",
] as const;

export type ExamStatus = (typeof EXAM_STATUSES)[number];

/**
 * Grade thresholds for one class, as the office configured them (§82).
 *
 * There used to be a second, hard-coded copy of this ladder here — 90/80/70/
 * 60/50, with no way to pass anything else in — and it was the copy that
 * report cards and the marks API actually used. A school that set A+ at 85 in
 * Grading Rules still got report cards graded at 90, so the entire grading
 * configuration was decorative for the two screens people read.
 *
 * `grade-calculator.ts` owns the real ladder. This re-exports it so there is
 * one implementation rather than two that drift.
 */
export { gradeForPercentage };
export type { GradeThresholds };

/**
 * The class's configured thresholds, or the defaults when it has none.
 *
 * Falling back silently is deliberate: a class with no config should still
 * produce report cards, on the same ladder the config form shows as its
 * starting point.
 */
export async function thresholdsForClass(
  classId: string,
  academicYear: number,
): Promise<GradeThresholds> {
  const config = await prisma.gradeWeightConfig.findUnique({
    where: { classId_academicYear: { classId, academicYear } },
    select: { gradeAplus: true, gradeA: true, gradeB: true, gradeC: true, gradeD: true },
  });
  return {
    aplus: config?.gradeAplus ?? 90,
    a: config?.gradeA ?? 80,
    b: config?.gradeB ?? 70,
    c: config?.gradeC ?? 60,
    d: config?.gradeD ?? 50,
  };
}

/** The pass mark for a class, as a fraction of the paper's total. */
export async function passingFractionForClass(
  classId: string,
  academicYear: number,
): Promise<number> {
  const config = await prisma.gradeWeightConfig.findUnique({
    where: { classId_academicYear: { classId, academicYear } },
    select: { passingPercentage: true },
  });
  return (config?.passingPercentage ?? 50) / 100;
}

export function gradeForMark(obtained: number, total: number, thresholds?: GradeThresholds) {
  return gradeForPercentage(total > 0 ? (obtained / total) * 100 : 0, thresholds);
}

export function isLockedStatus(status: string | null | undefined) {
  return status === "LOCKED" || status === "PRINCIPAL_REVIEWED" || status === "PUBLISHED";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function attendancePercent(present: number, total: number) {
  return total > 0 ? Math.round((present / total) * 100) : null;
}

export async function generateReportCardsForLockedExam(examId: string) {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      class: {
        include: {
          students: { orderBy: [{ rollNo: "asc" }, { fullName: "asc" }] },
          subjects: { orderBy: { name: "asc" } },
        },
      },
    },
  });

  if (!exam) throw new Error("Exam not found");
  if (!exam.isLocked && !isLockedStatus(exam.status)) {
    throw new Error("Report cards can only be generated from locked exams");
  }

  const students = exam.class.students;
  const subjects = exam.class.subjects;
  const studentIds = students.map((student) => student.id);

  // The class's own grading ladder — not the built-in one (§82).
  const thresholds = await thresholdsForClass(exam.classId, exam.academicYear);

  const [marks, attendance, existingReports] = await Promise.all([
    prisma.mark.findMany({
      where: { examId, campusId: exam.campusId },
      include: { subject: { select: { id: true, name: true, totalMarks: true } } },
    }),
    prisma.attendance.groupBy({
      by: ["studentId", "status"],
      where: { campusId: exam.campusId, studentId: { in: studentIds } },
      _count: { _all: true },
    }),
    prisma.reportCard.findMany({
      where: { examId },
      select: { studentId: true, status: true, isSent: true, deliveryStatus: true },
    }),
  ]);

  const marksByStudent = new Map<string, Map<string, (typeof marks)[number]>>();
  for (const mark of marks) {
    if (!marksByStudent.has(mark.studentId)) marksByStudent.set(mark.studentId, new Map());
    marksByStudent.get(mark.studentId)!.set(mark.subjectId, mark);
  }

  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  for (const row of attendance) {
    const current = attendanceByStudent.get(row.studentId) || { present: 0, total: 0 };
    current.total += row._count._all;
    if (row.status === "PRESENT") current.present += row._count._all;
    attendanceByStudent.set(row.studentId, current);
  }

  const existingByStudent = new Map(existingReports.map((report) => [report.studentId, report]));

  const results = students.map((student) => {
    const studentMarks = marksByStudent.get(student.id) ?? new Map<string, (typeof marks)[number]>();
    const totalMarks = subjects.reduce((sum, subject) => sum + subject.totalMarks, 0);
    const obtainedMarks = subjects.reduce((sum, subject) => {
      return sum + (studentMarks.get(subject.id)?.marksObtained || 0);
    }, 0);
    const percentage = totalMarks > 0 ? round1((obtainedMarks / totalMarks) * 100) : 0;
    const attendanceSummary = attendanceByStudent.get(student.id) || { present: 0, total: 0 };

    return {
      student,
      totalMarks,
      obtainedMarks,
      percentage,
      grade: gradeForPercentage(percentage, thresholds),
      attendancePresent: attendanceSummary.present,
      attendanceTotal: attendanceSummary.total,
      rank: 0,
    };
  });

  const ranked = [...results].sort((a, b) => {
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    if (b.obtainedMarks !== a.obtainedMarks) return b.obtainedMarks - a.obtainedMarks;
    return a.student.rollNo.localeCompare(b.student.rollNo, undefined, { numeric: true });
  });

  let lastPercentage: number | null = null;
  let lastRank = 0;
  ranked.forEach((result, index) => {
    if (lastPercentage === null || result.percentage !== lastPercentage) {
      lastRank = index + 1;
      lastPercentage = result.percentage;
    }
    result.rank = lastRank;
  });

  const resultByStudent = new Map(results.map((result) => [result.student.id, result]));
  const now = new Date();

  const reportCards = await prisma.$transaction(
    students.map((student) => {
      const result = resultByStudent.get(student.id)!;
      const existing = existingByStudent.get(student.id);
      const status = existing?.isSent
        ? "SENT"
        : existing?.status === "PUBLISHED"
          ? "PUBLISHED"
          : "GENERATED";

      return prisma.reportCard.upsert({
        where: { studentId_examId: { studentId: student.id, examId } },
        update: {
          totalMarks: result.totalMarks,
          obtainedMarks: result.obtainedMarks,
          percentage: result.percentage,
          grade: result.grade,
          rank: result.rank,
          attendancePresent: result.attendancePresent,
          attendanceTotal: result.attendanceTotal,
          status,
          generatedAt: now,
        },
        create: {
          campusId: exam.campusId,
          studentId: student.id,
          examId,
          totalMarks: result.totalMarks,
          obtainedMarks: result.obtainedMarks,
          percentage: result.percentage,
          grade: result.grade,
          rank: result.rank,
          attendancePresent: result.attendancePresent,
          attendanceTotal: result.attendanceTotal,
          status: "GENERATED",
        },
      });
    })
  );

  return { exam, reportCards, generated: reportCards.length };
}

export async function getExamAnalytics(examId: string) {
  const reportCards = await prisma.reportCard.findMany({
    where: { examId },
    include: {
      student: { select: { id: true, fullName: true, rollNo: true } },
      exam: { select: { campusId: true, academicYear: true } },
    },
    orderBy: [{ percentage: "desc" }, { obtainedMarks: "desc" }],
  });

  const marks = await prisma.mark.findMany({
    where: { examId },
    include: { subject: { select: { id: true, name: true, totalMarks: true } } },
  });

  const average = reportCards.length
    ? round1(reportCards.reduce((sum, report) => sum + report.percentage, 0) / reportCards.length)
    : 0;

  const subjectMap = new Map<string, { subjectId: string; subject: string; obtained: number; total: number; count: number }>();
  for (const mark of marks) {
    const item = subjectMap.get(mark.subjectId) || {
      subjectId: mark.subjectId,
      subject: mark.subject.name,
      obtained: 0,
      total: 0,
      count: 0,
    };
    item.obtained += mark.marksObtained;
    item.total += mark.subject.totalMarks;
    item.count += 1;
    subjectMap.set(mark.subjectId, item);
  }

  const subjectAverages = [...subjectMap.values()]
    .map((item) => ({
      subjectId: item.subjectId,
      subject: item.subject,
      average: item.count > 0 ? round1((item.obtained / item.total) * 100) : 0,
      entries: item.count,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const passCount = reportCards.filter((report) => report.percentage >= 50).length;
  const failCount = reportCards.length - passCount;
  const topStudents = reportCards.slice(0, 5).map((report) => ({
    studentId: report.studentId,
    name: report.student.fullName,
    rollNo: report.student.rollNo,
    percentage: report.percentage,
    rank: report.rank,
  }));

  const studentsNeedingAttention = reportCards
    .filter((report) => report.percentage < 50 || (attendancePercent(report.attendancePresent, report.attendanceTotal) ?? 100) < 75)
    .slice(0, 8)
    .map((report) => ({
      studentId: report.studentId,
      name: report.student.fullName,
      rollNo: report.student.rollNo,
      percentage: report.percentage,
      attendancePercentage: attendancePercent(report.attendancePresent, report.attendanceTotal),
    }));

  const campusId = reportCards[0]?.exam.campusId;
  const academicYear = reportCards[0]?.exam.academicYear;
  const campusSummary = campusId
    ? {
        lockedExams: await prisma.exam.count({
          where: {
            campusId,
            ...(academicYear ? { academicYear } : {}),
            OR: [{ isLocked: true }, { status: { in: ["LOCKED", "PRINCIPAL_REVIEWED", "PUBLISHED"] } }],
          },
        }),
        publishedExams: await prisma.exam.count({
          where: { campusId, ...(academicYear ? { academicYear } : {}), status: "PUBLISHED" },
        }),
        reportCardsGenerated: await prisma.reportCard.count({ where: { campusId } }),
        reportsSent: await prisma.reportCard.count({ where: { campusId, isSent: true } }),
      }
    : {
        lockedExams: 0,
        publishedExams: 0,
        reportCardsGenerated: 0,
        reportsSent: 0,
      };

  return {
    classAverage: average,
    subjectAverages,
    passCount,
    failCount,
    topStudents,
    studentsNeedingAttention,
    campusSummary,
  };
}

export async function getReportCardPdfPayload(reportCardId: string) {
  const reportCard = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    include: {
      campus: { select: { name: true, city: true, address: true, phone: true, email: true, website: true, principalName: true, board: true, logoUrl: true, school: { select: { name: true, logoUrl: true, phone: true, website: true, tagline: true, contactEmail: true, establishedYear: true } } } },
      exam: {
        select: {
          id: true, title: true, term: true, academicYear: true, examType: true, subjectId: true,
          classId: true,
          class: { select: { id: true, name: true, section: true, academicYear: true } },
        },
      },
      student: {
        include: {
          class: { select: { id: true, name: true, section: true, academicYear: true } },
        },
      },
    },
  });

  if (!reportCard) throw new Error("Report card not found");

  // The exam's class is the historically-correct one for this PDF — a
  // promoted student's *current* class both breaks the weight-config lookup
  // below (wrong classId+academicYear finds no marks) and, uncaught, would
  // print the wrong class on a document families keep as a permanent record.
  if (reportCard.exam.class) {
    reportCard.student.class = reportCard.exam.class;
  }

  const marks = await prisma.mark.findMany({
    where: { examId: reportCard.examId, studentId: reportCard.studentId },
    include: { subject: { select: { name: true, totalMarks: true } } },
    orderBy: { subject: { name: "asc" } },
  });

  let weightConfig: WeightConfig | null = null;
  let subjectDistribution: any[] = [];
  let overall: { overallPercentage: number; overallGrade: string; passed: boolean } | null = null;

  const classId = reportCard.exam.classId;
  if (classId) {
    try {
      weightConfig = await getOrCreateGradeWeightConfig(reportCard.campusId, classId, reportCard.exam.academicYear);
      const grade = await calculateWeightedGrade(reportCard.studentId, reportCard.campusId, classId, reportCard.exam.academicYear);
      overall = {
        overallPercentage: grade.overallPercentage,
        overallGrade: grade.overallGrade,
        passed: grade.passed,
      };
      const isAggregateFinal = reportCard.exam.subjectId === null && reportCard.exam.examType === "FINAL";
      subjectDistribution = await buildSubjectDistribution({
        studentId: reportCard.studentId,
        campusId: reportCard.campusId,
        classId,
        academicYear: reportCard.exam.academicYear,
        weightConfig,
        ...(isAggregateFinal ? { excludeExamId: reportCard.examId } : {}),
      });
    } catch {}
  }

  return {
    reportCard,
    weightConfig,
    subjectDistribution,
    overall,
    marks: marks.map((mark) => ({
      subject: mark.subject.name,
      obtained: mark.marksObtained,
      total: mark.subject.totalMarks,
      isAbsent: mark.isAbsent,
      // An absent paper has no grade. Falling back to grading the stored 0
      // would print "F" against a paper the pupil never sat.
      grade: mark.isAbsent
        ? "ABS"
        : mark.grade || gradeForMark(mark.marksObtained, mark.subject.totalMarks),
    })),
  };
}
