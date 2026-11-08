// SKAI-1014 [D2-08]: a synthetic cohort through paper → responses → scoring → review → key correction.
// Pure-domain run (no DB). Tenant isolation, release and repair persistence are covered by the
// database suites listed in the PR (exam-release, assessment-repair, exam-incidents, runs-access).
import { test } from "node:test";
import assert from "node:assert/strict";
import { correctedExamPaper, examSaveDecision, objectiveOverrides, scoreObjectiveResponses, validateExamReview, type ExamResponses } from "../../src/lib/school-ai/exam";
import { validatePaperApproval, type PaperData } from "../../src/lib/school-ai/assessment";
import { assessmentFixture } from "./assessment-fixture";

function cohortPaper(): PaperData {
  const { curriculum, paper } = assessmentFixture();
  paper.blueprint.sections = [
    { id: "a", title: "A", type: "SINGLE_CHOICE", questionCount: 1, answerCount: 1, marksPerQuestion: 1.1, outcomeIds: ["outcome-1"] },
    { id: "n", title: "N", type: "NUMERIC", questionCount: 1, answerCount: 1, marksPerQuestion: 1.1, outcomeIds: ["outcome-1"] },
    { id: "b", title: "B", type: "SHORT_TEXT", questionCount: 1, answerCount: 1, marksPerQuestion: 1.1, outcomeIds: ["outcome-1"] },
  ];
  paper.blueprint.totalMarks = 3.3;
  const [choice, , written] = paper.questions;
  paper.questions = [
    { ...choice, id: "q1", sectionId: "a", marks: 1.1, rubric: [{ ...choice.rubric[0], marks: 1.1 }] },
    { ...choice, id: "q2", sectionId: "n", type: "NUMERIC", prompt: "Type the sum of 2 and 2.", marks: 1.1, options: [], correctOptionId: null, numericKey: { value: 4, tolerance: 0 }, rubric: [{ ...choice.rubric[0], marks: 1.1 }] },
    { ...written, id: "q3", sectionId: "b", marks: 1.1, rubric: [{ ...written.rubric[0], marks: 1.1 }] },
  ];
  assert.deepEqual(validatePaperApproval(paper, curriculum), [], "the synthetic paper is a valid approved shape");
  return paper;
}

const cohort: Record<string, ExamResponses> = {
  full: { q1: "a1", q2: "4", q3: "Combine the quantities and count the total." },
  wrongKeyVictim: { q1: "a2", q2: "4", q3: "Count both groups." },
  blank: {},
};

test("known answers score exactly; written answers stay proposals until a human reviews them", () => {
  const paper = cohortPaper();
  const full = scoreObjectiveResponses(paper, cohort.full);
  assert.deepEqual(full.questions.map(row => [row.questionId, row.marks, row.state]), [["q1", 1.1, "OBJECTIVE"], ["q2", 1.1, "OBJECTIVE"], ["q3", null, "NEEDS_REVIEW"]]);
  assert.equal(full.pendingReviewCount, 1, "AI/auto scoring never finalises a written answer");
  const blank = scoreObjectiveResponses(paper, cohort.blank);
  assert.ok(blank.questions.every(row => row.state === "UNANSWERED" && row.marks === 0), "missing work is never invented");
});

test("rubric edge cases: decimal full marks are accepted, over-total and unanswered marks are refused", () => {
  const paper = cohortPaper();
  const review = (marks: [string, number][]) => ({ note: "Moderated.", marks: marks.map(([questionId, value]) => ({ questionId, marks: value, feedback: "Checked." })) });
  // 1.1 + 1.1 + 1.1 is 3.3000000000000003 in binary; a perfect script must still be reviewable.
  assert.deepEqual(validateExamReview(paper, cohort.full, review([["q1", 1.1], ["q2", 1.1], ["q3", 1.1]])), []);
  assert.match(validateExamReview(paper, cohort.full, review([["q1", 1.1], ["q2", 1.1], ["q3", 1.2]])).join(" "), /Invalid marks for q3/);
  assert.match(validateExamReview(paper, cohort.blank, review([["q3", 0.5]])).join(" "), /Unanswered question q3 cannot receive marks/);
  assert.match(validateExamReview(paper, cohort.full, review([["q1", 1.1], ["q2", 1.1]])).join(" "), /Review every answered question/);
  assert.match(validateExamReview(paper, cohort.full, review([["q1", 1.1], ["q1", 1.1], ["q2", 1.1], ["q3", 1]])).join(" "), /only once/);
});

test("a key correction re-scores only affected learners and never rewrites the approved paper", () => {
  const paper = cohortPaper(), snapshot = structuredClone(paper);
  const corrected = correctedExamPaper(paper, [{ questionId: "q1", correctOptionId: "a2" }]);
  assert.deepEqual(paper, snapshot, "the approved paper/version stays as history");
  assert.equal(corrected.curriculumVersion, paper.curriculumVersion, "curriculum/source version is retained");
  const before = Object.fromEntries(Object.entries(cohort).map(([name, responses]) => [name, scoreObjectiveResponses(paper, responses).totalObjectiveMarks]));
  const after = Object.fromEntries(Object.entries(cohort).map(([name, responses]) => [name, scoreObjectiveResponses(corrected, responses).totalObjectiveMarks]));
  const affected = Object.keys(cohort).filter(name => Math.abs(before[name] - after[name]) > 0.00001);
  assert.deepEqual(affected.sort(), ["full", "wrongKeyVictim"]);
  assert.ok(after.wrongKeyVictim > before.wrongKeyVictim && after.full < before.full);
  assert.equal(after.blank, 0);
  // A later correction back to the original key stays valid inside a stored review (moderation disagreement resolved).
  assert.deepEqual(validateExamReview(paper, cohort.full, { note: "Reverted.", keyCorrections: [{ questionId: "q1", correctOptionId: "a1" }], marks: [{ questionId: "q1", marks: 1.1, feedback: "OK" }, { questionId: "q2", marks: 1.1, feedback: "OK" }, { questionId: "q3", marks: 1.1, feedback: "OK" }] }), []);
  assert.throws(() => correctedExamPaper(paper, [{ questionId: "q3", correctOptionId: "a1" }]), /rubric moderation/, "written answers need rubric moderation, not a key edit");
  assert.throws(() => correctedExamPaper(paper, [{ questionId: "q1", correctOptionId: "a1" }, { questionId: "q1", correctOptionId: "a2" }]), /once/);
  assert.throws(() => correctedExamPaper(paper, [{ questionId: "q2", correctOptionId: "a1" }]), /number and tolerance/);
});

test("duplicate, stale, late and post-submit saves never overwrite work or double-submit", () => {
  const deadlineAt = new Date("2026-10-29T10:00:00Z"), now = new Date("2026-10-29T09:00:00Z");
  const decide = (over: Partial<Parameters<typeof examSaveDecision>[0]>) => examSaveDecision({ status: "IN_PROGRESS", sequence: 5, currentSequence: 4, deadlineAt, now, submit: false, ...over });
  assert.equal(decide({}), "SAVE");
  assert.equal(decide({ sequence: 4 }), "REPLAY", "a retried request is a replay, not a second save");
  assert.equal(decide({ sequence: 3 }), "STALE", "an older tab cannot overwrite newer work");
  assert.equal(decide({ now: deadlineAt }), "EXPIRED");
  assert.equal(decide({ status: "SUBMITTED", submit: true }), "FINISHED", "a duplicate submit after submission changes nothing");
});

test("SKAI-1014: an auto-scored objective item is never changed silently; overrides need a reason; key correction stays the normal path", () => {
  const paper = cohortPaper();
  const marks = (q1: number, override?: string) => [{ questionId: "q1", marks: q1, feedback: "Checked.", ...(override ? { override: { reason: override } } : {}) }, { questionId: "q2", marks: 1.1, feedback: "Checked." }, { questionId: "q3", marks: 1, feedback: "Checked." }];
  // The victim chose a2 under the (wrong) key a1: auto score 0.
  assert.deepEqual(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Agreed with auto score.", marks: marks(0) }), { errors: [], overrides: [] });
  assert.match(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Silent change.", marks: marks(1.1) }).errors.join(" "), /q1 is auto-scored at 0\. Correct the answer key, or record an override reason/);
  assert.deepEqual(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Reasoned.", marks: marks(1.1, "Printed option labels were swapped for this candidate") }).overrides, [{ questionId: "q1", autoMarks: 0, marks: 1.1, reason: "Printed option labels were swapped for this candidate" }]);
  // The key correction path re-scores without any override.
  assert.deepEqual(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Key fixed.", keyCorrections: [{ questionId: "q1", correctOptionId: "a2" }], marks: marks(1.1) }), { errors: [], overrides: [] });
  // Overrides apply only to auto-scored items.
  assert.match(objectiveOverrides(paper, cohort.full, { note: "x", marks: [{ questionId: "q3", marks: 1, feedback: "x", override: { reason: "not needed" } }] }).errors.join(" "), /not auto-scored/);
  // A mark carried forward unchanged from the previous stored review is not a new change; a new change is.
  assert.deepEqual(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Revision.", marks: marks(1.1) }, { marks: [{ questionId: "q1", marks: 1.1 }] }).errors, []);
  assert.match(objectiveOverrides(paper, cohort.wrongKeyVictim, { note: "Revision.", marks: marks(0.5) }, { marks: [{ questionId: "q1", marks: 1.1 }] }).errors.join(" "), /auto-scored/);
});
