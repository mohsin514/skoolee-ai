import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1555: correcting a reference cannot create a second open item with the same reference.
const src = readFileSync("src/lib/front-desk/postal.ts", "utf8");
const correct = src.slice(src.indexOf('if (action === "correct")'), src.indexOf('throw new ApiError("Unknown action"'));

test("the duplicate check runs before the update, scoped to campus, school, direction and other open items", () => {
  const check = correct.indexOf("if (data.referenceNo && !closed)");
  assert.ok(check > 0 && check < correct.indexOf("db.postalRecord.update"));
  assert.match(correct, /FOR UPDATE/);
  assert.match(correct, /direction: item\.direction, status: \{ notIn: CLOSED \}, referenceNo: \{ not: null \}, id: \{ not: id \}/);
  assert.match(correct, /comparable\(row\.referenceNo\) === comparable\(data\.referenceNo!\)/);
  assert.match(correct, /already recorded as \$\{same\.itemCode\}[^)]*, 409\)/);
});
