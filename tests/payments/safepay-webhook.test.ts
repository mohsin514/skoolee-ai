import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1195: the SafePay notification verifies its signature over the raw body before parsing,
// rejects bad input with 400 and no side effects, and stays idempotent on replay.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;
const SECRET = "test_webhook_secret";

const h = {
  calls: [] as string[],
  orders: new Map<string, { id: string; orderRef: string; schoolId: string; campusId: string; invoiceId: string; studentId: string; amount: number; status: string }>(),
  receipts: new Map<string, { eventId: string; state: string; receivedAt: Date }>(),
  payments: [] as unknown[], activations: [] as unknown[],
};
const track = <T extends (...args: never[]) => unknown>(name: string, fn: T) => ((...args: Parameters<T>) => { h.calls.push(name); return fn(...args); }) as T;
const order = {
  findUnique: track("order.findUnique", async ({ where }: { where: { orderRef?: string; id?: string } }) =>
    [...h.orders.values()].find(o => o.orderRef === where.orderRef || o.id === where.id) ?? null),
  update: track("order.update", async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
    const row = [...h.orders.values()].find(o => o.id === where.id)!; Object.assign(row, data); return row;
  }),
};
const receipts = {
  findUnique: track("receipt.findUnique", async ({ where }: { where: { eventId: string } }) => h.receipts.get(where.eventId) ?? null),
  create: track("receipt.create", async ({ data }: { data: { eventId: string; state: string } }) => { h.receipts.set(data.eventId, { ...data, receivedAt: new Date() }); return data; }),
  update: track("receipt.update", async ({ where, data }: { where: { eventId: string }; data: { state: string } }) => { Object.assign(h.receipts.get(where.eventId)!, data); }),
  updateMany: track("receipt.updateMany", async () => ({ count: 0 })),
};
const tx = { $queryRaw: async () => [], onlinePaymentOrder: order, stripeWebhookReceipt: receipts };
const prisma = {
  onlinePaymentOrder: order, stripeWebhookReceipt: receipts,
  school: { findUnique: track("school.findUnique", async () => ({ id: "school-a" })) },
  onboardingCheckoutIntent: { findFirst: track("intent.findFirst", async () => null), updateMany: track("intent.updateMany", async () => ({ count: 0 })) },
  $transaction: track("$transaction", async (work: (t: typeof tx) => unknown) => work(tx)),
};
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runUnscoped: (_r: string, fn: () => unknown) => fn(), runWithTenantContext: (_c: unknown, fn: () => unknown) => fn() } });
mock.module(src("lib/fees/payment.ts"), { namedExports: { recordPayment: async (_tx: unknown, input: unknown) => { h.payments.push(input); return { payment: { id: `pay-${h.payments.length}` } }; } } });
mock.module(src("lib/billing/entitlements.ts"), { namedExports: {
  activatePlan: async (...args: unknown[]) => { h.activations.push(args); },
  getBillingSnapshot: async () => ({ plans: { BASIC: { price: 5000 } } }),
} });
mock.module(src("lib/billing/checkout-intents.ts"), { namedExports: { settleVerifiedCheckoutIntent: async () => { throw new Error("not expected"); } } });

const sign = (payload: Record<string, unknown>) => createHmac("sha256", SECRET).update(JSON.stringify(payload)).digest("hex");
const signed = (payload: Record<string, unknown>) => JSON.stringify({ ...payload, signature: sign(payload) });
const post = async (body: string, headers: Record<string, string> = {}) => {
  const { POST } = await import("../../src/app/api/safepay/notification/route");
  const res = await POST(new Request("http://localhost/api/safepay/notification", { method: "POST", headers: { "content-type": "application/json", ...headers }, body }) as never);
  return { status: res.status, body: await res.json() };
};
const fee = { event: "order.completed", data: { order_ref: "SKLFEE-1", amount: 1500, metadata: { orderRef: "SKLFEE-1", kind: "FEE" } } };

beforeEach(() => {
  process.env.SAFEPAY_SECRET_KEY = SECRET;
  h.calls = []; h.payments = []; h.activations = []; h.receipts.clear();
  h.orders = new Map([["SKLFEE-1", { id: "ord-1", orderRef: "SKLFEE-1", schoolId: "school-a", campusId: "campus-a", invoiceId: "inv-1", studentId: "stu-1", amount: 1500, status: "PENDING" }]]);
});

test("a tampered or unsigned body is rejected with 400 before any read or write", async () => {
  const tampered = JSON.parse(signed(fee)); tampered.data.amount = 1;
  for (const body of [JSON.stringify(tampered), JSON.stringify(fee), JSON.stringify({ ...fee, signature: "0".repeat(64) })]) {
    const res = await post(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "Invalid signature");
  }
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.payments, []);
});

test("malformed JSON is a 400, not a 500, and touches nothing", async () => {
  for (const body of ["{not json", "", "[1,2]", "null"]) assert.equal((await post(body)).status, 400, body);
  assert.deepEqual(h.calls, []);
});

test("a correctly signed body with the wrong shape is a 400 with field errors and no side effects", async () => {
  const bad = { event: 42, data: { order_ref: "SKLFEE-1", metadata: { kind: { nested: true } } } };
  const res = await post(signed(bad));
  assert.equal(res.status, 400);
  assert.ok(res.body.details.event);
  assert.ok(res.body.details["data.metadata.kind"]);
  assert.deepEqual(h.calls, []);
});

test("an oversized body is refused unread", async () => {
  assert.equal((await post(signed({ event: "x", pad: "a".repeat(70_000) }))).status, 413);
  assert.equal((await post("{}", { "content-length": "999999" })).status, 413);
  assert.deepEqual(h.calls, []);
});

test("without SAFEPAY_SECRET_KEY nothing is accepted", async () => {
  delete process.env.SAFEPAY_SECRET_KEY;
  assert.equal((await post(signed(fee))).status, 503);
  assert.deepEqual(h.calls, []);
});

test("a signed fee confirmation settles once; a replay records no second payment", async () => {
  const body = signed(fee);
  assert.deepEqual(await post(body), { status: 200, body: { success: true } });
  assert.equal(h.payments.length, 1);
  assert.equal(h.orders.get("SKLFEE-1")!.status, "COMPLETED");
  assert.deepEqual(await post(body), { status: 200, body: { success: true } });
  assert.equal(h.payments.length, 1, "replayed notification must not pay twice");
});

test("a signed plan purchase activates once; the replay is reported as a duplicate", async () => {
  const plan = { event: "order.completed", data: { order_ref: "SKL-CHG-1", amount: 5000, metadata: { schoolId: "school-a", plan: "BASIC", billingPeriod: "monthly" } } };
  const body = signed(plan);
  assert.equal((await post(body)).status, 200);
  assert.equal(h.activations.length, 1);
  assert.equal(h.receipts.get("safepay:order.completed:SKL-CHG-1")!.state, "PROCESSED");
  assert.deepEqual(await post(body), { status: 200, body: { success: true, duplicate: true } });
  assert.equal(h.activations.length, 1, "replayed notification must not extend the plan twice");
});

// SKAI-1287: the exact replay from the bug report, an annual BASIC order delivered twice.
test("an annual plan order replayed with the same orderRef activates the year once", async () => {
  const annual = { event: "order.completed", data: { order_ref: "QA-REPLAY-001", amount: 48_000, metadata: { schoolId: "school-a", plan: "BASIC", billingPeriod: "annual" } } };
  const body = signed(annual);
  assert.deepEqual(await post(body), { status: 200, body: { success: true } });
  assert.equal(h.activations.length, 1);
  assert.equal((h.activations[0] as unknown[])[3], 365);
  for (let i = 0; i < 3; i++) assert.deepEqual(await post(body), { status: 200, body: { success: true, duplicate: true } });
  assert.equal(h.activations.length, 1, "each replay must leave the paid-through date unchanged");
});
