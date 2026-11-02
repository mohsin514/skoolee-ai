import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1571: concurrent rule publications must serialize on a per-school lock before reading the latest version.
test("publishRule locks the school before reading the latest rule version", () => {
  const src = readFileSync("src/lib/attendance/register.ts", "utf8");
  const body = src.slice(src.indexOf("export async function publishRule"), src.indexOf("async function assignedClass"));
  const lock = body.indexOf("pg_advisory_xact_lock(hashtext(${`attendance-rule:${user.schoolId}`}))");
  const read = body.indexOf("attendanceRuleVersion.findFirst");
  assert.ok(lock > 0, "advisory lock present and keyed by school");
  assert.ok(lock < read, "lock taken before the latest version is read");
});
