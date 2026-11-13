import { test } from "node:test";
import { strict as assert } from "node:assert";
import { employmentFactor } from "../../src/lib/payroll";

// SKAI-1421: legacy payroll pays only for days inside the employment period.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

test("SKAI-1421: a future joiner is prorated to the days employed in the month", () => {
  assert.equal(employmentFactor(day("2027-04-15"), null, 3, 2027), 0);
  assert.equal(employmentFactor(day("2027-03-15"), null, 3, 2027), 17 / 31);
});

test("SKAI-1421: a prior leaver gets nothing for a month after the leaving date", () => {
  assert.equal(employmentFactor(day("2026-01-01"), day("2027-02-15"), 3, 2027), 0);
});

test("SKAI-1421: a leaver in the month is prorated to the leaving day", () => {
  assert.equal(employmentFactor(day("2026-01-01"), day("2027-03-10"), 3, 2027), 10 / 31);
});

test("SKAI-1421: a full month of employment is paid in full", () => {
  assert.equal(employmentFactor(day("2026-01-01"), null, 3, 2027), 1);
  assert.equal(employmentFactor(null, null, 3, 2027), 1);
});
