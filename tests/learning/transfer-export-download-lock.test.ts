import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1582: concurrent exports of one transfer case serialize before reading the downloads array.
test("exportTransfer locks the case before reading and appending downloads", () => {
  const src = readFileSync("src/lib/learning/transfer.ts", "utf8");
  const body = src.slice(src.indexOf("export async function exportTransfer"), src.indexOf("async function guardianCase"));
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`learning-transfer-export:${user.schoolId}:${caseId}`}))");
  const read = body.indexOf("loadCase(tx, user, caseId)");
  const append = body.indexOf("row.downloads as");
  const write = body.indexOf("learningTransferCase.update");
  assert.ok(lock > 0, "lock present, keyed by school and case");
  assert.ok(lock < read && read < append && append < write, "lock, then read, then append and write");
});
