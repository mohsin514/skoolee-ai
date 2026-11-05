import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1772: two concurrent orders that share an idempotency key serialise; an identical one replays the first,
// a different meal with the same key gets 409, and only one order and one charge are stored.
type Order = { id: string; schoolId: string; idempotencyKey: string; orderedById: string; itemId: string; studentId: string; quantity: number };
const orders: Order[] = [], charges: unknown[] = [];
const future = new Date("2026-12-01T00:00:00Z");
const items = ["meal-1", "meal-2", "meal-b"].map((id) => ({ id, schoolId: id === "meal-b" ? "school-b" : "school-a", campusId: id === "meal-b" ? "campus-b1" : "campus-a1", status: "ACTIVE", price: 5, currency: "USD", capacity: 50, sold: 0, allergens: [] as string[], serviceDate: id === "meal-2" ? new Date("2026-12-02T00:00:00Z") : future }));
const students = [{ id: "kid-a", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Learner A" }, { id: "kid-b", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Learner B" }];
const locks = new Map<string, Promise<void>>();
const byKey = ({ where }: { where: { schoolId_idempotencyKey: { schoolId: string; idempotencyKey: string } } }) => orders.find((o) => o.schoolId === where.schoolId_idempotencyKey.schoolId && o.idempotencyKey === where.schoolId_idempotencyKey.idempotencyKey) ?? null;
const base = {
  campusPackage: { findUnique: async ({ where }: { where: { campusId_package: { campusId: string } } }) => ({ schoolId: where.campusId_package.campusId === "campus-b1" ? "school-b" : "school-a", status: "ENABLED", operators: {} }) },
  canteenItem: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId: string } }) => items.find((i) => i.id === where.id && i.schoolId === where.schoolId && i.campusId === where.campusId) ?? null },
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => students.find((s) => s.id === where.id && s.schoolId === where.schoolId) ?? null },
  dietaryRecord: { findUnique: async () => null },
  canteenOrder: { findUnique: async (a: never) => byKey(a) },
};
const tx = (release: { fn: () => void }) => ({
  $executeRaw: async (_s: TemplateStringsArray, key: string) => {
    while (locks.has(key)) await locks.get(key);
    let done = () => {};
    locks.set(key, new Promise<void>((r) => { done = () => { locks.delete(key); r(); }; }));
    const prev = release.fn; release.fn = () => { prev(); done(); };
  },
  canteenOrder: {
    findUnique: async (a: never) => byKey(a),
    create: async ({ data }: { data: Omit<Order, "id"> }) => {
      await new Promise((r) => setTimeout(r, 5));
      if (orders.some((o) => o.schoolId === data.schoolId && o.idempotencyKey === data.idempotencyKey)) throw Object.assign(new (await import("@prisma/client")).Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" }));
      const row = { id: `ord-${orders.length + 1}`, ...data }; orders.push(row); return row;
    },
  },
  canteenSpendLimit: { findUnique: async () => null },
  canteenItem: { updateMany: async () => ({ count: 1 }) },
  canteenLedgerEntry: { create: async ({ data }: { data: unknown }) => { charges.push(data); return data; } },
});
const prisma = { ...base, $transaction: async <T>(fn: (t: unknown) => Promise<T>) => { const release = { fn: () => {} }; try { return await fn(tx(release)); } finally { release.fn(); } } };
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ schoolId, guardianUserId }: { schoolId: string; guardianUserId: string }) => guardianUserId === `parent-${schoolId.slice(-1)}` } });
mock.module("@/lib/dormitory/allocations", { namedExports: { campusToday: async () => new Date("2026-11-05T00:00:00Z") } });

const parent = (s: "a" | "b") => ({ userId: `parent-${s}`, schoolId: `school-${s}`, campusId: `campus-${s}1`, role: "PARENT" }) as never;
const reset = () => { orders.length = 0; charges.length = 0; };
const order = (itemId: string, key = "qa-key-0001", studentId = "kid-a") => ({ studentId, itemId, quantity: 1, idempotencyKey: key });

test("concurrent same key, different meal: one order, the other gets 409", async () => {
  const { placeOrder } = await import("../../src/lib/campus-packages/service");
  reset();
  const results = await Promise.allSettled([placeOrder(parent("a"), order("meal-1")), placeOrder(parent("a"), order("meal-2"))]);
  const ok = results.filter((r) => r.status === "fulfilled"), bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  assert.equal((bad[0].reason as { status?: number }).status, 409);
  assert.equal(orders.length, 1);
  assert.equal(charges.length, 1);
});

test("concurrent identical retries: one order and one charge, the second replays it", async () => {
  const { placeOrder } = await import("../../src/lib/campus-packages/service");
  reset();
  const [x, y] = await Promise.all([placeOrder(parent("a"), order("meal-1")), placeOrder(parent("a"), order("meal-1"))]);
  assert.equal(x.order.id, y.order.id);
  assert.deepEqual([x.replayed, y.replayed].sort(), [false, true]);
  assert.equal(orders.length, 1);
  assert.equal(charges.length, 1);
});

test("the same key in another school is its own order", async () => {
  const { placeOrder } = await import("../../src/lib/campus-packages/service");
  reset();
  await placeOrder(parent("a"), order("meal-1"));
  const b = await placeOrder(parent("b"), order("meal-b", "qa-key-0001", "kid-b"));
  assert.equal(b.replayed, false);
  assert.equal(orders.length, 2);
});

test("a guardian of another school, or a staff role, is refused", async () => {
  const { placeOrder } = await import("../../src/lib/campus-packages/service");
  reset();
  await assert.rejects(placeOrder(parent("b"), order("meal-1", "qa-key-0002")), (e: { status?: number }) => e.status === 404);
  const teacher = { userId: "t1", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
  await assert.rejects(placeOrder(teacher, order("meal-1", "qa-key-0003")), (e: { status?: number }) => e.status === 404);
  assert.equal(orders.length, 0);
});
