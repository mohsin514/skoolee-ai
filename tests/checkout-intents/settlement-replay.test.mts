import { mock, test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// SKAI-157: package checkout settlement. An in-memory store stands in for the database so replayed webhooks,
// concurrent confirmations and cross-school references are checked without a network or real payment.
type Row = Record<string, unknown> & { id: string; schoolId: string };
const db = { intents: [] as Row[], locks: [] as string[], activations: [] as string[] };
let queue = Promise.resolve();
const tx = {
  $queryRaw: async (_s: TemplateStringsArray, id: string) => { db.locks.push(id); },
  onboardingCheckoutIntent: {
    findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => db.intents.find(r => r.id === where.id && r.schoolId === where.schoolId) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(db.intents.find(r => r.id === where.id)!, data),
  },
  school: { update: async () => undefined },
};
// Transactions run one at a time, which is what the FOR UPDATE row lock guarantees in Postgres.
const prisma = { $transaction: (fn: (t: typeof tx) => Promise<unknown>) => { const run = queue.then(() => fn(tx)); queue = run.then(() => undefined, () => undefined); return run; } };
mock.module(import.meta.resolve("../../src/lib/db/prisma.ts"), { namedExports: { prisma } });
mock.module(import.meta.resolve("../../src/lib/db/tenant-context.ts"), { namedExports: { runWithTenantContext: (_c: unknown, fn: () => unknown) => fn() } });
mock.module(import.meta.resolve("../../src/lib/billing/entitlements.ts"), { namedExports: { activatePlan: async (schoolId: string, plan: string) => { db.activations.push(`${schoolId}:${plan}`); } } });
const { settleVerifiedCheckoutIntent, packageContract, checkoutAmount } = await import("../../src/lib/billing/checkout-intents");
const { COMMERCIAL_CONTRACT } = await import("../../src/config/commercial-contract");

const intent = (id: string, schoolId: string, changes: Partial<Row> = {}): Row => ({
  id, schoolId, plan: "BASIC", billingPeriod: "monthly", provider: "SAFEPAY", providerReference: `ORDER-${id}`,
  status: "CHECKOUT_PENDING", catalogueVersion: COMMERCIAL_CONTRACT.version, contractSnapshot: packageContract("BASIC"),
  amount: checkoutAmount(packageContract("BASIC"), "monthly"), ...changes,
});
const confirm = (id: string, schoolId: string, extra: Record<string, unknown> = {}) => settleVerifiedCheckoutIntent({
  id, schoolId, provider: "SAFEPAY", providerReference: `ORDER-${id}`, plan: "BASIC", billingPeriod: "monthly", ...extra,
} as never);

beforeEach(() => {
  db.intents = [intent("intent-a", "school-a"), intent("intent-b", "school-b")];
  db.locks = []; db.activations = [];
});

test("a replayed confirmation activates the package once and reports the duplicate", async () => {
  assert.deepEqual(await confirm("intent-a", "school-a"), { settled: true, duplicate: false });
  assert.deepEqual(await confirm("intent-a", "school-a"), { settled: true, duplicate: true });
  assert.deepEqual(db.activations, ["school-a:BASIC"]);
  assert.equal(db.intents[0].status, "SETTLED");
});

test("concurrent confirmations lock the order row and charge no second effect", async () => {
  const results = await Promise.all([1, 2, 3].map(() => confirm("intent-a", "school-a")));
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.deepEqual(db.activations, ["school-a:BASIC"]);
  assert.ok(db.locks.every(id => id === "intent-a") && db.locks.length === 3, "every confirmation takes the row lock first");
});

test("another school's order reference is not found and changes nothing", async () => {
  await assert.rejects(confirm("intent-b", "school-a"), /not found/);
  assert.equal(db.intents[1].status, "CHECKOUT_PENDING");
  assert.deepEqual(db.activations, []);
});

test("a confirmation that does not match the saved order is refused", async () => {
  await assert.rejects(confirm("intent-a", "school-a", { providerReference: "ORDER-forged" }), /does not match/);
  await assert.rejects(confirm("intent-a", "school-a", { plan: "PRO" }), /does not match/);
  db.intents[0].amount = 1;
  await assert.rejects(confirm("intent-a", "school-a"), /commercial terms/);
  assert.deepEqual(db.activations, []);
});

test("a cancelled or unpaid order can never be settled", async () => {
  for (const status of ["CANCELLED", "PENDING", "CUSTOM_QUOTE"]) {
    db.intents[0].status = status;
    await assert.rejects(confirm("intent-a", "school-a"), /does not match/);
  }
  assert.deepEqual(db.activations, []);
});
