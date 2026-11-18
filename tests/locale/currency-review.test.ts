import assert from "node:assert/strict";
import test from "node:test";
import { reviewableCampusIds } from "../../src/lib/locale/currency-review";

test("SKAI-2254: an accountant also reviews campuses that have no accountant of their own", () => {
  assert.deepEqual(reviewableCampusIds("main", ["main", "south"], ["main"]), ["main", "south"]);
});

test("SKAI-2254: a campus with its own accountant stays with that accountant", () => {
  assert.deepEqual(reviewableCampusIds("main", ["main", "south"], ["main", "south"]), ["main"]);
  assert.deepEqual(reviewableCampusIds("main", ["main", "south", "north"], ["main", null, "north"]), ["main", "south"]);
});
