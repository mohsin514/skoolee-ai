import assert from "node:assert/strict";
import { test } from "node:test";
import { automatedRehearsal } from "../../src/lib/school-ai/exam-release-service";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408: the automated half of a rehearsal runs against exactly what the learner will receive.
test("a clean paper rehearses with no blocking result", () => {
  assert.deepEqual(automatedRehearsal(assessmentFixture().paper), []);
});

test("a missing key, too few options and a short section are blocking", () => {
  const { paper } = assessmentFixture();
  paper.questions[0] = { ...paper.questions[0], correctOptionId: "not-an-option" };
  paper.questions[1] = { ...paper.questions[1], options: paper.questions[1].options.slice(0, 1) };
  paper.questions = paper.questions.filter(question => question.id !== "q3");
  const results = automatedRehearsal(paper);
  // SKO-501: removing q3 also leaves the marks short of the blueprint, which rehearsal 2.0 now reports.
  assert.deepEqual(results.map(result => [result.check, result.severity]), [["KEY_MISSING", "BLOCKING"], ["OPTIONS_TOO_FEW", "BLOCKING"], ["SECTION_COUNT", "BLOCKING"], ["MARKS_DO_NOT_ADD_UP", "BLOCKING"]]);
  assert.deepEqual(results[0].questionIds, ["q1"]);
});
