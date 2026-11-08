import assert from "node:assert/strict";
import { mock, test } from "node:test";

// One stored profile; updateMany behaves like a compare-and-set on contractedPeriodsPerWeek.
let stored: number | null = 20;
let audits = 0;
const db = {
  user: { findFirst: async () => ({ id: "t1", staffProfile: { contractedPeriodsPerWeek: stored } }) },
  staffProfile: {
    updateMany: async ({ where, data }: { where: { contractedPeriodsPerWeek: number | null }; data: { contractedPeriodsPerWeek: number | null } }) => {
      if (where.contractedPeriodsPerWeek !== stored) return { count: 0 };
      stored = data.contractedPeriodsPerWeek; return { count: 1 };
    },
    create: async () => { throw new Error("unexpected create"); },
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: {} } });
mock.module("@/lib/school-ai/repository", { namedExports: { createWorkspaceRecord: async () => ({}) } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => { audits += 1; } } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (d: typeof db) => unknown) => fn(db) } });
mock.module("@/lib/cover/travel", { namedExports: { otherCampusClashes: () => [], TRAVEL_MINUTES: 0 } });

const user = { userId: "p1", schoolId: "school-a", campusId: "c1", role: "PRINCIPAL" } as never;
const load = async () => (await import("../../src/lib/staff/workload")).setCapacity;

test("two sessions that read 20: the first save wins, the stale second gets a 409 and does not overwrite", async () => {
  stored = 20; audits = 0;
  const setCapacity = await load();
  assert.deepEqual(await setCapacity(user, "c1", "t1", 24, 20), { capacity: 24 });
  await assert.rejects(setCapacity(user, "c1", "t1", 18, 20), (error: { status: number; code: string }) => error.status === 409 && error.code === "CAPACITY_CONFLICT");
  assert.equal(stored, 24);
  assert.equal(audits, 1);
});

test("retry after the 409 with the current value succeeds; a repeated identical save is a no-op without a second audit", async () => {
  stored = 24; audits = 0;
  const setCapacity = await load();
  assert.deepEqual(await setCapacity(user, "c1", "t1", 18, 24), { capacity: 18 });
  assert.deepEqual(await setCapacity(user, "c1", "t1", 18, 18), { capacity: 18 });
  assert.equal(audits, 1);
});

test("a save without the value the editor read is refused", async () => {
  const setCapacity = await load();
  await assert.rejects(setCapacity(user, "c1", "t1", 18, undefined), (error: { status: number }) => error.status === 400);
});
