import assert from "node:assert/strict";
import { test } from "node:test";
import { financeOperationProposalSchema, projectRevenue } from "../../src/lib/school-ai/finance-operations";
import { applyInvoiceCarry } from "../../src/lib/school-ai/fee-invoices";
import { financeOperationsCopy } from "../../src/components/school-ai/finance-operations-copy";
const base = { operation: "finance.apply_operation", currency: "PKR", reason: "Reviewed statement" };
test("finance proposals reject bad dates, unsafe money and additional unreviewed instructions", () => {
  const proposal = { ...base, action: "PAYMENT", invoiceId: "inv", amount: 100, date: "2026-10-13", method: "CASH", reference: "receipt-1" };
  assert.equal(financeOperationProposalSchema.safeParse(proposal).success, true);
  for (const patch of [{ date: "2026-02-30" }, { amount: -1 }, { amount: 1.1 }, { amount: 2147483648 }, { executeSql: "forbidden" }, { reference: "" }]) assert.equal(financeOperationProposalSchema.safeParse({ ...proposal, ...patch }).success, false);
});
test("bank statements require signed conservation, unique evidence and real bounded periods", () => {
  const p = { ...base, action: "RECONCILE", bankAccountId: "bank", from: "2026-10-01", to: "2026-10-31", openingBalance: 200, closingBalance: 250, rows: [{ reference: "credit", date: "2026-10-10", amount: 100, ledgerId: "one" }, { reference: "debit", date: "2026-10-11", amount: -50, ledgerId: "two" }] };
  assert.equal(financeOperationProposalSchema.safeParse(p).success, true);
  for (const patch of [{ closingBalance: 251 }, { rows: [p.rows[0], p.rows[0]] }, { from: "2024-01-01" }, { rows: [{ ...p.rows[0], date: "2026-11-01" }] }]) assert.equal(financeOperationProposalSchema.safeParse({ ...p, ...patch }).success, false);
});
test("revenue scenario uses exact integer basis points and explicit evidence days", () => {
  assert.deepEqual(projectRevenue(120000, 60000, 365, { months: 12, feeGrowthBps: 1000, collectionBps: 9000, expenseGrowthBps: 1000 }), { projectedIncome: 118800, projectedExpense: 66000, projectedNet: 52800 });
  assert.deepEqual(projectRevenue(120000, 60000, 365, { months: 12, feeGrowthBps: -10000, collectionBps: 10000, expenseGrowthBps: -10000 }), { projectedIncome: 0, projectedExpense: 0, projectedNet: 0 });
  assert.throws(() => projectRevenue(1, 1, 0, { months: 12, feeGrowthBps: 0, collectionBps: 10000, expenseGrowthBps: 0 }));
});
test("refund selection cannot be zero and every finance label has EN AR UR text", () => {
  assert.equal(financeOperationProposalSchema.safeParse({ ...base, action: "REFUND", paymentId: "pay", invoiceAmount: 0, creditAmount: 0, date: "2026-10-13", reference: "refund-1" }).success, false);
  for (const language of ["en", "ar", "ur"] as const) for (const value of Object.values(financeOperationsCopy(language))) assert.ok(value.length > 0);
});

test("carry consumption preserves source fee and discount amounts and carries unused credit", () => {
  const a = { monthlyFee: 10000, oneTimeFees: 0, subtotal: 10000, discountAmount: 1000, totalAmount: 9000 };
  assert.deepEqual(applyInvoiceCarry(a, -10000), { ...a, totalAmount: 0, carryBefore: -10000, carryForwardAmount: -9000, carryRemaining: -1000 });
  assert.deepEqual(applyInvoiceCarry(a, 2000), { ...a, totalAmount: 11000, carryBefore: 2000, carryForwardAmount: 2000, carryRemaining: 0 });
  assert.throws(() => applyInvoiceCarry(a, 2147483647));
});
