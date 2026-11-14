import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Alloc = { id: string; campusId: string; leaveTypeId: string; academicYear: number; role: string | null; userId: string | null; days: number };
let allocs: Alloc[] = [];
let seq = 0;

// Campus row lock held until the owning transaction ends, as FOR UPDATE does in Postgres.
const locks = new Map<string, Promise<void>>();
async function acquire(key: string): Promise<() => void> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  locks.set(key, previous.then(() => new Promise<void>((r) => (release = r))));
  await previous;
  return release;
}
const pause = () => new Promise((r) => setTimeout(r, 5));
const campusSchool: Record<string, string> = { "campus-a": "school-a", "campus-b": "school-a", "campus-x": "school-b" };
const matches = (a: Alloc, w: Record<string, unknown>) =>
  Object.entries(w).every(([k, v]) => {
    if (k === "campus") return campusSchool[a.campusId] === (v as { schoolId: string }).schoolId;
    if (v && typeof v === "object" && "not" in v) return (a as unknown as Record<string, unknown>)[k] !== (v as { not: unknown }).not;
    return (a as unknown as Record<string, unknown>)[k] === v;
  });
const updateRow = async ({ where, data }: { where: { id: string }; data: Partial<Alloc> }) => {
  await pause();
  const row = allocs.find((a) => a.id === where.id)!;
  Object.assign(row, data);
  return row;
};

function fakeTx(held: Array<() => void>) {
  return {
    $queryRaw: async (_s: TemplateStringsArray, campusId: unknown) => {
      held.push(await acquire(`campus:${campusId}`));
      return [];
    },
    leaveAllocation: {
      findFirst: async ({ where }: { where: Partial<Alloc> }) => {
        await pause();
        return allocs.find((a) => matches(a, where)) ?? null;
      },
      create: async ({ data }: { data: Omit<Alloc, "id"> }) => {
        await pause();
        const row = { id: `la-${++seq}`, ...data };
        allocs.push(row);
        return row;
      },
      update: updateRow,
    },
  };
}

const fakePrisma = {
  leaveType: { findFirst: async ({ where }: { where: { id: string; campusId: string } }) => (where.id.startsWith("lt-") ? { id: where.id } : null) },
  user: { findFirst: async ({ where }: { where: { id: string; campusId: string } }) => (where.id.startsWith("u-") ? { id: where.id } : null) },
  leaveAllocation: {
    findFirst: async ({ where }: { where: Partial<Alloc> }) => {
      await pause();
      return allocs.find((a) => matches(a, where)) ?? null;
    },
    create: async ({ data }: { data: Omit<Alloc, "id"> }) => {
      await pause();
      const row = { id: `la-${++seq}`, ...data };
      allocs.push(row);
      return row;
    },
  },
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const held: Array<() => void> = [];
    try { return await fn(fakeTx(held)); } finally { held.forEach((r) => r()); }
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    resolveCampusId: async (_u: unknown, requested?: string | null) => requested || "campus-a",
  },
});
mock.module("@/lib/leave", { namedExports: { daysToTenths: (d: number) => Math.round(d * 10) } });

const loadCommand = () => import("@/lib/leave/create-allocation-command");
const user = { userId: "admin-1", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" } as never;
const body = (over: Record<string, unknown> = {}) => ({ campusId: "campus-a", leaveTypeId: "lt-1", role: "TEACHER", days: 10, academicYear: 2026, ...over });
const is409 = (e: { status?: number }) => e.status === 409;

test("two simultaneous identical role allocations create one entitlement; the loser gets 409", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  const results = await Promise.allSettled([createLeaveAllocation(user, body()), createLeaveAllocation(user, body())]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const loser = results.find((r): r is PromiseRejectedResult => r.status === "rejected")!;
  assert.ok(is409(loser.reason as never));
  assert.equal(allocs.length, 1);
});

test("a per-user override and a role-wide row for the same type and year are distinct", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  await createLeaveAllocation(user, body());
  await createLeaveAllocation(user, body({ role: null, userId: "u-1" }));
  assert.equal(allocs.length, 2);
});

test("a repeated sequential identical request is refused with 409 and creates nothing", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  await createLeaveAllocation(user, body());
  await assert.rejects(() => createLeaveAllocation(user, body()), is409);
  assert.equal(allocs.length, 1);
});

test("the same allocation on another campus is independent", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  const [a, b] = await Promise.all([createLeaveAllocation(user, body()), createLeaveAllocation({ ...(user as object), campusId: "campus-b" } as never, body({ campusId: "campus-b" }))]);
  assert.notEqual(a.id, b.id);
  assert.equal(allocs.length, 2);
});

const seed = (over: Partial<Alloc> = {}): Alloc => {
  const row = { id: `la-${++seq}`, campusId: "campus-a", leaveTypeId: "lt-1", academicYear: 2026, role: "TEACHER", userId: null, days: 100, ...over };
  allocs.push(row);
  return row;
};

test("PATCH cannot move an allocation onto another allocation's identity", async () => {
  allocs = []; seq = 0;
  const { updateLeaveAllocation } = await loadCommand();
  seed();
  const other = seed({ academicYear: 2025 });
  await assert.rejects(() => updateLeaveAllocation(user, { id: other.id, academicYear: 2026 }), is409);
  assert.equal(other.academicYear, 2025);
  const perUser = seed({ role: null, userId: "u-1" });
  await assert.rejects(() => updateLeaveAllocation(user, { id: perUser.id, role: "TEACHER" }), is409);
  assert.equal(perUser.userId, "u-1");
});

test("two simultaneous PATCHes onto the same free identity: one wins, the other gets 409", async () => {
  allocs = []; seq = 0;
  const { updateLeaveAllocation } = await loadCommand();
  const a = seed({ academicYear: 2024 });
  const b = seed({ academicYear: 2025 });
  const results = await Promise.allSettled([updateLeaveAllocation(user, { id: a.id, academicYear: 2026 }), updateLeaveAllocation(user, { id: b.id, academicYear: 2026 })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(allocs.filter((x) => x.academicYear === 2026).length, 1);
});

test("PATCH days only keeps identity, and another school's allocation is not found", async () => {
  allocs = []; seq = 0;
  const { updateLeaveAllocation } = await loadCommand();
  const row = seed();
  const updated = await updateLeaveAllocation(user, { id: row.id, days: 12 });
  assert.equal(updated.days, 120);
  const foreign = seed({ campusId: "campus-x" });
  await assert.rejects(() => updateLeaveAllocation(user, { id: foreign.id, days: 1 }), (e: { status?: number }) => e.status === 404);
  assert.equal(foreign.days, 100);
});

// SKAI-447: invalid day amounts are refused before any write, on create and on PATCH.
const badDays = (e: { status?: number; message?: string }) => e.status === 400 && e.message === "days must be a positive number of days";

test("SKAI-447: a negative, zero or non-numeric days value is refused with 400 and nothing is created", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  for (const days of [-3, 0, "abc", NaN, {}]) {
    await assert.rejects(() => createLeaveAllocation(user, body({ days, role: "PRINCIPAL" })), badDays);
  }
  assert.equal(allocs.length, 0);
});

test("SKAI-447: a valid fractional days value is stored in tenths", async () => {
  allocs = []; seq = 0;
  const { createLeaveAllocation } = await loadCommand();
  await createLeaveAllocation(user, body({ days: "0.5", role: "PRINCIPAL" }));
  assert.equal(allocs[0].days, 5);
});

test("SKAI-447: PATCH with negative days is refused and the stored allocation is unchanged", async () => {
  allocs = []; seq = 0;
  const { updateLeaveAllocation } = await loadCommand();
  const row = seed({ days: 100 });
  await assert.rejects(() => updateLeaveAllocation(user, { id: row.id, days: -2 }), badDays);
  await assert.rejects(() => updateLeaveAllocation(user, { id: row.id, days: "x" }), badDays);
  assert.equal(row.days, 100);
});
