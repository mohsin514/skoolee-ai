import assert from "node:assert/strict";
import test from "node:test";
import { parsePayrollPeriod, parsePayrollRole } from "@/lib/payroll-period";

test("SKAI-1429: whole-number periods at the boundaries are accepted", () => {
  assert.deepEqual(parsePayrollPeriod("1", "2000"), { month: 1, year: 2000 });
  assert.deepEqual(parsePayrollPeriod(12, 2100), { month: 12, year: 2100 });
  assert.deepEqual(parsePayrollPeriod(" 3 ", "2027"), { month: 3, year: 2027 });
});

test("SKAI-1429: fractions, trailing characters and out-of-range periods are 400", () => {
  for (const [m, y] of [["3.9", "2027"], [3.9, 2027], ["3", "2027.8"], ["3abc", "2027"], ["3", "2027junk"], ["0", "2027"], ["13", "2027"], ["3", "1999"], [null, "2027"], ["", ""], ["-3", "2027"]]) {
    assert.throws(() => parsePayrollPeriod(m, y), (e: { status?: number }) => e.status === 400, `${m}/${y}`);
  }
});

test("SKAI-1429: role filter must be a payroll role", () => {
  assert.equal(parsePayrollRole(undefined), undefined);
  assert.equal(parsePayrollRole(""), undefined);
  assert.equal(parsePayrollRole("teacher"), "TEACHER");
  assert.throws(() => parsePayrollRole("NOT_A_ROLE"), (e: { status?: number }) => e.status === 400);
  assert.throws(() => parsePayrollRole("PARENT"), (e: { status?: number }) => e.status === 400);
});
