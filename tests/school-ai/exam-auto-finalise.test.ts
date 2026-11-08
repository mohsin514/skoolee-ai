import assert from "node:assert/strict";
import { test } from "node:test";
import { objectiveOverrides, validateExamReview } from "../../src/lib/school-ai/exam";
import { objectiveOnlyReview } from "../../src/lib/school-ai/exam-auto-finalise";
import { assessmentFixture } from "./assessment-fixture";

test("SKAI-785: an attempt with only objective answers gets the auto-scored review", () => {
  const { paper } = assessmentFixture();
  const responses = { q1: "a1" };
  const review = objectiveOnlyReview(paper, responses);
  assert.ok(review);
  assert.deepEqual(review.marks.map(mark => [mark.questionId, mark.marks]), [["q1", 2]]);
  assert.deepEqual(validateExamReview(paper, responses, review), []);
  assert.deepEqual(objectiveOverrides(paper, responses, review), { errors: [], overrides: [] });
});

test("SKAI-785: a wrong objective answer is finalised at zero without an override", () => {
  const { paper } = assessmentFixture();
  const review = objectiveOnlyReview(paper, { q1: "a2" });
  assert.ok(review);
  assert.equal(review.marks[0].marks, 0);
  assert.deepEqual(objectiveOverrides(paper, { q1: "a2" }, review).errors, []);
});

test("SKAI-785: any answered written question keeps the attempt in the marking queue", () => {
  const { paper } = assessmentFixture();
  assert.equal(objectiveOnlyReview(paper, { q1: "a1", q3: "Combine quantities" }), null);
});

test("SKAI-785: a blank attempt is finalised with no marks", () => {
  const { paper } = assessmentFixture();
  const review = objectiveOnlyReview(paper, {});
  assert.ok(review);
  assert.deepEqual(review.marks, []);
  assert.deepEqual(validateExamReview(paper, {}, review), []);
});
