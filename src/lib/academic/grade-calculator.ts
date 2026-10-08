import { prisma, type TxClient } from "@/lib/db/prisma";
import { roundConfigured, type AcademicModelConfiguration, type ResultPolicy, type RoundingRule, thresholdsFromConfiguration } from "@/lib/academic/model-config";

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

export interface GradeThresholds {
  aplus: number;
  a: number;
  b: number;
  c: number;
  d: number;
}

export type WeightMode = "NORMALIZED" | "ABSOLUTE";

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
  missingMarkPolicy?: ResultPolicy;
  absentMarkPolicy?: ResultPolicy;
  exemptMarkPolicy?: ResultPolicy;
  roundingRule?: RoundingRule;
  academicModelVersionId?: string | null;
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

function weightConfigFromAcademicModel(version: { id: string; configuration: unknown }): WeightConfig | null {
  const configuration = version.configuration as AcademicModelConfiguration;
  const grading = configuration?.grading;
  if (!grading) return null;
  return {
    quizWeight: Number(grading.quizWeight),
    classTestWeight: Number(grading.classTestWeight),
    midTermWeight: Number(grading.midTermWeight),
    finalWeight: Number(grading.finalWeight),
    passingPercentage: Number(grading.passingPercentage),
    weightMode: normalizeWeightMode(grading.weightMode),
    thresholds: thresholdsFromConfiguration(configuration),
    missingMarkPolicy: grading.missingPolicy ?? "COUNT_AS_ZERO",
    absentMarkPolicy: grading.absentPolicy ?? "COUNT_AS_ZERO",
    exemptMarkPolicy: grading.exemptPolicy ?? "EXCLUDE",
    roundingRule: grading.roundingRule ?? "WHOLE",
    academicModelVersionId: version.id,
  };
}

export async function getOrCreateGradeWeightConfig(campusId: string, classId: string, academicYear: number, db: TxClient = prisma, academicModelVersionId?: string | null): Promise<WeightConfig> {
  let version = academicModelVersionId
    ? await db.academicModelVersion.findFirst({
        where: { id: academicModelVersionId, campusId, academicYear, status: "ACTIVE" },
        select: { id: true, configuration: true },
      })
    : null;
  if (!academicModelVersionId) {
    const activeVersions = await db.academicModelVersion.findMany({
      where: { campusId, academicYear, status: "ACTIVE" },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: { id: true, configuration: true },
    });
    version = activeVersions.find((candidate) => {
      const configuration = candidate.configuration as unknown as AcademicModelConfiguration;
      return configuration.classIds?.includes(classId);
    }) ?? null;
  }
  if (version) {
    const modelConfig = weightConfigFromAcademicModel(version);
    if (modelConfig) return modelConfig;
  }

  const config = await db.gradeWeightConfig.findUnique({
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
      missingMarkPolicy: (config.missingMarkPolicy as ResultPolicy) ?? "COUNT_AS_ZERO",
      absentMarkPolicy: (config.absentMarkPolicy as ResultPolicy) ?? "COUNT_AS_ZERO",
      exemptMarkPolicy: (config.exemptMarkPolicy as ResultPolicy) ?? "EXCLUDE",
      roundingRule: (config.roundingRule as RoundingRule) ?? "WHOLE",
      academicModelVersionId: config.academicModelVersionId,
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
    weightMode: "NORMALIZED",
    thresholds: { aplus: 90, a: 80, b: 70, c: 60, d: 50 },
    missingMarkPolicy: "COUNT_AS_ZERO",
    absentMarkPolicy: "COUNT_AS_ZERO",
    exemptMarkPolicy: "EXCLUDE",
    roundingRule: "WHOLE",
    academicModelVersionId: null,
  };
}

/**
 * Turn per-exam results into the overall percentage.
 *
 * Two things were wrong with summing `contribution` directly:
 *
 *  1. The sum was never divided by the weight actually in play, so a class that
 *     had only sat its mid-term (weight 30) capped every student at 30%. Full
 *     marks read as a fail.
 *  2. Weight was applied per *exam* rather than per exam *type*, so three
 *     quizzes contributed 3 x 10 = 30 instead of the 10 the school configured.
 *
 * NORMALIZED fixes both: average within a type, weight the type once, and
 * rescale by the weight of the types that actually happened. ABSOLUTE keeps the
 * old arithmetic for schools that report cumulative year-to-date progress.
 */
export function overallFromExamResults(
  examResults: WeightedExamResult[],
  config: WeightConfig,
): number {
  if (config.weightMode === "ABSOLUTE") {
    const totalWeight = examResults.reduce((sum, r) => sum + r.weight, 0);
    if (totalWeight <= 0) return 0;
    return roundConfigured(examResults.reduce((sum, r) => sum + r.contribution, 0), config.roundingRule ?? "WHOLE");
  }

  // Average each exam type, then weight the type once.
  const byType = new Map<string, { weight: number; percentages: number[] }>();
  for (const r of examResults) {
    if (r.weight <= 0) continue;
    const bucket = byType.get(r.examType) ?? { weight: r.weight, percentages: [] };
    bucket.percentages.push(r.percentage);
    byType.set(r.examType, bucket);
  }

  let weightHeld = 0;
  let earned = 0;
  for (const { weight, percentages } of byType.values()) {
    const avg = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;
    weightHeld += weight;
    earned += (avg * weight) / 100;
  }

  if (weightHeld <= 0) return 0;
  // Rescale the weight that actually happened back up to 100.
  return roundConfigured((earned / weightHeld) * 100, config.roundingRule ?? "WHOLE");
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
  academicYear: number,
  db: TxClient = prisma,
  academicModelVersionId?: string | null,
): Promise<WeightedGradeResult> {
  const [student, config] = await Promise.all([
    db.student.findUnique({
      where: { id: studentId },
      select: { id: true, fullName: true, classId: true },
    }),
    getOrCreateGradeWeightConfig(campusId, classId, academicYear, db, academicModelVersionId),
  ]);

  if (!student) throw new Error("Student not found");

  const subjects = await db.subject.findMany({
    where: { classId, campusId },
      select: { id: true, name: true, totalMarks: true },
    orderBy: { name: "asc" },
  });

  const exams = await db.exam.findMany({
    where: { classId, campusId, academicYear, status: { notIn: ["DRAFT", "ACTIVE"] } },
    select: { id: true, title: true, examType: true, totalMarks: true, subjectId: true },
    orderBy: [{ examType: "asc" }, { title: "asc" }],
  });

  const examIds = exams.map((e) => e.id);
  const subjectIds = subjects.map((s) => s.id);

  const marks = await db.mark.findMany({
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
    let totalMarks = 0;
    let obtainedMarks = 0;
    for (const subject of relevantSubjects) {
      const mark = examMarks.find((row) => row.subjectId === subject.id);
      const policy = !mark
        ? config.missingMarkPolicy ?? "COUNT_AS_ZERO"
        : mark.isAbsent
          ? config.absentMarkPolicy ?? "COUNT_AS_ZERO"
          : mark.isExempt
            ? config.exemptMarkPolicy ?? "EXCLUDE"
            : "COUNT_AS_ZERO";
      if (policy === "BLOCK") throw new Error(`${subject.name} has ${!mark ? "a missing mark" : mark.isAbsent ? "an absent result" : "an exempt result"}; this academic model blocks calculation until it is resolved.`);
      if (policy === "EXCLUDE") continue;
      totalMarks += subject.totalMarks;
      if (mark && !mark.isAbsent && !mark.isExempt) obtainedMarks += mark.marksObtained;
    }
    const percentage = totalMarks > 0 ? roundConfigured((obtainedMarks / totalMarks) * 100, config.roundingRule ?? "WHOLE") : 0;
    const examType = (exam.examType as ExamType) || "CLASS_TEST";
    const weight = totalMarks > 0 ? getWeightForExamType(exam.examType, config) : 0;

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

  const overallPercentage = overallFromExamResults(examResults, config);

  const subjectBreakdown: SubjectBreakdown[] = subjects.map((subject) => {
    let obtainedMarks = 0;
    let totalMarks = 0;
    for (const exam of exams.filter((row) => !row.subjectId || row.subjectId === subject.id)) {
      const mark = marks.find((row) => row.examId === exam.id && row.subjectId === subject.id);
      const policy = !mark
        ? config.missingMarkPolicy ?? "COUNT_AS_ZERO"
        : mark.isAbsent
          ? config.absentMarkPolicy ?? "COUNT_AS_ZERO"
          : mark.isExempt
            ? config.exemptMarkPolicy ?? "EXCLUDE"
            : "COUNT_AS_ZERO";
      if (policy === "EXCLUDE") continue;
      if (policy === "BLOCK") throw new Error(`${subject.name} has an unresolved ${!mark ? "missing mark" : mark.isAbsent ? "absence" : "exemption"}; this academic model blocks calculation.`);
      totalMarks += subject.totalMarks;
      if (mark && !mark.isAbsent && !mark.isExempt) obtainedMarks += mark.marksObtained;
    }
    const percentage = totalMarks > 0 ? roundConfigured((obtainedMarks / totalMarks) * 100, config.roundingRule ?? "WHOLE") : 0;
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
}, db: TxClient = prisma) {
  const subjects = await db.subject.findMany({
    where: { classId: opts.classId, campusId: opts.campusId },
    select: { id: true, name: true, totalMarks: true },
    orderBy: { name: "asc" },
  });
  const exams = await db.exam.findMany({
    where: {
      classId: opts.classId,
      campusId: opts.campusId,
      academicYear: opts.academicYear,
      status: { notIn: ["DRAFT", "ACTIVE"] },
    },
    select: { id: true, title: true, examType: true, subjectId: true },
    orderBy: [{ examType: "asc" }, { title: "asc" }],
  });
  const marks = await db.mark.findMany({
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
        const mark = subjectMarks.find((row) => row.examId === exam.id);
        const policy = !mark
          ? opts.weightConfig.missingMarkPolicy ?? "COUNT_AS_ZERO"
          : mark.isAbsent
            ? opts.weightConfig.absentMarkPolicy ?? "COUNT_AS_ZERO"
            : mark.isExempt
              ? opts.weightConfig.exemptMarkPolicy ?? "EXCLUDE"
              : "COUNT_AS_ZERO";
        if (policy === "BLOCK") throw new Error(`${subject.name} has an unresolved ${!mark ? "missing mark" : mark.isAbsent ? "absence" : "exemption"}; this academic model blocks calculation.`);
        const totalMarks = policy === "EXCLUDE" ? 0 : subject.totalMarks;
        const obtainedMarks = mark && !mark.isAbsent && !mark.isExempt && policy !== "EXCLUDE" ? mark.marksObtained : 0;
        const percentage = totalMarks > 0 ? roundConfigured((obtainedMarks / totalMarks) * 100, opts.weightConfig.roundingRule ?? "WHOLE") : 0;
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
      .filter((row) => row.weight > 0 && row.totalMarks > 0);
    const totalTotal = examRows.reduce((sum, row) => sum + row.totalMarks, 0);
    const obtainedTotal = examRows.reduce((sum, row) => sum + row.obtainedMarks, 0);
    const percentage = totalTotal > 0 ? roundConfigured((obtainedTotal / totalTotal) * 100, opts.weightConfig.roundingRule ?? "WHOLE") : 0;
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
