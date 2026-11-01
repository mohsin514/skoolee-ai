import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1554: the case is claimed before the learning action is drafted, so a lost race creates nothing.
const src = readFileSync("src/lib/learning/transfer.ts", "utf8");
const body = src.slice(src.indexOf("export async function createBridge"), src.indexOf("export async function exportTransfer"));

test("claim happens in the preparation transaction, before saveLearningAction", () => {
  const claim = body.indexOf("const claimed = await tx.learningTransferCase.updateMany({ where: { id: row.id, schoolId: user.schoolId, version: input.version }");
  assert.ok(claim > 0 && claim < body.indexOf("saveLearningAction("));
  assert.match(body, /if \(claimed\.count !== 1\) throw new ApiError\([^)]*, 409\)/);
});

test("the final link is guarded by the claimed version", () => {
  assert.match(body, /version: input\.version \+ 1 \}, data: \{ bridge:/);
});
