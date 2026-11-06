import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-601: a lost-response retry or second-tab submit of the same new activity leaves one activity.
type Row = { id: string; schoolId: string; campusId: string; coordinatorId: string; kind: string; title: string; startsAt: Date; endsAt: Date; status: string };
const rows: Row[] = [];
const locks = new Map<string, Promise<void>>();
const same = (a: Date, b: unknown) => b instanceof Date && a.getTime() === b.getTime();
const activityModel = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find(r => r.schoolId === where.schoolId && r.campusId === where.campusId && r.coordinatorId === where.coordinatorId && r.kind === where.kind && r.title === where.title && same(r.startsAt, where.startsAt) && same(r.endsAt, where.endsAt) && r.status !== "CANCELLED" && (where.status as { not: string }).not === "CANCELLED") ?? null,
  create: async ({ data }: { data: Omit<Row, "id" | "status"> }) => { await new Promise(r => setTimeout(r, 5)); const row = { id: `a${rows.length + 1}`, status: "PUBLISHED", ...data }; rows.push(row); return row; },
};
const prisma = {
  activity: activityModel,
  class: { count: async () => 0 },
  trip: { count: async () => 1 },
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = {
      activity: activityModel,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (locks.has(key)) await locks.get(key);
        locks.set(key, new Promise<void>(r => { release = () => { locks.delete(key); r(); }; }));
      },
    };
    try { return await fn(tx); } finally { release(); }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ currency: "PKR" }) } });

const teacher = (school: "a" | "b", campus = "1") => ({ userId: `t-${school}`, schoolId: `school-${school}`, campusId: `campus-${school}${campus}`, role: "TEACHER" }) as never;
const body = { kind: "CLUB", title: "Chess", location: "Hall", cancellationTerms: "Full refund 48h before.", capacity: 10, startsAt: "2099-01-10T09:00:00.000Z", endsAt: "2099-01-10T10:00:00.000Z" };

test("a retried create replays the one stored activity", async () => {
  const { createActivity } = await import("../../src/lib/activities/service");
  rows.length = 0;
  const first = await createActivity(teacher("a"), body);
  const retry = await createActivity(teacher("a"), body);
  assert.equal(retry.id, first.id);
  assert.equal(rows.length, 1);
});

test("two concurrent identical creates serialise into one activity", async () => {
  const { createActivity } = await import("../../src/lib/activities/service");
  rows.length = 0;
  const [x, y] = await Promise.all([createActivity(teacher("a"), body), createActivity(teacher("a"), body)]);
  assert.equal(x.id, y.id);
  assert.equal(rows.length, 1);
});

test("other schools, campuses and different slots stay separate", async () => {
  const { createActivity } = await import("../../src/lib/activities/service");
  rows.length = 0;
  await createActivity(teacher("a"), body);
  await createActivity(teacher("a", "2"), body);
  await createActivity(teacher("b"), body);
  await createActivity(teacher("a"), { ...body, startsAt: "2099-01-11T09:00:00.000Z", endsAt: "2099-01-11T10:00:00.000Z" });
  assert.equal(rows.length, 4);
});

test("a role that may not publish is refused before anything is written", async () => {
  const { createActivity } = await import("../../src/lib/activities/service");
  rows.length = 0;
  const parent = { userId: "p", schoolId: "school-a", campusId: "campus-a1", role: "PARENT" } as never;
  await assert.rejects(createActivity(parent, body), (e: { status?: number }) => e.status === 403);
  assert.equal(rows.length, 0);
});
