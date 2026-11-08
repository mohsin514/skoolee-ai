import assert from "node:assert/strict";
import { test } from "node:test";
import { explicitDaysToTenths } from "@/lib/leave/apply-command";

test("explicit leave durations must be numeric and positive", () => {
  assert.equal(explicitDaysToTenths(1), 10);
  assert.equal(explicitDaysToTenths("0.5"), 5);
  assert.equal(explicitDaysToTenths(1.5), 15);
  assert.throws(() => explicitDaysToTenths("abc"), { message: "days must be a positive number of days" });
  assert.throws(() => explicitDaysToTenths(-1), { message: "days must be a positive number of days" });
  assert.throws(() => explicitDaysToTenths(0), { message: "days must be a positive number of days" });
  assert.throws(() => explicitDaysToTenths({}), { message: "days must be a positive number of days" });
});
