import { prisma } from "@/lib/db/prisma";

export type ExamType = "QUIZ" | "CLASS_TEST" | "MID_TERM" | "FINAL" | "CUSTOM";

export const EXAM_TYPES: ExamType[] = ["QUIZ", "CLASS_TEST", "MID_TERM", "FINAL", "CUSTOM"];

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  QUIZ: "Quiz",
  CLASS_TEST: "Class Test",
  MID_TERM: "Mid Term",
  FINAL: "Final Exam",
  CUSTOM: "Custom",
};

export function gradeForPercentage(percentage: number, thresholds?: GradeThresholds) {
  const t = thresholds || { aplus: 90, a: 80, b: 70, c: 60, d: 50 };
  if (percentage >= t.aplus) return "A+";
  if (percentage >= t.a) return "A";
  if (percentage >= t.b) return "B";
  if (percentage >= t.c) return "C";
  if (percentage >= t.d) return "D";
  return "F";
}

export function gradeForMark(obtained: number, total: number, thresholds?: GradeThresholds) {
  return gradeForPercentage(total > 0 ? (obtained / total) * 100 : 0, thresholds);
}

export function gradeToNumeric(grade: string): number {
  const map: Record<string, number> = { "A+": 4.0, A: 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0 };
  return map[grade] ?? 0;
}

export interface GradeThresholds {
  aplus: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export type WeightMode = "NORMALIZED" | "ABSOLUTE";

export const WEIGHT_MODES: WeightMode[] = ["NORMALIZED", "ABSOLUTE"];

export const WEIGHT_MODE_LABELS: Record<WeightMode, string> = {
  NORMALIZED: "Rescale to exams held",
  ABSOLUTE: "Score against the full year",
};

export const WEIGHT_MODE_HELP: Record<WeightMode, string> = {
  NORMALIZED:
    "Averages repeated exams of the same type, then rescales the weights of the exam types that have actually happened to 100. A student who scores full marks in the only exam so far shows 100%.",
  ABSOLUTE:
    "Every exam scores against the full 100-point year. Exam types that have not happened yet count as zero, so percentages stay low until the year is complete.",
};

export function normalizeWeightMode(mode: unknown): WeightMode {
  return mode === "ABSOLUTE" ? "ABSOLUTE" : "NORMALIZED";
}

export interface WeightConfig {
  quizWeight: number;
  classTestWeight: number;
  midTermWeight: number;
  finalWeight: number;
  passingPercentage: number;
  weightMode: WeightMode;
  thresholds: GradeThresholds;
}

export interface WeightedExamResult {
  examId: string;
  examTitle: string;
  examType: ExamType;
  weight: number;
  percentage: number;
  grade: string;
  obtainedMarks: number;
  totalMarks: number;
  contribution: number;
}

export interface WeightedGradeResult {
  studentId: string;
  studentName: string;
  overallPercentage: number;
  overallGrade: string;
  passed: boolean;
  examResults: WeightedExamResult[];
  subjectBreakdown: SubjectBreakdown[];
}

export interface SubjectBreakdown {
  subjectId: string;
  subjectName: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  grade: string;
}

export async function getOrCreateGradeWeightConfig(campusId: string, classId: string, academicYear: number): Promise<WeightConfig> {
  const config = await prisma.gradeWeightConfig.findUnique({
    where: { classId_academicYear: { classId, academicYear } },
  });
  if (config) {
    return {
      quizWeight: config.quizWeight,
      classTestWeight: config.classTestWeight,
      midTermWeight: config.midTermWeight,
      finalWeight: config.finalWeight,
      passingPercentage: config.passingPercentage,
      weightMode: normalizeWeightMode(config.weightMode),
      thresholds: {
        aplus: config.gradeAplus,
        a: config.gradeA,
        b: config.gradeB,
        c: config.gradeC,
        d: config.gradeD,
      },
    };
  }
  return defaultWeightConfig();
}

export function defaultWeightConfig(): WeightConfig {
  return {
    quizWeight: 10,
    classTestWeight: 20,
    midTermWeight: 30,
    finalWeight: 40,
    passingPercentage: 50,
    thresholds: { aplus: 90, a: 80, b: 70, c: 60, d: 50 },
  };
}

function getWeightForExamType(examType: string, config: WeightConfig): number {
  switch (examType) {
    case "QUIZ": return config.quizWeight;
    case "CLASS_TEST": return config.classTestWeight;
    case "MID_TERM": return config.midTermWeight;
    case "FINAL": return config.finalWeight;
    default: return 0;
  }
}

export async function calculateWeightedGrade(
  studentId: string,
  campusId: string,
  classId: string,
  academicYear: number
): Promise<WeightedGradeResult> {
  const [student, config] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, fullName: true, classId: true },
    }),
    getOrCreateGradeWeightConfig(campusId, classId, academicYear),
  ]);

  if (!student) throw new Error("Student not found");

  const subjects = await prisma.subject.findMany({
    where: { classId, campusId },
    select: { id: true, name: true, totalMarks: true },
    orderBy: { name: "asc" },
  });

  const exams = await prisma.exam.findMany({
    where: { classId, campusId, academicYear, status: { notIn: ["DRAFT", "ACTIVE"] } },
    select: { id: true, title: true, examType: true, totalMarks: true, subjectId: true },
    orderBy: [{ examType: "asc" }, { title: "asc" }],
  });

  const examIds = exams.map((e) => e.id);
  const subjectIds = subjects.map((s) => s.id);

  const marks = await prisma.mark.findMany({
    where: { studentId, examId: { in: examIds }, subjectId: { in: subjectIds } },
    include: { subject: { select: { id: true, name: true, totalMarks: true } } },
  });

  const marksByExam = new Map<string, typeof marks>();
  for (const mark of marks) {
    if (!marksByExam.has(mark.examId)) marksByExam.set(mark.examId, []);
    marksByExam.get(mark.examId)!.push(mark);
  }

  const examResults: WeightedExamResult[] = exams.map((exam) => {
    const examMarks = marksByExam.get(exam.id) || [];
    // If exam targets a single subject, only count that subject's marks
    const relevantSubjects = exam.subjectId
      ? subjects.filter((s) => s.id === exam.subjectId)
      : subjects;
    const totalMarks = relevantSubjects.reduce((sum, s) => sum + s.totalMarks, 0);
    const obtainedMarks = relevantSubjects.reduce((sum, s) => {
      const mark = examMarks.find((m) => m.subjectId === s.id);
      return sum + (mark?.marksObtained || 0);
    }, 0);
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
    const examType = (exam.examType as ExamType) || "CLASS_TEST";
    const weight = getWeightForExamType(exam.examType, config);

    return {
      examId: exam.id,
      examTitle: exam.title,
      examType,
      weight,
      percentage,
      grade: gradeForPercentage(percentage, config.thresholds),
      obtainedMarks,
      totalMarks,
      contribution: (percentage * weight) / 100,
    };
  });

  const totalWeight = examResults.reduce((sum, r) => sum + r.weight, 0);
  const overallPercentage = totalWeight > 0
    ? Math.round(examResults.reduce((sum, r) => sum + r.contribution, 0))
    : 0;

  const subjectBreakdown: SubjectBreakdown[] = subjects.map((subject) => {
    const subjectMarks = marks.filter((m) => m.subjectId === subject.id);
    const obtainedMarks = subjectMarks.reduce((sum, m) => sum + m.marksObtained, 0);
    const totalMarks = subjectMarks.reduce((sum, m) => sum + (m.subject?.totalMarks || subject.totalMarks), 0) || subject.totalMarks;
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      totalMarks,
      obtainedMarks,
      percentage,
      grade: gradeForPercentage(percentage, config.thresholds),
    };
  });

  return {
    studentId: student.id,
    studentName: student.fullName,
    overallPercentage,
    overallGrade: gradeForPercentage(overallPercentage, config.thresholds),
    passed: overallPercentage >= config.passingPercentage,
    examResults,
    subjectBreakdown,
  };
}

export async function calculateWeightedGradeForClass(
  classId: string,
  campusId: string,
  academicYear: number
) {
  const students = await prisma.student.findMany({
    where: { classId, campusId },
    select: { id: true, fullName: true, rollNo: true },
    orderBy: { rollNo: "asc" },
  });

  const results = await Promise.all(
    students.map((student) =>
      calculateWeightedGrade(student.id, campusId, classId, academicYear)
        .catch(() => null)
    )
  );

  const validResults = results.filter((r): r is WeightedGradeResult => r !== null);

  const sorted = [...validResults].sort((a, b) => b.overallPercentage - a.overallPercentage);
  let lastPct: number | null = null;
  let lastRank = 0;
  const ranked = sorted.map((r, i) => {
    if (lastPct === null || r.overallPercentage !== lastPct) {
      lastRank = i + 1;
      lastPct = r.overallPercentage;
    }
    return { ...r, rank: lastRank };
  });

  return ranked;
}

export function weightForExamType(examType: string, config: WeightConfig): number {
  switch (examType) {
    case "QUIZ": return config.quizWeight;
    case "CLASS_TEST": return config.classTestWeight;
    case "MID_TERM": return config.midTermWeight;
    case "FINAL": return config.finalWeight;
    default: return 0;
  }
}

export async function buildSubjectDistribution(opts: {
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
