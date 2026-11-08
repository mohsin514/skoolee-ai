import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-605: the offer-expiry / waitlist job that runs when a roster is read settles under the activity row lock
// against the activity as it is now, so a read racing a cancellation or a place request never offers a place
// the activity no longer has.
const snapshot = { id: "act-a", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "coord-a", staffIds: [] as string[], status: "PUBLISHED", capacity: 1, offerHours: 24, tripId: null, costAmount: 0 };
let current = { ...snapshot };
const offers: string[] = [];
const locks: string[] = [];
const tx = {
  $queryRaw: async (_s: TemplateStringsArray, id: string, school: string) => { locks.push(`${school}:${id}`); return []; },
  activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => (where.id === current.id && where.schoolId === current.schoolId ? current : null) },
  activityPlace: {
    updateMany: async () => ({ count: 0 }),
    count: async () => 0,
    findMany: async ({ where }: { where: { status: unknown } }) => (where.status === "WAITLIST" ? [{ id: "wait-1" }] : []),
    update: async ({ where, data }: { where: { id: string }; data: { status?: string } }) => { if (data.status === "OFFERED") offers.push(where.id); return {}; },
  },
};
const prisma = {
  activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => (where.id === snapshot.id && where.schoolId === snapshot.schoolId ? snapshot : null) },
  activityPlace: { findMany: async () => [] },
  activitySession: { findMany: async () => [] },
  student: { findMany: async () => [] },
  $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const coord = (school = "school-a") => ({ userId: "coord-a", schoolId: school, campusId: "campus-a1", role: "TEACHER" }) as never;

test("a roster read after the activity was cancelled offers no waitlisted place", async () => {
  const { roster } = await import("../../src/lib/activities/service");
  current = { ...snapshot, status: "CANCELLED" }; offers.length = 0; locks.length = 0;
  await roster(coord(), "act-a").catch(() => undefined);
  assert.deepEqual(locks, ["school-a:act-a"]);
  assert.deepEqual(offers, []);
});

test("a roster read on a live activity with a free place offers it under the lock", async () => {
  const { roster } = await import("../../src/lib/activities/service");
  current = { ...snapshot }; offers.length = 0; locks.length = 0;
  await roster(coord(), "act-a").catch(() => undefined);
  assert.deepEqual(locks, ["school-a:act-a"]);
  assert.deepEqual(offers, ["wait-1"]);
});

test("another school's coordinator cannot trigger the job", async () => {
  const { roster } = await import("../../src/lib/activities/service");
  offers.length = 0; locks.length = 0;
  await assert.rejects(roster(coord("school-b"), "act-a"), (e: { status?: number }) => e.status === 404);
  assert.deepEqual(locks, []);
  assert.deepEqual(offers, []);
});
