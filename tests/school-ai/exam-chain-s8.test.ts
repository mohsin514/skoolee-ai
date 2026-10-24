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
