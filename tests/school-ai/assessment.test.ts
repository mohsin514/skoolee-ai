import assert from "node:assert/strict";
import { test } from "node:test";
import { candidatePaper, curriculumDataSchema, mergeLockedQuestions, paperDataSchema, prepareGeneratedQuestions, validateBlueprint, validateCurriculumApproval, validatePaperApproval, type ItemReview } from "../../src/lib/school-ai/assessment";
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
test("unsupported proctored mode fails closed; secure browser needs an approved profile at assignment (SKO-449)", () => {
  assert.doesNotThrow(() => assertSupportedExamMode("STANDARD"));
  // Mode-level check passes; `createSchoolAiExam` refuses SECURE_BROWSER without an approved, pinned profile (secure-browser.database.test.ts).
  assert.doesNotThrow(() => assertSupportedExamMode("SECURE_BROWSER"));
  assert.throws(() => assertSupportedExamMode("PROCTORED"), /not enabled/);
});

test("accommodation inputs are bounded and cannot forge approval identity", () => {
  const input = { version: 1, studentId: "student-1", extraMinutes: 15, reason: "School approval" };
  assert.equal(approveExamAccommodationSchema.safeParse(input).success, true);
  for (const extraMinutes of [-1, 241, 1.5]) assert.equal(approveExamAccommodationSchema.safeParse({ ...input, extraMinutes }).success, false);
  assert.equal(approveExamAccommodationSchema.safeParse({ ...input, approvedById: "forged" }).success, false);
  assert.equal(approveExamAccommodationSchema.safeParse({ ...input, reason: " " }).success, false);
  assert.deepEqual(examAccommodationsSchema.parse({}), {});
});

const at = "2026-10-12T10:00:00.000Z";
const approvedReview = (itemRevision: number): ItemReview => ({ state: "APPROVED", itemRevision, approvedBy: { actorId: "approver-1", at, itemRevision }, invalidated: [], history: [] });

test("a paper stored before the item workbench parses and approves exactly as it did", () => {
  const { curriculum, paper } = assessmentFixture(), stored = structuredClone(paper);
  const parsed = paperDataSchema.parse(stored);
  // Optional means optional: no new key materializes, so a stored row is byte-identical after a parse.
  assert.deepStrictEqual(parsed, stored);
  assert.equal(Object.hasOwn(parsed.questions[0], "review"), false);
  for (const key of ["formSet", "itemGroupIds", "staleness"]) assert.equal(Object.hasOwn(parsed, key), false);
  assert.deepEqual(validatePaperApproval(parsed, curriculum), []);
  // An already-invalid paper reports the same issues as before: neither new check can fire without a review.
  const broken = structuredClone(paper); broken.questions[2].rubric[0].marks = 10; broken.questions[0].correctOptionId = "unknown";
  const errors = validatePaperApproval(broken, curriculum);
  assert.deepEqual(errors.filter((error) => /approv|figure check|item revision/i.test(error)), []);
  assert.equal(errors.length, 2);
});
test("recorded item review state and an invalidated figure check block paper approval", () => {
  const { curriculum, paper } = assessmentFixture();
  // One reviewed item puts the paper under the workbench, so its unreviewed siblings now block.
  paper.questions[0].review = approvedReview(1);
  assert.match(validatePaperApproval(paper, curriculum).join(" "), /Not approved: q2, q3\./);
  for (const question of paper.questions) question.review = approvedReview(1);
  assert.deepEqual(validatePaperApproval(paper, curriculum), []);
  // R4.10: every state other than APPROVED blocks, including the one awaiting an approver.
  paper.questions[2].review = { state: "READY_FOR_REVIEW", itemRevision: 2, invalidated: [], history: [{ state: "READY_FOR_REVIEW", actorId: "author-1", at }] };
  assert.match(validatePaperApproval(paper, curriculum).join(" "), /Not approved: q3\./);
  // R6.2: a figure change invalidates that item's figure check, which the figure's own flag cannot express.
  paper.questions[2].review = { ...approvedReview(2), invalidated: [{ artifact: "FIGURE_CHECK", trigger: "FIGURES", actorId: "author-1", at }] };
  const figureErrors = validatePaperApproval(paper, curriculum);
  assert.match(figureErrors.join(" "), /Question q3: a figures change invalidated the figure check at 2026-10-12T10:00:00.000Z\./);
  assert.equal(figureErrors.some((error) => /Not approved/.test(error)), false);
  // An approval recorded against an earlier item revision is not an approval of this item.
  paper.questions[2].review = { ...approvedReview(2), approvedBy: { actorId: "approver-1", at, itemRevision: 1 } };
  assert.match(validatePaperApproval(paper, curriculum).join(" "), /Question q3: the recorded approval belongs to an earlier item revision\./);
});
test("form set, item groups and staleness are bounded, and no boundary can forge an item approval", () => {
  const { paper } = assessmentFixture();
  const withSet = { ...structuredClone(paper), formSet: { id: "set-1", label: "B" as const, blueprintHash: "a".repeat(64) }, itemGroupIds: { q1: "group-1" }, staleness: { rehearsalValid: false, invalidatedAt: at, triggeredBy: { actorId: "author-1", change: "Question q1 prompt edited" } } };
  assert.equal(paperDataSchema.safeParse(withSet).success, true);
  for (const formSet of [{ ...withSet.formSet, label: "E" }, { ...withSet.formSet, blueprintHash: "A".repeat(64) }, { ...withSet.formSet, blueprintHash: "a".repeat(63) }]) assert.equal(paperDataSchema.safeParse({ ...withSet, formSet }).success, false);
  assert.equal(paperDataSchema.safeParse({ ...withSet, staleness: { ...withSet.staleness, rehearsalValid: "no" } }).success, false);
  assert.equal(paperDataSchema.safeParse({ ...withSet, itemGroupIds: { q1: "" } }).success, false);
  // A model response cannot arrive pre-approved, and the review state never reaches a candidate.
  const forged = { ...paper.questions[0], review: approvedReview(1) };
  assert.equal(Object.hasOwn(prepareGeneratedQuestions([forged], [])[0], "review"), false);
  assert.deepEqual(prepareGeneratedQuestions([forged], [{ ...forged, locked: true }]), [{ ...forged, locked: true }]);
  assert.equal(JSON.stringify(candidatePaper({ ...withSet, questions: [forged, ...paper.questions.slice(1)] })).includes("review"), false);
});
