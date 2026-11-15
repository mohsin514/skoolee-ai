import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-2101: fine/discount on the collect desk were stored and printed on the receipt but never applied to the invoice.
// They are now refused before anything is read or written.
class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
let invoiceReads = 0;
mock.module("@/lib/db/prisma", { namedExports: { prisma: { invoice: { findFirst: async () => { invoiceReads++; return null; } } } } });
mock.module("@/lib/api/scope", { namedExports: { ApiError, resolveCampusId: async () => "campus-1" } });
mock.module("@/lib/fees/payment", { namedExports: { recordPayment: async () => { throw new Error("must not record"); } } });
mock.module("@/lib/datetime", { namedExports: { schoolToday: async () => "2026-11-15" } });
mock.module("@/lib/school-ai/delivery-policy", { namedExports: { DELIVERY_POLICY_KIND: "x", resolveDeliveryPolicy: async () => null } });

const collectPaymentCore = (...args: [never, Record<string, unknown>]) => import("@/lib/fees/collect-command").then((m) => m.collectPaymentCore(...args));
const user = { userId: "u1", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-1" } as never;
const base = { studentId: "s1", invoiceId: "i1", amount: 100, paymentMethod: "CASH", idempotencyKey: "key-12345678" };

for (const extra of [{ discountAmount: 300 }, { fineAmount: 200 }, { discountAmount: 500, fineAmount: 200 }]) {
  test(`collect refuses ${JSON.stringify(extra)} with 400 and posts nothing`, async () => {
    await assert.rejects(collectPaymentCore(user, { ...base, ...extra }), (e: ApiError) => e.status === 400 && /adjustments/.test(e.message));
    assert.equal(invoiceReads, 0);
  });
}

test("zero fine and discount are still accepted past validation", async () => {
  await collectPaymentCore(user, { ...base, fineAmount: 0, discountAmount: 0 }).then(() => assert.fail("expected 404"), (e: ApiError) => assert.equal(e.status, 404));
  assert.equal(invoiceReads, 1);
});
