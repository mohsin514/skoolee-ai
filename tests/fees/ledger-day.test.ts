import assert from "node:assert/strict";
import { test } from "node:test";
import { ledgerDay } from "../../src/lib/fees/ledger-service";

// SKAI-1397: impossible calendar dates must be rejected, not rolled into the next day or period.
test("accepts real calendar days, including leap days", () => {
  assert.equal(ledgerDay("2028-02-29", false)?.toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(ledgerDay("2026-03-31", true)?.toISOString(), "2026-03-31T23:59:59.999Z");
  assert.equal(ledgerDay(null, false), null);
});

test("rejects days that do not exist in the month", () => {
  for (const value of ["2026-02-31", "2026-04-31", "2027-02-29", "2026-02-30", "2026-13-01", "2026-00-10"]) {
    assert.throws(() => ledgerDay(value, false), { message: "Invalid date" }, value);
  }
});

test("rejects non-ISO shapes", () => {
  assert.throws(() => ledgerDay("2026-3-1", false), { message: "Dates must be YYYY-MM-DD" });
});
