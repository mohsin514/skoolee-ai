import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatePaper, curriculumDataSchema, mergeLockedQuestions, paperDataSchema, validateBlueprint, validateCurriculumApproval, validatePaperApproval } from "../../src/lib/school-ai/assessment";
import { approveExamAccommodationSchema, examAccommodationsSchema, assertSupportedExamMode, attemptDeadline, examSaveDecision, scoreObjectiveResponses, validateExamReview, validateExamWindow, validateResponses } from "../../src/lib/school-ai/exam";
import { assessmentFixture } from "./assessment-fixture";

test("an approved-scope blueprint counts only required optional answers and validates its paper", () => {
  const { curriculum, paper } = assessmentFixture();
  assert.equal(curriculumDataSchema.safeParse(curriculum).success, true);
  assert.equal(paperDataSchema.safeParse(paper).success, true);
  assert.deepEqual(validatePaperApproval(paper, curriculum), []);
  paper.blueprint.totalMarks = 7;
  assert.match(validateBlueprint(paper.blueprint, curriculum).join(" "), /Total marks/);
});
test("a past paper cannot substitute for a syllabus and untaught outcomes cannot be assessed", () => {
  const { curriculum, paper } = assessmentFixture(); curriculum.sources[0].kind = "PAST_PAPER";
  assert.match(validateCurriculumApproval(curriculum).join(" "), /past paper alone/);
  curriculum.outcomes[0].taught = false;
  assert.match(validateBlueprint(paper.blueprint, curriculum).join(" "), /taught outcomes/);
});
test("approval rejects invented evidence, duplicate prompts, missing answer keys and invalid rubric totals", () => {
  const { curriculum, paper } = assessmentFixture();
  paper.questions[0].sourceRefs[0].excerpt = "Invented citation";
  paper.questions[0].sourceRefs[0].page = "999";
  paper.questions[1].prompt = paper.questions[0].prompt;
  paper.questions[0].correctOptionId = "unknown";
  paper.questions[2].rubric[0].marks = 10;
  const errors = validatePaperApproval(paper, curriculum).join(" ");
  for (const pattern of [/source evidence/, /Duplicate question/, /answer key/, /rubric criteria/, /page outside/]) assert.match(errors, pattern);
});
test("locked questions survive omitted and rewritten generated questions exactly", () => {
  const { paper } = assessmentFixture(); const locked = { ...paper.questions[0], locked: true };
  assert.deepEqual(mergeLockedQuestions([{ ...locked, prompt: "Changed" }], [locked]), [locked]);
  assert.deepEqual(mergeLockedQuestions([], [locked]), [locked]);
});
test("candidate projection excludes every key, rubric, source excerpt and generation detail", () => {
  const { paper } = assessmentFixture(); const candidate = candidatePaper(paper);
  assert.deepEqual(Object.keys(candidate.questions[0]).sort(), ["id", "marks", "options", "prompt", "sectionId", "type"]);
  const text = JSON.stringify(candidate);
  for (const forbidden of ["correctOptionId", "modelAnswer", "rubric", "sourceRefs", "generation", "Two plus two equals four."]) assert.equal(text.includes(forbidden), false);
});
test("response validation rejects unknown IDs, invalid choices and excess optional answers", () => {
  const { paper } = assessmentFixture();
  assert.deepEqual(validateResponses(paper, { q1: "a1", q3: "Combine quantities" }), []);
  assert.match(validateResponses(paper, { q1: "a1", q2: "a2", unknown: "x" }).join(" "), /at most 1/);
  assert.match(validateResponses(paper, { q1: "unknown" }).join(" "), /Invalid choice/);
});
test("objective scoring preserves written review, missing answers and evidence-based zero", () => {
  const { paper } = assessmentFixture(); const score = scoreObjectiveResponses(paper, { q1: "a2", q3: "Combine quantities" });
  assert.equal(score.totalObjectiveMarks, 0); assert.equal(score.pendingReviewCount, 1);
  assert.equal(score.questions[1].state, "UNANSWERED"); assert.equal(score.questions[2].marks, null);
  assert.equal(scoreObjectiveResponses(paper, { q1: "a1" }).totalObjectiveMarks, 2);
});
test("moderation refuses unexplained missing responses, excessive marks and incomplete reviews", () => {
  const { paper } = assessmentFixture();
  assert.deepEqual(validateExamReview(paper, { q1: "a1", q3: "Work" }, { note: "Reviewed", marks: [{ questionId: "q1", marks: 2, feedback: "Correct" }, { questionId: "q3", marks: 2, feedback: "Method partly explained" }] }), []);
  assert.match(validateExamReview(paper, { q3: "Work" }, { note: "Reviewed", marks: [{ questionId: "q1", marks: 2, feedback: "Guessed" }] }).join(" "), /Unanswered.*cannot receive marks/);
});
test("server deadlines clamp late starts and classify stale, replay, expired and final requests", () => {
  const startedAt = new Date("2026-10-12T10:00:00Z"), endsAt = new Date("2026-10-12T10:10:00Z");
  assert.equal(attemptDeadline(startedAt, endsAt, 30).toISOString(), endsAt.toISOString());
  assert.equal(validateExamWindow(endsAt, startedAt, startedAt), "Exam end must be after its start.");
  const request = { status: "IN_PROGRESS", sequence: 1, currentSequence: 2, deadlineAt: endsAt, now: startedAt, submit: false };
  assert.equal(examSaveDecision(request), "STALE"); assert.equal(examSaveDecision({ ...request, sequence: 2 }), "REPLAY"); assert.equal(examSaveDecision({ ...request, sequence: 3 }), "SAVE");
  assert.equal(examSaveDecision({ ...request, now: endsAt }), "EXPIRED"); assert.equal(examSaveDecision({ ...request, status: "SUBMITTED" }), "FINISHED");
});
test("unsupported secure/proctored modes fail closed", () => {
  assert.doesNotThrow(() => assertSupportedExamMode("STANDARD"));
  assert.throws(() => assertSupportedExamMode("SECURE_BROWSER"), /not enabled/); assert.throws(() => assertSupportedExamMode("PROCTORED"), /not enabled/);
});

test("accommodation inputs are bounded and cannot forge approval identity", () => {
  const input = { version: 1, studentId: "student-1", extraMinutes: 15, reason: "School approval" };
  assert.equal(approveExamAccommodationSchema.safeParse(input).success, true);
  for (const extraMinutes of [-1, 241, 1.5]) assert.equal(approveExamAccommodationSchema.safeParse({ ...input, extraMinutes }).success, false);
  assert.equal(approveExamAccommodationSchema.safeParse({ ...input, approvedById: "forged" }).success, false);
  assert.equal(approveExamAccommodationSchema.safeParse({ ...input, reason: " " }).success, false);
  assert.deepEqual(examAccommodationsSchema.parse({}), {});
});
