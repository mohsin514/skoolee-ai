import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMistakeMap, practiceProposals, MAP_MINIMUM_LEARNERS } from "../../src/lib/school-ai/mistake-map";
import { analyseItems, deriveFeedback } from "../../src/lib/school-ai/recovery";
import { familySentence, familyNoteLanguage } from "../../src/lib/school-ai/family-note";
import { gradebookDrift, type GradebookPublication } from "../../src/lib/school-ai/exam-gradebook";
import { assessmentFixture } from "./assessment-fixture";

// SKO-504: Mistake Map, Next Ten Minutes proposals, the one-sentence Family Note and gradebook drift.
function setup() {
  const { paper } = assessmentFixture();
  paper.questions = paper.questions.map(question => question.id === "q2" ? { ...question, outcomeIds: ["outcome-2"] } : question);
  const titles = new Map([["outcome-1", "Add whole numbers"], ["outcome-2", "Read a number sentence"]]);
  const row = (attemptId: string, q1: number, q2: number, q3: number, answers: Record<string, string>) => ({ attemptId, name: `Learner ${attemptId}`, responses: answers, review: { marks: [{ questionId: "q1", marks: q1, feedback: "" }, { questionId: "q2", marks: q2, feedback: "" }, { questionId: "q3", marks: q3, feedback: "" }] } });
  return { paper, titles, row };
}

test("the map is outcome × learner, ranks by marks lost and leaves a check item out", () => {
  const { paper, titles, row } = setup();
  // q2: everybody chose the wrong option a2, so nobody earned full credit — a CHECK_ITEM.
  const rows = ["1", "2", "3", "4"].map((id, index) => row(id, index < 2 ? 2 : 0, 0, index === 0 ? 3 : 1, { q1: index < 2 ? "a1" : "a2", q2: "a2", q3: "Combine them" }));
  const items = analyseItems(paper, rows);
  assert.equal(items.find(item => item.questionId === "q2")?.reading, "CHECK_ITEM");
  const map = buildMistakeMap(paper, rows, items, titles);
  assert.deepEqual(map.excluded.map(item => item.questionId), ["q2"], "the questioned item is listed apart");
  const second = map.outcomes.find(outcome => outcome.outcomeId === "outcome-2")!;
  assert.equal(second.reading, "NOT_MEASURED", "an outcome measured only by a check item is not measured");
  const first = map.outcomes[0];
  assert.equal(first.outcomeId, "outcome-1");
  assert.equal(first.reading, "MEASURED");
  assert.equal(first.possible, 4 * 5);
  assert.equal(first.lost, 20 - (2 + 3) - (2 + 1) - 1 - 1);
  assert.deepEqual(first.cells.map(cell => cell.status), ["ADDRESSED", "PARTIAL", "PARTIAL", "PARTIAL"]);
  assert.ok(map.distractors.some(row => row.questionId === "q1" && row.option === "5" && row.count === 2), "two of four choosing the same wrong option is a cluster");
});

test("an outcome answered by fewer than the minimum learners is not measured", () => {
  const { paper, titles, row } = setup();
  const rows = Array.from({ length: MAP_MINIMUM_LEARNERS - 1 }, (_, index) => row(String(index), 2, 2, 3, { q1: "a1", q2: "a1", q3: "Combine" }));
  const map = buildMistakeMap(paper, rows, analyseItems(paper, rows), titles);
  assert.ok(map.outcomes.every(outcome => outcome.reading === "NOT_MEASURED" && outcome.percentage === null));
});

test("three practice proposals come hardest first, never a check item, with the easiest held back as the check", () => {
  const pool = [10, 40, 25, 80, 55].map((percentage, index) => ({ sourceAssignmentId: "s", questionId: `q${index}`, outcomeIds: ["o"], percentage, reading: "LEARNING_EVIDENCE" as const }));
  pool.push({ sourceAssignmentId: "s", questionId: "bad", outcomeIds: ["o"], percentage: 0, reading: "CHECK_ITEM" as never });
  const { practice, check } = practiceProposals(pool, "o");
  assert.deepEqual(practice.map(item => item.questionId), ["q0", "q2", "q1"]);
  assert.equal(check?.questionId, "q3");
});

test("the family note is one sentence in the guardian's language, from this learner's own outcomes", () => {
  const { paper, titles } = setup();
  const feedback = deriveFeedback(paper, { marks: [{ questionId: "q1", marks: 2, feedback: "" }, { questionId: "q2", marks: 0, feedback: "" }, { questionId: "q3", marks: 3, feedback: "" }] }, { q1: "a1", q2: "a2", q3: "Combine" }, titles);
  const english = familySentence("en", "Sara", "Unit test", feedback);
  assert.match(english, /Add whole numbers.*next step is.*Read a number sentence/);
  const arabic = familySentence("ar", "سارة", "اختبار", feedback);
  assert.match(arabic, /الخطوة التالية/);
  assert.equal((arabic.match(/[.؟!]/g) ?? []).length, 1, "one sentence");
  assert.equal(familyNoteLanguage("ur"), "ur");
  assert.equal(familyNoteLanguage("fr"), "en", "an unsupported guardian language falls back to English");
  assert.match(familySentence("en", "Sara", "Unit test", []), /completed/, "no titled outcome still yields one sentence");
});

test("a sent mark that drifted from its result or was edited in the gradebook is flagged", () => {
  const row = (studentId: string, attemptId: string, markId: string, targetMark: number) => ({ attemptId, studentId, reviewedAt: new Date().toISOString(), reviewedById: "t", reviewHash: "a".repeat(64), rawTotal: targetMark, targetMark, grade: "A", markId });
  const publication = { conversion: "EXACT", sourceMaximum: 10, targetMaximum: 10, rows: [row("s1", "a1", "m1", 7), row("s2", "a2", "m2", 8), row("s3", "a3", "m3", 9), row("s4", "a4", "m4", 6)] } as unknown as GradebookPublication;
  const attempts = [{ id: "a1", review: { total: 9 } }, { id: "a2", review: { total: 8 } }, { id: "a3", review: { total: 9 } }, { id: "a4", review: { total: 6 } }];
  const marks = [{ id: "m1", marksObtained: 7 }, { id: "m2", marksObtained: 5 }, { id: "m3", marksObtained: 9 }];
  const drift = gradebookDrift(publication, attempts, marks, new Map([["s1", "One"]]));
  assert.deepEqual(drift.map(entry => [entry.studentId, entry.kind, entry.sent, entry.current]), [["s1", "RESULT_CORRECTED", 7, 9], ["s2", "MARK_EDITED", 8, 5], ["s4", "MARK_MISSING", 6, null]]);
});
