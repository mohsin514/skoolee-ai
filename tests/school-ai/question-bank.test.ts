import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { candidatePaper, mergeLockedQuestions, prepareGeneratedQuestions, questionSchema } from "../../src/lib/school-ai/assessment";
import { bankFiltersSchema, bankQuestionMatches, bankReuseSchema, reuseBankQuestion, type BankReuseInput } from "../../src/lib/school-ai/question-bank";
const setup = () => {
  const fixture = assessmentFixture();
  const source = { paperId: "source-paper", paperVersion: 2, ...fixture };
  const paper = { ...structuredClone(fixture.paper), questions: [] };
  const input: BankReuseInput = { source: { paperId: source.paperId, paperVersion: 2, questionId: "q1" }, paper, sectionId: "section-a", mappings: [{ sourceOutcomeId: "outcome-1", targetOutcomeId: "outcome-1" }], alignmentConfirmed: true };
  input.sectionId = fixture.paper.questions[0].sectionId;
  return { source, input, curriculum: fixture.curriculum };
};
test("bank filters use explicit tags, labels, language, type, scope and bounded marks", () => {
  const { source } = setup(); const question = { ...source.paper.questions[0], bankMetadata: { tags: ["Addition"], difficulty: "EASY" as const } };
  const filters = bankFiltersSchema.parse({ campusId: "campus", subjectId: source.paper.subjectId, classId: source.paper.classId, tag: "addition", language: "en", type: "SINGLE_CHOICE", difficulty: "EASY", minMarks: "2", maxMarks: "2", search: "2 + 2" });
  assert.equal(bankQuestionMatches(question, source.paper, filters), true);
  for (const change of [{ language: "ur" as const }, { tag: "geometry" }, { minMarks: 3 }, { subjectId: "elsewhere" }, { difficulty: "HARD" as const }]) assert.equal(bankQuestionMatches(question, source.paper, { ...filters, ...change }), false);
  assert.equal(bankFiltersSchema.safeParse({ ...filters, minMarks: 4, maxMarks: 2 }).success, false);
  assert.equal(questionSchema.safeParse({ ...question, bankMetadata: { tags: ["x".repeat(81)], difficulty: "EASY" } }).success, false);
});
test("reuse preserves immutable source pointers, explicitly rebinds valid current evidence and pins the copy", () => {
  const { source, input, curriculum } = setup();
  const target = structuredClone(curriculum); target.sources[0].id = "current-source"; target.outcomes[0].id = "current-outcome"; target.outcomes[0].sourceId = "current-source"; target.outcomes[0].sourcePage = "12";
  input.paper.blueprint.sections.forEach((section) => { section.outcomeIds = ["current-outcome"]; }); input.mappings[0].targetOutcomeId = "current-outcome";
  const result = reuseBankQuestion(input, source, target, "copied-id"); const copied = result.questions[0];
  assert.equal(copied.id, "copied-id"); assert.equal(copied.locked, true); assert.deepEqual(copied.outcomeIds, ["current-outcome"]); assert.equal(copied.sourceRefs[0].sourceId, "current-source"); assert.equal(copied.sourceRefs[0].page, "12");
  assert.equal(copied.reusedFrom?.paperVersion, 2); assert.equal(copied.reusedFrom?.curriculumVersion, source.paper.curriculumVersion);
  assert.equal(copied.correctOptionId, copied.options[0].id); assert.notEqual(copied.options[0].id, source.paper.questions[0].options[0].id); assert.notEqual(copied.rubric[0].id, source.paper.questions[0].rubric[0].id);
  assert.equal(source.paper.questions[0].id, "q1"); assert.equal(input.paper.questions.length, 0);
  assert.deepEqual(mergeLockedQuestions([], result.questions), result.questions);
  assert.doesNotMatch(JSON.stringify(candidatePaper(result)), /reusedFrom|bankMetadata|sourceRefs|correctOptionId/);
});
test("reusing a multiple-choice item remaps every answer-key option to the copied option IDs", () => {
  const { source, input, curriculum } = setup();
  const original = source.paper.questions[0];
  const multi = { ...original, type: "MULTIPLE_CHOICE" as const, correctOptionId: null, correctOptionIds: original.options.slice(0, 2).map(option => option.id) };
  source.paper.questions[0] = multi;
  input.source.questionId = multi.id;
  input.paper.blueprint.sections[0].type = "MULTIPLE_CHOICE";
  const copied = reuseBankQuestion(input, source, curriculum, "copied-multi").questions[0];
  assert.deepEqual(copied.correctOptionIds, [copied.options[0].id, copied.options[1].id]);
  assert.ok(copied.correctOptionIds?.every(id => copied.options.some(option => option.id === id)));
  assert.notDeepEqual(copied.correctOptionIds, multi.correctOptionIds);
});
test("reuse rejects pinned replacements, duplicate prompts/IDs, full slots and blueprint mismatch", () => {
  const { source, input, curriculum } = setup();
  const pinned = { ...structuredClone(source.paper.questions[0]), locked: true };
  const replace = { ...input, paper: { ...input.paper, questions: [pinned] }, replaceQuestionId: pinned.id };
  assert.throws(() => reuseBankQuestion(replace, source, curriculum, "new"), /unlocked/);
  assert.throws(() => reuseBankQuestion({ ...input, paper: { ...input.paper, questions: [pinned] } }, source, curriculum, "new"), /already/);
  assert.throws(() => reuseBankQuestion({ ...input, paper: { ...input.paper, questions: [pinned, { ...pinned, prompt: "Different" }] } }, source, curriculum, "new"), /identifiers/);
  const full = { ...input, paper: structuredClone(source.paper) }; assert.throws(() => reuseBankQuestion(full, source, curriculum, "new"), /no free/);
  const mismatched = structuredClone(input); mismatched.paper.blueprint.totalMarks = 99; assert.throws(() => reuseBankQuestion(mismatched, source, curriculum, "new"), /Total marks/);
  const unlocked = { ...pinned, locked: false }; const changed = reuseBankQuestion({ ...replace, paper: { ...input.paper, questions: [unlocked] } }, source, curriculum, "new"); assert.equal(changed.questions.length, 1); assert.equal(changed.questions[0].id, "new");
});
test("reuse requires human confirmation and rejects invented, untaught, mismatched or unsupported evidence mappings", () => {
  const { source, input, curriculum } = setup();
  assert.equal(bankReuseSchema.safeParse({ ...input, alignmentConfirmed: false }).success, false);
  assert.throws(() => reuseBankQuestion({ ...input, mappings: [] }, source, curriculum, "new"), /every source outcome/);
  const target = structuredClone(curriculum); target.sources[0].excerpt = "Unrelated evidence"; assert.throws(() => reuseBankQuestion(input, source, target, "new"), /quoted source evidence/);
  target.outcomes[0].taught = false; assert.throws(() => reuseBankQuestion(input, source, target, "new"), /taught outcomes/);
  assert.throws(() => reuseBankQuestion({ ...input, paper: { ...input.paper, language: "ar" } }, source, curriculum, "new"), /same subject, class and paper language/);
});

test("generation cannot fabricate bank provenance while exact pinned copies keep theirs", () => {
  const { source, input, curriculum } = setup();
  const copied = reuseBankQuestion(input, source, curriculum, "pinned-copy").questions[0];
  const invented = { ...structuredClone(copied), id: "new-generated", locked: false };
  const generated = prepareGeneratedQuestions([invented, { ...copied, prompt: "Model tried to rewrite the pinned item" }], [copied]);
  assert.equal(generated[0].reusedFrom, undefined); assert.deepEqual(generated[1], copied);
});
