import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseItems, deriveFeedback } from "../../src/lib/school-ai/recovery";
import { STUDIO_SPACES } from "../../src/components/school-ai/exam-studio/studio-space-registry";
import { existsSync } from "node:fs";
import { assessmentFixture } from "./assessment-fixture";

// SKO-408: the Brief, Review desk and Improve spaces land as registry modules; Improve reads only moderated marks.
test("every one of the seven frozen spaces has landed under its registry name", () => {
  for (const id of ["brief", "blueprint", "review", "rehearsal", "exam-room", "control-room", "improve"]) {
    const entry = STUDIO_SPACES.find(space => space.id === id)!;
    assert.ok(existsSync(`src/components/school-ai/exam-studio/spaces/${entry.module}.tsx`), `${entry.module} is missing`);
  }
});

test("feedback ties each outcome to items, awarded marks and the teacher's words; unattempted is not 'missed'", () => {
  const { paper } = assessmentFixture();
  const titles = new Map([["outcome-1", "Add whole numbers"]]);
  const full = deriveFeedback(paper, { marks: [{ questionId: "q1", marks: 2, feedback: "Correct." }, { questionId: "q3", marks: 3, feedback: "Clear method." }] }, { q1: "a1", q3: "Combine them." }, titles);
  assert.equal(full.length, 1);
  assert.equal(full[0].status, "PARTIAL", "q2 was left blank, so the outcome is only partly evidenced");
  assert.deepEqual(full[0].evidence.map(row => [row.number, row.awarded, row.maximum, row.answered, row.feedback]), [[1, 2, 2, true, "Correct."], [2, 0, 2, false, null], [3, 3, 3, true, "Clear method."]]);
  const none = deriveFeedback(paper, { marks: [] }, {}, titles);
  assert.equal(none[0].status, "NOT_ANSWERED");
  const missed = deriveFeedback(paper, { marks: [{ questionId: "q1", marks: 0, feedback: "Recheck the sum." }] }, { q1: "a2" }, titles);
  assert.equal(missed[0].status, "MISSED");
  assert.equal(JSON.stringify(full).includes("correctOptionId"), false, "no key leaks into feedback");
});

test("item analysis separates thin evidence and item questions from learning evidence", () => {
  const { paper } = assessmentFixture();
  const row = (q1: string, mark: number) => ({ review: { marks: [{ questionId: "q1", marks: mark, feedback: "Marked." }] }, responses: { q1 } });
  const thin = analyseItems(paper, [row("a1", 2), row("a2", 0)]);
  assert.equal(thin[0].reading, "INSUFFICIENT_EVIDENCE");
  assert.equal(thin[1].unanswered, 2);
  const distractor = analyseItems(paper, [row("a2", 0), row("a2", 0), row("a2", 0), row("a1", 2)]);
  assert.equal(distractor[0].reading, "CHECK_ITEM");
  assert.deepEqual(distractor[0].reasons, ["DISTRACTOR_PREFERRED"]);
  assert.deepEqual(distractor[0].choices.map(choice => [choice.count, choice.key]), [[1, true], [3, false]]);
  const learning = analyseItems(paper, [row("a1", 2), row("a1", 2), row("a2", 0)]);
  assert.equal(learning[0].reading, "LEARNING_EVIDENCE");
  assert.equal(learning[0].percentage, 66.7);
});
