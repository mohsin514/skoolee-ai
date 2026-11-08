import assert from "node:assert/strict";
import { test } from "node:test";
import { overlapMinutesOf } from "@/lib/integrations/service";

test("credential overlap windows are whole minutes within one day", () => {
  assert.equal(overlapMinutesOf(undefined), 60);
  assert.equal(overlapMinutesOf(0), 0);
  assert.equal(overlapMinutesOf("90"), 90);
  assert.equal(overlapMinutesOf(1440), 1440);
  for (const bad of ["abc", 1.5, 2.25, -1, 1441, {}]) {
    assert.throws(() => overlapMinutesOf(bad), { message: "overlapMinutes must be a whole number of minutes from 0 to 1440" }, String(bad));
  }
});
