import assert from "node:assert/strict";
import { test } from "node:test";
import { itemKey, itemWatch, twinForecast, twinVersusClass, TWIN_MIN_SAMPLE } from "../../src/lib/school-ai/exam-twin";
import { analyseItems } from "../../src/lib/school-ai/recovery";
import { assessmentFixture } from "./assessment-fixture";

// SKO-507: Exam Twin (estimate from this class's earlier evidence on the same item) and Item Watch.
const rows = (count: number, mark: (index: number) => Record<string, number>, answer: (index: number) => Record<string, string>) =>
  Array.from({ length: count }, (_, index) => ({ review: { marks: Object.entries(mark(index)).map(([questionId, marks]) => ({ questionId, marks, feedback: "f" })) }, responses: answer(index) }));

test("the Twin estimates an item from earlier sittings of the same item, and says NOT_MEASURED below the sample", () => {
  const { paper } = assessmentFixture();
  // An earlier paper with the same q1 under another id, and a different q2.
  const earlier = { ...paper, questions: [{ ...paper.questions[0], id: "old1" }, { ...paper.questions[1], id: "old2", prompt: "A different prompt entirely." }] };
  assert.equal(itemKey(paper, paper.questions[0]), itemKey(earlier, earlier.questions[0]), "same prompt, type and options is the same item");
  const evidence = [{ paper: earlier, rows: rows(12, index => ({ old1: index < 9 ? 2 : 0, old2: 2 }), () => ({ old1: "a1", old2: "a1" })) }];
  const forecast = twinForecast(paper, evidence);
  assert.deepEqual(forecast.map(item => [item.questionId, item.reading, item.facility, item.sample]), [["q1", "ESTIMATE", 75, 12], ["q2", "NOT_MEASURED", null, 0], ["q3", "NOT_MEASURED", null, 0]]);
  const thin = twinForecast(paper, [{ paper: earlier, rows: rows(TWIN_MIN_SAMPLE - 1, () => ({ old1: 2 }), () => ({ old1: "a1" })) }]);
  assert.equal(thin[0].reading, "NOT_MEASURED");
  const current = rows(10, index => ({ q1: index < 5 ? 2 : 0 }), () => ({ q1: "a1" }));
  const side = twinVersusClass(forecast, analyseItems(paper, current));
  assert.deepEqual([side[0].twin, side[0].scored, side[0].difference], [75, 50, -25], "Twin said 75%, the class scored 50%");
});

test("Item Watch flags a wrong option the top quarter preferred and weak discrimination, never below the sample", () => {
  const { paper } = assessmentFixture();
  // q1: the three strongest choose a2 (wrong); the rest of the strong-to-middle pick the key.
  const scripts = rows(12, index => ({ q1: index < 3 ? 0 : index < 9 ? 2 : 0, q2: index < 3 ? 2 : 0, q3: index < 3 ? 3 : index < 9 ? 1 : 0 }), index => ({ q1: index < 3 || index >= 9 ? "a2" : "a1", q2: index < 3 ? "a1" : "a2", q3: "x" }));
  const watch = itemWatch(paper, scripts);
  const q1 = watch.find(item => item.questionId === "q1")!;
  assert.ok(q1.flags.includes("TOP_QUARTILE_DISTRACTOR"));
  assert.equal(q1.preferredOption, "5");
  assert.equal(q1.remedy, "KEY_CORRECTION");
  assert.equal(watch.find(item => item.questionId === "q3")!.flags.length, 0, "an item that separates strong from weak is clear");
  assert.ok(itemWatch(paper, scripts.slice(0, 9)).every(item => item.reading === "NOT_MEASURED"));
});

test("Twin and Item Watch count valid marked responses rather than blank or invalid scripts", () => {
  const { paper } = assessmentFixture();
  const scripts = rows(12, (index): Record<string, number> => index === 9 ? {} : ({ q1: index === 10 ? NaN : index === 11 ? 50 : 2 }), () => ({ q1: "a1" }));
  const forecast = twinForecast(paper, [{ paper, rows: scripts }]);
  assert.deepEqual([forecast[0].sample, forecast[0].facility], [9, null]);
  assert.equal(itemWatch(paper, scripts)[0].reading, "NOT_MEASURED");
  const blanks = rows(20, () => ({ q1: 0 }), index => ({ q1: index < 9 ? "a2" : "" }));
  assert.deepEqual([itemWatch(paper, blanks)[0].sample, itemWatch(paper, blanks)[0].reading], [9, "NOT_MEASURED"]);
  const measured = twinForecast(paper, [{ paper, rows: rows(12, () => ({ q1: 2 }), () => ({ q1: "a1" })) }]);
  assert.equal(twinVersusClass(measured, analyseItems(paper, scripts.slice(0, 2)))[0].difference, null, "a tiny actual sample cannot be a calibration claim");
});

test("Item Watch understands multi-select keys, tied choices and cohorts with no score variation", () => {
  const { paper } = assessmentFixture();
  paper.questions[0] = { ...paper.questions[0], type: "MULTIPLE_CHOICE", correctOptionId: null, correctOptionIds: ["a1", "a2"] };
  const scripts = rows(12, index => ({ q1: 2, q2: index < 3 ? 2 : 0, q3: index < 3 ? 3 : 0 }), () => ({ q1: '["a1","a2"]', q2: "a1", q3: "x" }));
  assert.ok(!itemWatch(paper, scripts)[0].flags.includes("TOP_QUARTILE_DISTRACTOR"), "a JSON array of correct selections is not a wrong option");
  paper.questions[0] = { ...paper.questions[0], type: "SINGLE_CHOICE", correctOptionId: "a1", correctOptionIds: [] };
  const tiedOptions = rows(16, index => ({ q1: index % 2 ? 2 : 0, q2: index < 4 ? 2 : 0, q3: index < 4 ? 3 : 0 }), index => ({ q1: index % 2 ? "a1" : "a2", q2: "a1", q3: "x" }));
  assert.ok(!itemWatch(paper, tiedOptions)[0].flags.includes("TOP_QUARTILE_DISTRACTOR"), "a tie is not a preferred distractor");
  const tiedScores = rows(12, () => ({ q1: 0, q2: 2, q3: 1 }), () => ({ q1: "a2", q2: "a1", q3: "x" }));
  assert.ok(itemWatch(paper, tiedScores).every(item => item.reading === "NOT_MEASURED" && !item.flags.length));
});

test("Item Watch boundary ties cannot change a diagnosis when database row order changes", () => {
  const { paper } = assessmentFixture();
  const scripts = rows(12, index => ({ q1: index < 6 ? 2 : 0, q2: index < 6 ? 0 : 2, q3: index < 2 ? 3 : index >= 10 ? 0 : 1 }), index => ({ q1: index < 6 ? "a1" : "a2", q2: "a1", q3: "x" }));
  assert.deepEqual(itemWatch(paper, scripts), itemWatch(paper, [...scripts].reverse()));
});
