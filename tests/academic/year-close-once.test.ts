import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1680: closing an academic year is serialised and claims its classes once, so a second close rolls back.
const source = readFileSync("src/app/api/academic-year/route.ts", "utf8");
const tx = source.slice(source.indexOf("const closed = await schoolAiTransaction(user, async (tx) => {"));

test("close takes a campus/year lock and claims ACTIVE classes before writing history", () => {
  const lock = tx.indexOf("pg_advisory_xact_lock(hashtext(${`academic-year-close:${user.schoolId}:${campusId}:${academicYear}`}))");
  const claim = tx.indexOf('tx.class.updateMany({ where: { id: { in: classes.map((cls) => cls.id) }, campusId, status: "ACTIVE" }, data: { status: "COMPLETED" } })');
  const history = tx.indexOf("tx.studentClassHistory.upsert(");
  assert.ok(lock > 0 && claim > lock && history > claim);
});

test("a close that finds its classes already completed is a 409 before notifying", () => {
  assert.match(tx, /if \(claimed\.count !== classes\.length\) throw new ApiError\(`Academic year \$\{academicYear\} was just closed in another session\. Reload to see the closed year\.`, 409\);/);
  assert.doesNotMatch(tx, /await tx\.class\.update\(\{\s+where: \{ id: cls\.id \},/);
  assert.ok(source.indexOf("claimed.count !== classes.length") < source.indexOf('notify("ACADEMIC_YEAR_CLOSED"'));
});
