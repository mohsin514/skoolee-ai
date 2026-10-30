import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ACADEMIC_MODEL, bandFor, previewRegrade, simulateAcademicResult, thresholdsFromConfiguration, validateAcademicModel } from "../../src/lib/academic/model-config";
import { gradeForPercentage } from "../../src/lib/academic/grade-calculator";
import { gradingModelUiEntries } from "../../src/lib/locale/grading-model-ui-messages";
import { translateUi } from "../../src/lib/locale/ui-messages";

const model = () => structuredClone(DEFAULT_ACADEMIC_MODEL);
const gradingCodes = (configuration = model()) => validateAcademicModel(configuration, { effectiveFrom: "2000-01-01", template: true }).map((problem) => problem.code);

test("the default grading model is valid", () => {
  assert.deepEqual(gradingCodes(), []);
});

test("band boundaries are inclusive at the minimum and exclusive just below it", () => {
  const bands = model().grading.thresholds;
  assert.equal(bandFor(90, bands)?.label, "A+");
  assert.equal(bandFor(89.99, bands)?.label, "A");
  assert.equal(bandFor(50, bands)?.label, "D");
  assert.equal(bandFor(49.9, bands)?.label, "F");
  assert.equal(bandFor(0, bands)?.label, "F");
  assert.equal(bandFor(100, bands)?.label, "A+");
});

test("rejects overlapping, out-of-order, gapped and duplicate bands", () => {
  const overlap = model();
  overlap.grading.thresholds[2].minimum = 80; // B starts where A starts
  assert.ok(gradingCodes(overlap).includes("grade_boundaries"));
  const gap = model();
  gap.grading.thresholds = gap.grading.thresholds.slice(0, -1); // no 0% floor
  assert.ok(gradingCodes(gap).includes("grade_floor"));
  const above = model();
  above.grading.thresholds[0].minimum = 101;
  assert.ok(gradingCodes(above).includes("grade_boundaries"));
  const duplicate = model();
  duplicate.grading.thresholds[1].label = "a+";
  assert.ok(gradingCodes(duplicate).includes("grade_duplicate_label"));
});

test("the pass mark must start a band", () => {
  const conflicting = model();
  conflicting.grading.passingPercentage = 45; // D (50-59) and F (0-49) would mix pass and fail
  assert.ok(gradingCodes(conflicting).includes("pass_band_conflict"));
  conflicting.grading.passingPercentage = 60;
  assert.ok(!gradingCodes(conflicting).includes("pass_band_conflict"));
});

test("GPA points are all-or-none and never rise down the bands", () => {
  const gpa = model();
  gpa.grading.thresholds = gpa.grading.thresholds.map((band, index) => ({ ...band, points: [4, 4, 3, 2, 1, 0][index] }));
  assert.deepEqual(gradingCodes(gpa), []);
  const partial = structuredClone(gpa);
  delete partial.grading.thresholds[3].points;
  assert.ok(gradingCodes(partial).includes("gpa_points"));
  const rising = structuredClone(gpa);
  rising.grading.thresholds[4].points = 2.5;
  assert.ok(gradingCodes(rising).includes("gpa_points"));
  const result = simulateAcademicResult(gpa, [{ label: "Final", score: 72, total: 100, status: "SCORED", weight: 100 }]);
  assert.equal(result.overallGrade, "B");
  assert.equal(result.gradePoints, 3);
});

test("custom bands reach the shared grade calculator", () => {
  const custom = model();
  custom.grading.thresholds = [{ label: "Distinction", minimum: 85 }, { label: "Merit", minimum: 65 }, { label: "Pass", minimum: 40 }, { label: "E", minimum: 30 }, { label: "U", minimum: 0 }];
  custom.grading.passingPercentage = 40;
  assert.deepEqual(gradingCodes(custom), []);
  const thresholds = thresholdsFromConfiguration(custom);
  assert.equal(gradeForPercentage(86, thresholds), "Distinction");
  assert.equal(gradeForPercentage(35, thresholds), "E");
  assert.equal(gradeForPercentage(10, thresholds), "U");
  // Legacy class weights without bands keep the five fixed columns.
  assert.equal(gradeForPercentage(85, { aplus: 90, a: 80, b: 70, c: 60, d: 50 }), "A");
});

test("rounding applies before banding, so 89.5 is an A+ with whole-number rounding only", () => {
  const whole = model();
  const scored = [{ label: "Final", score: 89.5, total: 100, status: "SCORED" as const, weight: 100 }];
  assert.equal(simulateAcademicResult(whole, scored).overallGrade, "A+");
  whole.grading.roundingRule = "ONE_DECIMAL";
  assert.equal(simulateAcademicResult(whole, scored).overallGrade, "A");
});

test("the re-grade preview counts letter changes, pass flips and published marks", () => {
  const before = model().grading;
  const after = model().grading;
  after.thresholds = after.thresholds.map((band) => band.label === "D" ? { ...band, minimum: 55 } : band);
  after.passingPercentage = 55;
  const marks = [
    { percentage: 52, grade: "D", published: true }, // D → F and pass → fail
    { percentage: 57, grade: "D", published: false }, // stays D, still passes
    { percentage: 95, grade: "A+", published: true },
  ];
  const impact = previewRegrade(marks, before, after);
  assert.equal(impact.evaluated, 3);
  assert.equal(impact.gradeChanges, 1);
  assert.equal(impact.passFlips, 1);
  assert.equal(impact.publishedChanges, 1);
  assert.deepEqual(impact.topMoves, [{ change: "D → F", count: 1 }]);
  // With no earlier version the stored mark grade is the baseline and pass flips are unknown.
  const first = previewRegrade([{ percentage: 52, grade: "B", published: false }], null, after);
  assert.equal(first.gradeChanges, 1);
  assert.equal(first.passFlips, 0);
  assert.equal(previewRegrade([], before, after).evaluated, 0);
});

test("grading model copy has Arabic and Urdu translations", () => {
  for (const [english] of gradingModelUiEntries) {
    for (const language of ["ar", "ur"] as const) assert.notEqual(translateUi(english, language), english, `${language}: ${english}`);
  }
});
