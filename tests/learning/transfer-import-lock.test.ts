import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1558: concurrent first imports for the same learner and source replay instead of failing.
const src = readFileSync("src/lib/learning/transfer.ts", "utf8");
const body = src.slice(src.indexOf("export async function importTransfer"), src.indexOf("export async function getTransfer"));

test("the import takes a per-key advisory lock before looking up the case", () => {
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(");
  assert.ok(lock > 0 && lock < body.indexOf("tx.learningTransferCase.findUnique"));
  assert.match(body, /learning-transfer:\$\{key\.schoolId\}:\$\{key\.studentId\}:\$\{key\.sourceInstitution\}:\$\{key\.sourceLearnerRef\}/);
  assert.match(body, /existing\?\.sourceHash === hash\) return \{ id: existing\.id, replayed: true/);
});
