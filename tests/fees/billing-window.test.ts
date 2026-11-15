import assert from "node:assert/strict";
import { test } from "node:test";
import { monthOutsideCycle } from "../../src/lib/fees/billing-window";

// SKAI-2059: a 2026-27 cycle (2026-04-01..2027-03-31) bills only months inside it.
const cycle = { startDate: new Date("2026-04-01T00:00:00Z"), endDate: new Date("2027-03-31T00:00:00Z") };
const month = (m: string) => { const start = new Date(`${m}-01T00:00:00Z`); return [start, new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))] as const; };

test("months inside the cycle are allowed, including its first and last month", () => {
  for (const m of ["2026-04", "2026-11", "2027-03"]) assert.equal(monthOutsideCycle(cycle, ...month(m)), false, m);
});
test("months before or after the cycle are refused", () => {
  for (const m of ["2026-03", "2027-04", "2027-07", "2030-06", "2100-12"]) assert.equal(monthOutsideCycle(cycle, ...month(m)), true, m);
});
test("a missing cycle or open-ended dates bound nothing", () => {
  assert.equal(monthOutsideCycle(undefined, ...month("2100-12")), false);
  assert.equal(monthOutsideCycle({ startDate: null, endDate: null }, ...month("2100-12")), false);
  assert.equal(monthOutsideCycle({ startDate: cycle.startDate, endDate: null }, ...month("2100-12")), false);
});
