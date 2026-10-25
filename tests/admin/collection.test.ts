import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionRate, feeBuckets } from "../../src/components/insights/metrics";
const row = (status: string, totalAmount: number, totalAmountPaid?: number) => ({ status, _count: 1, _sum: { totalAmount, totalAmountPaid } });
test("partial invoices count actual receipts, including payments on overdue invoices", () => {
  assert.deepEqual(collectionRate(feeBuckets([row("PARTIAL", 10000, 2500), row("OVERDUE", 10000, 1500)], "PKR")), { collected: 40, billed: 200, rate: 20 });
});
test("cancelled invoices never enter collection or billed totals", () => {
  assert.deepEqual(collectionRate(feeBuckets([row("CANCELLED", 10000, 5000), row("PAID", 10000, 10000)], "PKR")), { collected: 100, billed: 100, rate: 100 });
});
test("currency precision and zero balances remain valid", () => {
  assert.deepEqual(collectionRate(feeBuckets([row("PARTIAL", 1000, 250)], "JPY")), { collected: 250, billed: 1000, rate: 25 });
  assert.deepEqual(collectionRate(feeBuckets([])), { collected: 0, billed: 0, rate: 0 });
});
test("older payloads only infer receipts for fully paid invoices", () => {
  assert.equal(collectionRate(feeBuckets([row("PARTIAL", 10000)], "PKR")).collected, 0);
  assert.equal(collectionRate(feeBuckets([row("PAID", 10000)], "PKR")).collected, 100);
});
