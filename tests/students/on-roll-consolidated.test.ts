import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOnRoll } from "@/components/insights/metrics";

test("SKAI-1493: consolidated aliases are off-roll in client analytics, like the roster", () => {
  assert.equal(isOnRoll({ status: "consolidated" }), false);
  assert.equal(isOnRoll({ status: "CONSOLIDATED" }), false, "lowercase normalisation");
  for (const status of ["inactive", "archived", "transferred", "graduated"]) assert.equal(isOnRoll({ status }), false, status);
  assert.equal(isOnRoll({ status: "active" }), true, "surviving identity stays on roll");
  assert.equal(isOnRoll({}), true);
});

test("SKAI-1493: the server dashboard ON_ROLL predicate is the roster's", () => {
  const source = readFileSync("src/app/actions/dashboard.ts", "utf8");
  assert.match(source, /const ON_ROLL = rosterStatusWhere\(false\) satisfies Prisma\.StudentWhereInput;/);
});
