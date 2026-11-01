import assert from "node:assert/strict";
import { test } from "node:test";
import { isRealDate } from "../../src/lib/validators/fields";
import { bankImportSchema } from "../../src/lib/validators/schemas";

// SKAI-1460: a bank statement period and every row name real calendar dates. 2026-11-31 is refused rather than
// rolled into 1 December, and a period must run forward. The import job and the posting route use the same rule.
const statement = (statementFrom: string, statementTo: string) => bankImportSchema.safeParse({ accountName: "Main", statementFrom, statementTo });
const refused = (from: string, to: string) => assert.equal(statement(from, to).success, false, `${from}..${to} should be refused`);
const accepted = (from: string, to: string) => assert.equal(statement(from, to).success, true, `${from}..${to} should be accepted`);

test("a month-end boundary inside the month is accepted", () => {
  accepted("2026-11-01", "2026-11-30");
  accepted("2026-04-01", "2026-04-30");
  accepted("2026-12-01", "2026-12-31");
});

test("an impossible day in a month is refused as a period bound, not rolled into the next month", () => {
  refused("2026-11-31", "2026-11-30");
  refused("2026-11-01", "2026-11-31");
  refused("2026-04-31", "2026-05-10");
  refused("2026-02-30", "2026-03-10");
});

test("month and day ranges are checked", () => {
  refused("2026-13-01", "2026-13-31");
  refused("2026-00-10", "2026-00-20");
  refused("2026-01-00", "2026-01-31");
});

test("a non-date bound is refused", () => {
  refused("not-a-date", "2026-11-30");
  refused("2026-11-01", "tomorrow");
  refused("", "2026-11-30");
  refused("2026-1-1", "2026-11-30");
});

test("leap years: 29 February exists only in a leap year", () => {
  accepted("2028-02-01", "2028-02-29");
  accepted("2000-02-01", "2000-02-29", );
  refused("2027-02-01", "2027-02-29");
  refused("1900-02-01", "1900-02-29", );
});

test("a period must run forward; the same day is a one-day statement", () => {
  refused("2026-11-30", "2026-11-01");
  accepted("2026-11-15", "2026-11-15");
  const backwards = statement("2026-11-30", "2026-11-01");
  assert.equal(backwards.success, false);
  assert.deepEqual(backwards.error?.issues.map((i) => i.path), [["statementTo"]]);
});

test("the row-level check that the import job and posting route use refuses impossible rows", () => {
  for (const date of ["2026-11-31", "2027-02-29", "2026-04-31", "2026-13-01", "not-a-date", "2026-1-1", ""]) assert.equal(isRealDate(date), false, date);
  for (const date of ["2026-11-30", "2028-02-29", "2000-02-29", "2026-12-31", "2026-01-01"]) assert.equal(isRealDate(date), true, date);
});
