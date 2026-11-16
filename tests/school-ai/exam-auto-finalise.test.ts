import assert from "node:assert/strict";
import { test } from "node:test";
import { objectiveOverrides, validateExamReview } from "../../src/lib/school-ai/exam";
import { assertObjectiveFinaliseAccess, objectiveOnlyReview } from "../../src/lib/school-ai/exam-auto-finalise";
import type { AuthUser } from "../../src/lib/auth";
import type { WorkspacePermissionSnapshot } from "../../src/lib/school-ai/access";
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

function staff(role: string, campusId: string, schoolId = "school-a") {
  return { userId: `${role}-1`, role, schoolId, campusId } as unknown as AuthUser;
}
function grants(exams: { canView: boolean; canEdit: boolean }) {
  return new Map([["exams", { canView: exams.canView, canAdd: false, canEdit: exams.canEdit, canDelete: false }]]) as unknown as WorkspacePermissionSnapshot;
}

test("SKAI-785: a receptionist without exam edit rights is refused with 403", async () => {
  await assert.rejects(assertObjectiveFinaliseAccess(staff("RECEPTIONIST", "campus-a"), grants({ canView: true, canEdit: false })), { status: 403 });
});

test("SKAI-785: a teacher with exam edit rights passes the finalise gate in their own school and campus", async () => {
  await assert.doesNotReject(assertObjectiveFinaliseAccess(staff("TEACHER", "campus-a"), grants({ canView: true, canEdit: true })));
  await assert.doesNotReject(assertObjectiveFinaliseAccess(staff("TEACHER", "campus-b", "school-b"), grants({ canView: true, canEdit: true })));
});
