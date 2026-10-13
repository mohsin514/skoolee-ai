import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { candidatePaper, paperDataSchema, validatePaperApproval, validateCurriculumApproval } from "../../src/lib/school-ai/assessment";
import { parseMultipleChoice, parseNumericAnswer, scoreObjectiveResponses, validateResponses, validateExamReview } from "../../src/lib/school-ai/exam";
import { validateWrittenProposal } from "../../src/lib/school-ai/written-marking";
import { buildCandidatePaperHtml } from "../../src/lib/school-ai/paper-print";

test("multiple-choice scoring requires the complete distinct set and never accepts malformed responses", () => {
 const { paper, curriculum } = assessmentFixture(); paper.questions[0] = { ...paper.questions[0], type: "MULTIPLE_CHOICE", correctOptionId: null, correctOptionIds: ["a1", "a2"] }; paper.questions[1] = { ...paper.questions[1], type: "MULTIPLE_CHOICE", correctOptionId: null, correctOptionIds: ["a1"] }; paper.blueprint.sections[0].type = "MULTIPLE_CHOICE";
 assert.deepEqual(validatePaperApproval(paper, curriculum), []);
 assert.equal(scoreObjectiveResponses(paper, { q1: '["a2","a1"]' }).totalObjectiveMarks, 2);
 assert.equal(scoreObjectiveResponses(paper, { q1: '["a1"]' }).totalObjectiveMarks, 0);
 for (const value of ['["a1","a1"]', '["missing"]', '{}', '[]', 'a1']) assert(validateResponses(paper, { q1: value }).length);
 assert.equal(parseMultipleChoice('["a1","a1"]'), null);
});
test("numeric responses accept explicit locale digits and fixed tolerance while rejecting executable or non-finite input", () => {
 const { paper } = assessmentFixture(); paper.questions[0] = { ...paper.questions[0], type: "NUMERIC", options: [], correctOptionId: null, numericKey: { value: 4, tolerance: 0.1 } };
 for (const raw of ["4", "۴", "٤", "٤٫١", "3.9", "4e0"]) assert.equal(scoreObjectiveResponses(paper, { q1: raw }).totalObjectiveMarks, 2);
 assert.equal(scoreObjectiveResponses(paper, { q1: "4.1001" }).totalObjectiveMarks, 0);
 for (const raw of ["", "Infinity", "NaN", "4;alert(1)", "1,000", "1e999", "0x4"]) assert.equal(parseNumericAnswer(raw), null);
});
test("section coverage separates taught material and prohibits unconfirmed or different-section assessment", () => {
 const { paper, curriculum } = assessmentFixture(); curriculum.sectionCoverage = [{ section: "A", outcomeIds: ["outcome-1"], taughtOn: "2026-10-13", confirmed: true }];
 assert.match(validatePaperApproval(paper, curriculum).join(" "), /confirmed section coverage/);
 paper.coverageSection = "A"; assert.deepEqual(validatePaperApproval(paper, curriculum), []);
 curriculum.sectionCoverage[0].confirmed = false; assert.match(validateCurriculumApproval(curriculum).join(" "), /confirm distinct taught/);
});
test("candidate resources require explicit approval and advanced answer keys remain absent from print and candidate JSON", () => {
 const { paper, curriculum } = assessmentFixture(); paper.resources = [{ id: "sheet", title: "Formula sheet", content: "a + b = b + a <script>bad</script>", approved: false }];
 assert.match(validatePaperApproval(paper, curriculum).join(" "), /candidate resource/);
 assert.deepEqual(candidatePaper(paper).resources, []);
 paper.resources[0].approved = true;
 paper.questions[0].correctOptionIds = ["key-secret"]; paper.questions[0].numericKey = { value: 919191, tolerance: 0.01 };
 const candidate = JSON.stringify(candidatePaper(paper)); for (const forbidden of ["correctOptionIds", "numericKey", "919191", "key-secret", "modelAnswer", "rubric"]) assert(!candidate.includes(forbidden));
 const html = buildCandidatePaperHtml(paper, 1); assert(html.includes("Formula sheet")); assert(html.includes("&lt;script&gt;bad&lt;/script&gt;")); assert(!html.includes("<script>bad")); assert(!html.includes("919191"));
});
test("written proposals need exact student evidence, every criterion and bounded criterion totals", () => {
 const { paper } = assessmentFixture(), responses = { q3: "I combine the quantities and count." };
 const proposal = { questionId: "q3", marks: 2, feedback: "Method partly explained", evidence: [{ criterionId: "r2", quote: "combine the quantities", marks: 2 }] };
 assert.deepEqual(validateWrittenProposal(paper, responses, proposal), proposal);
 for (const evidence of [[{ criterionId: "r2", quote: "invented response", marks: 2 }], [{ criterionId: "r2", quote: "", marks: 2 }], [{ criterionId: "r2", quote: "combine the quantities", marks: 4 }], []]) assert.throws(() => validateWrittenProposal(paper, responses, { ...proposal, evidence }));
 assert(validateExamReview(paper, responses, { note: "review", marks: [{ ...proposal, marks: 3 }] }).some(issue => issue.includes("total")));
});
test("edition dates and all advanced draft types round-trip with strict schemas", () => {
 const { paper } = assessmentFixture(); for (const type of ["MULTIPLE_CHOICE", "NUMERIC", "MATH", "CODE"] as const) { paper.questions[0].type = type; assert.equal(paperDataSchema.safeParse(paper).success, true); }
 assert.equal(paperDataSchema.safeParse({ ...paper, injected: "run sql" }).success, false);
});
