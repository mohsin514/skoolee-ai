import assert from "node:assert/strict";
import test from "node:test";
import { pickBoardInForce } from "../../src/lib/timetable/versions";

const v = (date: string) => ({ effectiveFrom: new Date(`${date}T00:00:00.000Z`) });

test("a future-year board does not hide the current board in force; it shows as upcoming", () => {
  const current = v("2026-04-01"), next = v("2027-04-01");
  const result = pickBoardInForce([
    { board: "2027", inForce: null, upcoming: next },
    { board: "2026", inForce: current, upcoming: null },
  ]);
  assert.equal(result.timetable, "2026");
  assert.equal(result.inForce, current);
  assert.equal(result.upcoming, next);
});

test("once the next-year version is in force, the newer board wins", () => {
  const next = v("2027-04-01");
  const result = pickBoardInForce([{ board: "2027", inForce: next, upcoming: null }, { board: "2026", inForce: v("2026-04-01"), upcoming: null }]);
  assert.equal(result.timetable, "2027");
});

test("with nothing in force anywhere, the newest board and its upcoming version stand", () => {
  const next = v("2027-04-01");
  const result = pickBoardInForce([{ board: "2027", inForce: null, upcoming: next }, { board: "2026", inForce: null, upcoming: null }]);
  assert.deepEqual([result.timetable, result.inForce, result.upcoming], ["2027", null, next]);
});

test("the soonest scheduled change across the current and newer boards is upcoming", () => {
  const sameYear = v("2026-09-01"), nextYear = v("2027-04-01");
  const result = pickBoardInForce([{ board: "2027", inForce: null, upcoming: nextYear }, { board: "2026", inForce: v("2026-04-01"), upcoming: sameYear }]);
  assert.equal(result.upcoming, sameYear);
});
