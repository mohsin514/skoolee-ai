import assert from "node:assert/strict";
import { test } from "node:test";
import { bankRowKeys, conservationReport } from "../../src/lib/fees/bank-reconciliation";

// SKO-432: transaction identity survives renamed or reformatted files; genuine repeats stay distinct.
test("the same transactions give the same keys regardless of spacing and case", () => {
  const a = bankRowKeys("Main Account", [{ date: "2026-10-01", amountMinor: 5000, description: "Fee INV-1 Ali" }]);
  const b = bankRowKeys(" main account ", [{ date: "2026-10-01", amountMinor: 5000, description: "fee   inv-1 ali" }]);
  assert.deepEqual(a, b);
});
test("two identical transactions on one statement are distinct, and keep their keys on re-import", () => {
  const rows = [{ date: "2026-10-01", amountMinor: 5000, description: "Cash deposit" }, { date: "2026-10-01", amountMinor: 5000, description: "Cash deposit" }];
  const keys = bankRowKeys("Main", rows);
  assert.notEqual(keys[0], keys[1]);
  assert.deepEqual(bankRowKeys("Main", rows), keys);
});
test("money is conserved: received = allocated + credited + unallocated + adjustments", () => {
  assert.deepEqual(conservationReport({ received: [83000], allocated: [75000], credited: [0], unallocated: [8000] }), { received: 83000, allocated: 75000, credited: 0, unallocated: 8000, adjustments: 0, difference: 0, balanced: true });
  assert.equal(conservationReport({ received: [1000], allocated: [900], credited: [], unallocated: [] }).balanced, false);
});
