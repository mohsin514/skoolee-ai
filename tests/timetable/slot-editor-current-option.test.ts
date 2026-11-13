import assert from "node:assert/strict";
import { test } from "node:test";
import { withCurrentOption } from "../../src/components/timetable/current-option";

const fallback = (id: string) => ({ id, fullName: "Current teacher" });
const all = [{ id: "t1", fullName: "QA Teacher One" }, { id: "t2", fullName: "QA Teacher Two" }];

test("SKAI-1390: saved teacher stays an option when availability failed", () => {
  assert.deepEqual(withCurrentOption([], "t1", all, fallback), [all[0]]);
});
test("SKAI-1390: unknown saved option gets a fallback label", () => {
  assert.deepEqual(withCurrentOption([], "tx", all, fallback), [{ id: "tx", fullName: "Current teacher" }]);
});
test("SKAI-1390: no duplicate when the saved option is free", () => {
  assert.deepEqual(withCurrentOption([all[1]], "t2", all, fallback), [all[1]]);
});
test("SKAI-1390: nothing selected leaves the list alone", () => {
  assert.deepEqual(withCurrentOption([all[1]], "", all, fallback), [all[1]]);
});
