import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1671: concurrent issues to one reader are serialised before the loan-limit count.
const source = readFileSync("src/lib/library/desk.ts", "utf8");
const issue = source.slice(source.indexOf("export async function issueCopy"));

test("the per-reader lock is taken after the member check and before counting open loans", () => {
  const member = issue.indexOf('throw new ApiError("Member not found", 404);');
  const lock = issue.indexOf("pg_advisory_xact_lock(hashtext(${`library-reader-loans:${member.id}`}))");
  const count = issue.indexOf("tx.bookIssue.count({ where: { memberId: member.id, returnedAt: null } })");
  assert.ok(member > 0 && lock > member && count > lock);
});
