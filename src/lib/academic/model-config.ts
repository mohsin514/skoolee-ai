import type { GradeThresholds } from "@/lib/academic/grade-calculator";
import { z } from "zod";

export type ResultPolicy = "COUNT_AS_ZERO" | "EXCLUDE" | "BLOCK";
export type RoundingRule = "WHOLE" | "ONE_DECIMAL" | "TWO_DECIMALS";

export interface AcademicModelConfiguration {
  classIds: string[];
  subjectMappings: Array<{
    code: string;
    label: string;
    subjectIds: string[];
  }>;
  terms: Array<{
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    teachingWeeks: number;
    reportingPeriod: boolean;
  }>;
  grading: {
    quizWeight: number;
    classTestWeight: number;
    midTermWeight: number;
    finalWeight: number;
    passingPercentage: number;
    weightMode: "NORMALIZED" | "ABSOLUTE";
    thresholds: Array<{ label: string; minimum: number }>;
    missingPolicy: ResultPolicy;
    absentPolicy: ResultPolicy;
    exemptPolicy: ResultPolicy;
    roundingRule: RoundingRule;
  };
  progression: {
    passPercentage: number;
    attendanceMinimum: number;
    conditionalPromotion: boolean;
  };
  report: {
    showComponentBreakdown: boolean;
    showAttendance: boolean;
    showRank: boolean;
  };
}

export interface ConfigProblem {
  code: string;
  message: string;
  repairHref: string;
}

export const academicModelConfigurationSchema = z.object({
  classIds: z.array(z.string().min(1)).default([]),
  subjectMappings: z.array(z.object({ code: z.string().min(1), label: z.string().min(1), subjectIds: z.array(z.string().min(1)) })),
  terms: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), startDate: z.string(), endDate: z.string(), teachingWeeks: z.number().int(), reportingPeriod: z.boolean() })),
  grading: z.object({
    quizWeight: z.number(), classTestWeight: z.number(), midTermWeight: z.number(), finalWeight: z.number(),
    passingPercentage: z.number(), weightMode: z.enum(["NORMALIZED", "ABSOLUTE"]),
    thresholds: z.array(z.object({ label: z.string(), minimum: z.number() })),
    missingPolicy: z.enum(["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"]),
    absentPolicy: z.enum(["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"]),
    exemptPolicy: z.enum(["COUNT_AS_ZERO", "EXCLUDE", "BLOCK"]),
    roundingRule: z.enum(["WHOLE", "ONE_DECIMAL", "TWO_DECIMALS"]),
  }),
  progression: z.object({ passPercentage: z.number(), attendanceMinimum: z.number(), conditionalPromotion: z.boolean() }),
  report: z.object({ showComponentBreakdown: z.boolean(), showAttendance: z.boolean(), showRank: z.boolean() }),
});

export const DEFAULT_ACADEMIC_MODEL: AcademicModelConfiguration = {
  classIds: [],
  subjectMappings: [],
  terms: [
    { id: "term-1", label: "Term 1", startDate: "", endDate: "", teachingWeeks: 16, reportingPeriod: true },
    { id: "term-2", label: "Term 2", startDate: "", endDate: "", teachingWeeks: 16, reportingPeriod: true },
  ],
  grading: {
    quizWeight: 10,
    classTestWeight: 20,
    midTermWeight: 30,
    finalWeight: 40,
    passingPercentage: 50,
    weightMode: "NORMALIZED",
    thresholds: [
      { label: "A+", minimum: 90 }, { label: "A", minimum: 80 },
      { label: "B", minimum: 70 }, { label: "C", minimum: 60 },
      { label: "D", minimum: 50 }, { label: "F", minimum: 0 },
    ],
    missingPolicy: "COUNT_AS_ZERO",
    absentPolicy: "COUNT_AS_ZERO",
    exemptPolicy: "EXCLUDE",
    roundingRule: "WHOLE",
  },
  progression: { passPercentage: 50, attendanceMinimum: 75, conditionalPromotion: false },
  report: { showComponentBreakdown: true, showAttendance: true, showRank: false },
};

export function roundConfigured(value: number, rule: RoundingRule): number {
  const places = rule === "TWO_DECIMALS" ? 2 : rule === "ONE_DECIMAL" ? 1 : 0;
  const factor = 10 ** places;
  const scaled = value * factor;
  return Math.floor(scaled + 0.5 + Number.EPSILON * Math.abs(scaled)) / factor;
}

export function thresholdsFromConfiguration(configuration: AcademicModelConfiguration): GradeThresholds {
  const byLabel = new Map(configuration.grading.thresholds.map((item) => [item.label.toUpperCase(), item.minimum]));
  return {
    aplus: byLabel.get("A+") ?? 90,
    a: byLabel.get("A") ?? 80,
    b: byLabel.get("B") ?? 70,
    c: byLabel.get("C") ?? 60,
    d: byLabel.get("D") ?? 50,
  };
}

function gradeAt(percentage: number, thresholds: GradeThresholds) {
  if (percentage >= thresholds.aplus) return "A+";
  if (percentage >= thresholds.a) return "A";
  if (percentage >= thresholds.b) return "B";
  if (percentage >= thresholds.c) return "C";
  if (percentage >= thresholds.d) return "D";
  return "F";
}

export function validateAcademicModel(
  configuration: AcademicModelConfiguration,
  options: {
    effectiveFrom: string;
    effectiveTo?: string | null;
    selectedClassIds?: string[];
    actualSubjects?: Array<{ classId: string; subjectId: string }>;
    template?: boolean;
  },
): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const fail = (code: string, message: string, repairHref = "#academic-model-subject-mapping") =>
    problems.push({ code, message, repairHref });
  const weights = [configuration.grading.quizWeight, configuration.grading.classTestWeight, configuration.grading.midTermWeight, configuration.grading.finalWeight];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) {
    fail("invalid_weight", "Each assessment weight must be between 0 and 100%.", "#academic-model-grading");
  } else if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 100) > 0.001) {
    fail("weight_total", `Assessment weights total ${weights.reduce((sum, weight) => sum + weight, 0)}%. Adjust them to total 100%.`, "#academic-model-grading");
  }
  const thresholds = configuration.grading.thresholds;
  if (!thresholds.length || thresholds[thresholds.length - 1]?.minimum !== 0) {
    fail("grade_floor", "Add a final grade boundary at 0%.", "#academic-model-grading");
  }
  for (let index = 0; index < thresholds.length; index += 1) {
    const current = thresholds[index];
    const previous = thresholds[index - 1];
    if (!current.label.trim() || !Number.isFinite(current.minimum) || current.minimum < 0 || current.minimum > 100 || (previous && current.minimum >= previous.minimum)) {
      fail("grade_boundaries", "Grade boundaries must descend from 100% to 0%, with no duplicate or out-of-range value.", "#academic-model-grading");
      break;
    }
  }
  if (configuration.grading.passingPercentage < 0 || configuration.grading.passingPercentage > 100) {
    fail("pass_boundary", "The passing percentage must be between 0 and 100.", "#academic-model-grading");
  }
  if (configuration.progression.passPercentage < 0 || configuration.progression.passPercentage > 100 || configuration.progression.attendanceMinimum < 0 || configuration.progression.attendanceMinimum > 100) {
    fail("progression_boundary", "Progression thresholds must be between 0 and 100%.", "#academic-model-progression");
  }
  const from = Date.parse(`${options.effectiveFrom}T00:00:00Z`);
  const to = options.effectiveTo ? Date.parse(`${options.effectiveTo}T00:00:00Z`) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(from) || to < from) fail("effective_dates", "The effective end date must be the same as or after its start date.", "#academic-model-periods");
  const terms = [...configuration.terms].sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (!terms.length) fail("period_required", "Add at least one reporting period.", "#academic-model-periods");
  const labels = new Set<string>();
  for (let index = 0; index < terms.length; index += 1) {
    const term = terms[index];
    const start = Date.parse(`${term.startDate}T00:00:00Z`);
    const end = Date.parse(`${term.endDate}T00:00:00Z`);
    const templateDatesMissing = options.template && !term.startDate && !term.endDate;
    if (!term.label.trim() || labels.has(term.label.trim().toLocaleLowerCase()) || (!templateDatesMissing && (!Number.isFinite(start) || !Number.isFinite(end) || end < start)) || !Number.isInteger(term.teachingWeeks) || term.teachingWeeks < 1 || term.teachingWeeks > 52) {
      fail("period_invalid", `Review the name, dates and teaching weeks for ${term.label || `period ${index + 1}`}.`, "#academic-model-periods");
      continue;
    }
    labels.add(term.label.trim().toLocaleLowerCase());
    if (!templateDatesMissing && (start < from || end > to)) fail("period_outside_effective", `${term.label} falls outside this version's effective dates.`, "#academic-model-periods");
    const previous = terms[index - 1];
    if (previous && term.startDate && previous.endDate && Date.parse(`${term.startDate}T00:00:00Z`) <= Date.parse(`${previous.endDate}T00:00:00Z`)) {
      fail("period_conflict", `${term.label} overlaps ${previous.label}. Change one period's dates before activation.`, "#academic-model-periods");
    }
  }
  if (!options.template) {
    const selected = options.selectedClassIds ?? configuration.classIds;
    if (!selected.length) fail("cohort_required", "Choose at least one class section for this version.", "#academic-model-cohort");
    const mapped = configuration.subjectMappings.flatMap((mapping) => mapping.subjectIds);
    const duplicates = mapped.filter((id, index) => mapped.indexOf(id) !== index);
    if (duplicates.length) fail("duplicate_subject_mapping", "A class subject can only map to one curriculum subject.", "#academic-model-subject-mapping");
    const expected = options.actualSubjects ?? [];
    const expectedIds = new Set(expected.filter((subject) => selected.includes(subject.classId)).map((subject) => subject.subjectId));
    const mappedIds = new Set(mapped);
    const missing = [...expectedIds].filter((id) => !mappedIds.has(id));
    const outside = [...mappedIds].filter((id) => !expectedIds.has(id));
    if (missing.length || outside.length) fail("subject_mapping_incomplete", `Map every selected class subject exactly once; ${missing.length} still need a curriculum match${outside.length === 1 ? "" : "es"}.`, "#academic-model-subject-mapping");
  }
  return problems;
}

export type SimulatedComponent = { label: string; score: number | null; total: number; status: "SCORED" | "MISSING" | "ABSENT" | "EXEMPT"; weight: number };
export function simulateAcademicResult(configuration: AcademicModelConfiguration, components: SimulatedComponent[]) {
  let heldWeight = 0;
  let earned = 0;
  const explained = components.map((component) => {
    const policy = component.status === "MISSING" ? configuration.grading.missingPolicy : component.status === "ABSENT" ? configuration.grading.absentPolicy : component.status === "EXEMPT" ? configuration.grading.exemptPolicy : "COUNT_AS_ZERO";
    if (component.status === "SCORED" && (component.score === null || !Number.isFinite(component.score) || component.score < 0 || component.score > component.total || component.total <= 0)) {
      return { ...component, contribution: 0, message: `${component.label} needs a valid score from 0 to ${component.total}.`, blocked: true };
    }
    if (policy === "BLOCK") return { ...component, contribution: 0, message: `${component.label} is ${component.status.toLowerCase()} and this configuration blocks the result.`, blocked: true };
    if (policy === "EXCLUDE") return { ...component, contribution: 0, message: `${component.label} is ${component.status.toLowerCase()} and is excluded from the denominator.`, blocked: false };
    heldWeight += component.weight;
    const percentage = component.status === "SCORED" ? ((component.score ?? 0) / component.total) * 100 : 0;
    const contribution = percentage * component.weight / 100;
    earned += contribution;
    return { ...component, contribution, message: component.status === "SCORED" ? `${percentage}% × ${component.weight}% weight = ${contribution.toFixed(2)} points.` : `${component.status === "MISSING" ? "Missing" : "Absent"} counts as zero across ${component.weight}% of the result.`, blocked: false };
  });
  const blocked = explained.some((component) => component.blocked);
  const raw = heldWeight ? earned / heldWeight * 100 : 0;
  const overallPercentage = roundConfigured(raw, configuration.grading.roundingRule);
  return {
    blocked,
    components: explained,
    heldWeight,
    overallPercentage,
    overallGrade: gradeAt(overallPercentage, thresholdsFromConfiguration(configuration)),
    passed: !blocked && overallPercentage >= configuration.grading.passingPercentage,
  };
}

export function changedConfigurationSections(before: unknown, after: unknown): string[] {
  const a = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const b = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  return ["terms", "subjectMappings", "grading", "progression", "report", "classIds"].filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]));
}
