import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ACADEMIC_MODEL,
  simulateAcademicResult,
  validateAcademicModel,
} from "../../src/lib/academic/model-config";
import { overallFromExamResults, type WeightConfig } from "../../src/lib/academic/grade-calculator";
import { translateUi } from "../../src/lib/locale/ui-messages";

const configuration = () => structuredClone(DEFAULT_ACADEMIC_MODEL);

test("validates grading weights, descending boundaries, periods, and complete subject mappings", () => {
  const model = configuration();
  model.classIds = ["class-a"];
  model.subjectMappings = [{ code: "math", label: "Mathematics", subjectIds: ["subject-a"] }];
  model.terms = [
    { id: "t1", label: "Term 1", startDate: "2026-01-01", endDate: "2026-06-30", teachingWeeks: 20, reportingPeriod: true },
    { id: "t2", label: "Term 2", startDate: "2026-06-30", endDate: "2026-12-31", teachingWeeks: 20, reportingPeriod: true },
  ];
  const problems = validateAcademicModel(model, {
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", selectedClassIds: ["class-a"],
    actualSubjects: [{ classId: "class-a", subjectId: "subject-a" }],
  });
  assert.equal(problems.some((problem) => problem.code === "period_conflict"), true);
  assert.equal(problems.some((problem) => problem.code === "weight_total"), false);
  assert.equal(problems.some((problem) => problem.code === "subject_mapping_incomplete"), false);
});

test("templates allow reusable periods without dates while preserving other validation", () => {
  const model = configuration();
  assert.deepEqual(validateAcademicModel(model, { effectiveFrom: "2000-01-01", template: true }), []);
});

test("simulates missing, absent, and exempt policies with normalized weights and configured rounding", () => {
  const model = configuration();
  model.grading.roundingRule = "ONE_DECIMAL";
  model.grading.missingPolicy = "COUNT_AS_ZERO";
  model.grading.absentPolicy = "EXCLUDE";
  model.grading.exemptPolicy = "EXCLUDE";
  const result = simulateAcademicResult(model, [
    { label: "Quiz", score: 82.5, total: 100, status: "SCORED", weight: 10 },
    { label: "Class test", score: null, total: 100, status: "MISSING", weight: 20 },
    { label: "Mid-term", score: null, total: 100, status: "ABSENT", weight: 30 },
    { label: "Final", score: null, total: 100, status: "EXEMPT", weight: 40 },
  ]);
  assert.equal(result.blocked, false);
  assert.equal(result.heldWeight, 30);
  assert.equal(result.overallPercentage, 27.5);
  assert.equal(result.overallGrade, "F");
  assert.match(result.components[2].message, /excluded from the denominator/);
});

test("a BLOCK policy stops progression and identifies the unresolved component", () => {
  const model = configuration();
  model.grading.absentPolicy = "BLOCK";
  const result = simulateAcademicResult(model, [
    { label: "Quiz", score: null, total: 100, status: "ABSENT", weight: 10 },
  ]);
  assert.equal(result.blocked, true);
  assert.equal(result.passed, false);
  assert.match(result.components[0].message, /blocks the result/);
});

test("weighted grade aggregation keeps the configured precision and drops fully excluded components", () => {
  const config: WeightConfig = {
    quizWeight: 10, classTestWeight: 20, midTermWeight: 30, finalWeight: 40,
    passingPercentage: 50, weightMode: "NORMALIZED", thresholds: { aplus: 90, a: 80, b: 70, c: 60, d: 50 },
    roundingRule: "ONE_DECIMAL",
  };
  assert.equal(overallFromExamResults([{ examId: "quiz", examTitle: "Quiz", examType: "QUIZ", weight: 10, percentage: 82.5, grade: "A", obtainedMarks: 82.5, totalMarks: 100, contribution: 8.25 }], config), 82.5);
  assert.equal(overallFromExamResults([{ examId: "quiz", examTitle: "Quiz", examType: "QUIZ", weight: 0, percentage: 0, grade: "F", obtainedMarks: 0, totalMarks: 0, contribution: 0 }], config), 0);
});

test("new curriculum setup copy is translated in Arabic and Urdu", () => {
  for (const language of ["ar", "ur"] as const) {
    assert.notEqual(translateUi("Curriculum, grading & terms", language), "Curriculum, grading & terms");
    assert.notEqual(translateUi("Activation is blocked until every section subject is mapped exactly once. Use Add mapping to repair missing subjects.", language), "Activation is blocked until every section subject is mapped exactly once. Use Add mapping to repair missing subjects.");
  }
});
