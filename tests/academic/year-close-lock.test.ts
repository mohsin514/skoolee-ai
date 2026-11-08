import { readFileSync } from "node:fs";
import { test } from "node:test";
import { strict as assert } from "node:assert";

// SKAI-1439: closing a year checks the closure and writes inside one locked transaction.
const route = readFileSync("src/app/api/academic-year/route.ts", "utf8");
const close = route.slice(route.indexOf('if (action === "close-year")'), route.indexOf('if (action === "promote")'));

test("SKAI-1439: close-year holds the campus lock and re-checks the closure inside the transaction", () => {
  assert.match(close, /schoolAiTransaction\(user, async \(tx\) => \{\s*await lockTimetableCampus\(tx, user\.schoolId, campusId\);\s*const closure = await getYearClosureReport\(campusId, year, tx\);/);
});

test("SKAI-1439: class reads and writes use the locked transaction, not the outer client", () => {
  assert.doesNotMatch(close, /prisma\.(class|student|studentClassHistory)\./);
  assert.match(close, /tx\.class\.findMany/);
  assert.match(close, /tx\.class\.update/);
});
