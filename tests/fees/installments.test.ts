import assert from "node:assert/strict";
import { test } from "node:test";
import { installmentStates, settledTowardPlan, splitEvenly, validatePlan } from "../../src/lib/fees/installments";

// SKO-431: instalment schedules add up exactly, never put a future instalment overdue, and allocate
// payments in date order.
test("an even split keeps every minor unit and clamps month-end dates", () => {
  const plan = splitEvenly(100000, 3, "2026-01-31");
  assert.deepEqual(plan, [{ dueDate: "2026-01-31", amount: 33333 }, { dueDate: "2026-02-28", amount: 33333 }, { dueDate: "2026-03-31", amount: 33334 }]);
  assert.equal(validatePlan(plan, 100000, "2026-01-15"), null);
});
test("schedules that do not add up, are out of order, start in the past or have one instalment are refused", () => {
  assert.match(validatePlan([{ dueDate: "2026-11-01", amount: 500 }, { dueDate: "2026-12-01", amount: 400 }], 1000, "2026-10-17")!, /add up exactly/);
  assert.match(validatePlan([{ dueDate: "2026-12-01", amount: 500 }, { dueDate: "2026-11-01", amount: 500 }], 1000, "2026-10-17")!, /in order/);
  assert.match(validatePlan([{ dueDate: "2026-10-01", amount: 500 }, { dueDate: "2026-11-01", amount: 500 }], 1000, "2026-10-17")!, /before today/);
  assert.match(validatePlan([{ dueDate: "2026-11-01", amount: 1000 }], 1000, "2026-10-17")!, /between 2 and 24/);
  assert.match(validatePlan([{ dueDate: "2026-02-30", amount: 500 }, { dueDate: "2026-03-01", amount: 500 }], 1000, "2026-01-01")!, /valid due date/);
});
test("payments fill instalments in date order; only past-due unpaid amounts are overdue", () => {
  const states = installmentStates([{ dueDate: "2026-10-01", amount: 300 }, { dueDate: "2026-11-01", amount: 300 }, { dueDate: "2026-12-01", amount: 400 }], 450, "2026-11-10");
  assert.deepEqual(states.map(s => [s.paid, s.remaining, s.state]), [[300, 0, "PAID"], [150, 150, "OVERDUE"], [0, 400, "NOT_YET_DUE"]]);
  const early = installmentStates([{ dueDate: "2026-11-01", amount: 300 }, { dueDate: "2026-12-01", amount: 300 }], 400, "2026-10-17");
  assert.deepEqual(early.map(s => s.state), ["PAID", "PART_PAID"], "a part-paid future instalment is not overdue");
});

test("SKAI-2206: a waiver after the plan reduces what the instalments still ask for", () => {
  const plan = [{ dueDate: "2026-11-25", amount: 50000 }, { dueDate: "2026-12-25", amount: 50000 }];
  // Waiver of 30000 applied, nothing paid: the instalments ask for the 70000 still owed.
  const waived = installmentStates(plan, settledTowardPlan(plan, 70000), "2026-11-20");
  assert.equal(waived.reduce((sum, item) => sum + item.remaining, 0), 70000);
  // Then the full 70000 paid: the invoice is PAID and no instalment stays open.
  const paid = installmentStates(plan, settledTowardPlan(plan, 0), "2026-12-30");
  assert.deepEqual(paid.map(item => item.state), ["PAID", "PAID"]);
});
