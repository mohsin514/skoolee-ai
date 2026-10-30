import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWeightImpact, validateCategoryWeights, weightTotal, describeWeightProblem } from "../../src/lib/academic/grade-weights";
import { defaultWeightConfig, overallFromExamResults, type WeightedExamResult } from "../../src/lib/academic/grade-calculator";

const weights = (quizWeight: number, classTestWeight: number, midTermWeight: number, finalWeight: number) =>
  ({ quizWeight, classTestWeight, midTermWeight, finalWeight });

test("accepts weights that are each 0–100 and total exactly 100", () => {
  assert.deepEqual(validateCategoryWeights(weights(10, 20, 30, 40)), []);
  assert.deepEqual(validateCategoryWeights(weights(0, 0, 0, 100)), []);
  assert.deepEqual(validateCategoryWeights(weights(33.33, 33.33, 33.34, 0)), []);
});

test("rejects negative weights even when the total is 100", () => {
  const problems = validateCategoryWeights(weights(-10, 20, 50, 40));
  assert.deepEqual(problems, [{ code: "negative", key: "quizWeight" }]);
  assert.equal(describeWeightProblem(problems[0]), "Quiz weight cannot be negative");
});

test("rejects a single weight over 100 and non-numbers", () => {
  assert.deepEqual(validateCategoryWeights(weights(150, -50, 0, 0)).map((p) => p.code), ["over_100", "negative"]);
  assert.deepEqual(validateCategoryWeights({ ...weights(10, 20, 30, 40), finalWeight: Number.NaN }), [{ code: "not_a_number", key: "finalWeight" }]);
  assert.deepEqual(validateCategoryWeights({ ...weights(10, 20, 30, 40), finalWeight: "40" }), [{ code: "not_a_number", key: "finalWeight" }]);
});

test("rejects a total that only rounds to 100 (the old check let 99.6 through)", () => {
  assert.deepEqual(validateCategoryWeights(weights(10, 20, 30, 39.6)), [{ code: "total", total: 99.6 }]);
  assert.deepEqual(validateCategoryWeights(weights(10, 20, 30, 40.4)), [{ code: "total", total: 100.4 }]);
  assert.equal(weightTotal(weights(0.1, 0.2, 49.7, 50)), 100);
});

const exam = (examType: WeightedExamResult["examType"], percentage: number, weight: number): WeightedExamResult => ({
  examId: `${examType}-${percentage}`, examTitle: examType, examType, weight, percentage, grade: "", obtainedMarks: percentage, totalMarks: 100, contribution: (percentage * weight) / 100,
});

test("changing weights changes the computed grade the way the preview reports", () => {
  const results = (cfg: ReturnType<typeof defaultWeightConfig>) => [
    exam("MID_TERM", 40, cfg.midTermWeight), exam("FINAL", 80, cfg.finalWeight),
  ];
  const current = defaultWeightConfig(); // mid 30, final 40
  const heavierMid = { ...current, midTermWeight: 60, finalWeight: 10, quizWeight: 10, classTestWeight: 20 };
  // Normalized: (40*30 + 80*40)/70 = 62.86 → 63 ; (40*60 + 80*10)/70 = 45.71 → 46
  assert.equal(overallFromExamResults(results(current), current), 63);
  assert.equal(overallFromExamResults(results(heavierMid), heavierMid), 46);
  // A type weighted 0 stops counting.
  const finalOnly = { ...current, quizWeight: 0, classTestWeight: 0, midTermWeight: 0, finalWeight: 100 };
  assert.equal(overallFromExamResults(results(finalOnly), finalOnly), 80);
});

test("summarizes the impact of a weight change per student", () => {
  const impact = summarizeWeightImpact(
    [
      { studentId: "a", percentage: 63, grade: "C", passed: true },
      { studentId: "b", percentage: 48, grade: "F", passed: false },
      { studentId: "c", percentage: 90, grade: "A+", passed: true },
      null,
    ],
    [
      { studentId: "a", percentage: 46, grade: "F", passed: false },
      { studentId: "b", percentage: 55, grade: "D", passed: true },
      { studentId: "c", percentage: 90, grade: "A+", passed: true },
      null,
    ],
  );
  assert.deepEqual(impact, { students: 4, changed: 2, gradeChanged: 2, newlyFailing: 1, newlyPassing: 1, largestShift: 17, skipped: 1 });
});
