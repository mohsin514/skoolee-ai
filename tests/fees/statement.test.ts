import assert from "node:assert/strict";
import { test } from "node:test";
import { dueState, reconcileStatement, schoolToday } from "../../src/lib/fees/statement";

// SKO-431: due dates in the school's timezone, future instalments never overdue, cancelled invoices
// carry no charge, and every statement reconciles.
test("today is the school's calendar date, not the server's", () => {
  const instant = new Date("2026-10-31T21:30:00Z");
  assert.equal(schoolToday("Asia/Karachi", instant), "2026-11-01");
  assert.equal(schoolToday("America/New_York", instant), "2026-10-31");
  assert.equal(schoolToday("Not/AZone", instant), "2026-10-31", "an invalid zone falls back to UTC");
});
test("a part-paid invoice due in the future is not overdue; one past due is", () => {
  const today = "2026-11-01";
  assert.equal(dueState({ status: "PARTIAL", balanceDue: 500, dueDate: "2026-11-15" }, today), "NOT_YET_DUE");
  assert.equal(dueState({ status: "PARTIAL", balanceDue: 500, dueDate: "2026-10-31" }, today), "OVERDUE");
  assert.equal(dueState({ status: "PENDING", balanceDue: 500, dueDate: today }, today), "DUE_TODAY");
  assert.equal(dueState({ status: "PAID", balanceDue: 0, dueDate: "2026-01-01" }, today), "PAID");
  assert.equal(dueState({ status: "CANCELLED", balanceDue: 900, dueDate: "2026-01-01" }, today), "CANCELLED");
});
test("opening + charges − payments = closing = outstanding, with cancelled invoices excluded", () => {
  const result = reconcileStatement([
    { id: "a", status: "PARTIAL", totalAmount: 10000, totalAmountPaid: 4000, balanceDue: 6000, dueDate: "2026-10-01" },
    { id: "b", status: "PENDING", totalAmount: 50000, totalAmountPaid: 0, balanceDue: 50000, dueDate: "2026-12-01" },
    { id: "c", status: "PAID", totalAmount: 20000, totalAmountPaid: 25000, balanceDue: 0, dueDate: "2026-09-01" },
    { id: "d", status: "CANCELLED", totalAmount: 7000, totalAmountPaid: 0, balanceDue: 7000, dueDate: "2026-08-01" },
  ], "2026-11-01");
  assert.deepEqual([result.charges, result.payments, result.closing, result.outstanding, result.reconciles], [80000, 24000, 56000, 56000, true]);
  assert.deepEqual([result.overdue, result.notYetDue, result.dueToday], [6000, 50000, 0]);
  assert.deepEqual(result.states, { a: "OVERDUE", b: "NOT_YET_DUE", c: "PAID", d: "CANCELLED" });
});
test("a ledger that does not add up is reported, not hidden", () => {
  const result = reconcileStatement([{ id: "x", status: "PARTIAL", totalAmount: 10000, totalAmountPaid: 4000, balanceDue: 5000, dueDate: "2026-10-01" }], "2026-11-01");
  assert.equal(result.reconciles, false);
});
test("with an approved plan only past-due instalments count as overdue", () => {
  const result = reconcileStatement([{ id: "p", status: "PARTIAL", totalAmount: 1000, totalAmountPaid: 450, balanceDue: 550, dueDate: "2026-10-01",
    installments: [{ state: "PAID", remaining: 0 }, { state: "OVERDUE", remaining: 150 }, { state: "NOT_YET_DUE", remaining: 400 }] }], "2026-11-10");
  assert.deepEqual([result.overdue, result.notYetDue, result.states.p, result.reconciles], [150, 400, "OVERDUE", true]);
  const ahead = reconcileStatement([{ id: "q", status: "PARTIAL", totalAmount: 600, totalAmountPaid: 400, balanceDue: 200, dueDate: "2026-09-01",
    installments: [{ state: "PAID", remaining: 0 }, { state: "PART_PAID", remaining: 200 }] }], "2026-10-17");
  assert.deepEqual([ahead.overdue, ahead.notYetDue, ahead.states.q], [0, 200, "NOT_YET_DUE"], "the invoice's original due date no longer applies");
});
