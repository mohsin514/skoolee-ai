import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1709: retried or concurrent identical Add session submits leave one session and replay it.
type Row = { id: string; schoolId: string; activityId: string; startsAt: Date; endsAt: Date };
const sessions: Row[] = [];
const activities = [
  { id: "act-a", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "coord-a", staffIds: [] as string[] },
  { id: "act-b", schoolId: "school-b", campusId: "campus-b1", coordinatorId: "coord-b", staffIds: [] as string[] },
];
const locks = new Map<string, Promise<void>>();
const same = (a: Date, b: unknown) => b instanceof Date && a.getTime() === b.getTime();
const sessionModel = {
  findFirst: async ({ where }: { where: Record<string, unknown> }) => sessions.find(s => s.schoolId === where.schoolId && s.activityId === where.activityId && same(s.startsAt, where.startsAt) && same(s.endsAt, where.endsAt)) ?? null,
  create: async ({ data }: { data: Omit<Row, "id"> }) => { await new Promise(r => setTimeout(r, 5)); const row = { id: `s${sessions.length + 1}`, ...data }; sessions.push(row); return row; },
};
const prisma = {
  activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => activities.find(a => a.id === where.id && a.schoolId === where.schoolId) ?? null },
  activitySession: sessionModel,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
    let release = () => {};
    const tx = {
      activitySession: sessionModel,
      $executeRaw: async (_s: TemplateStringsArray, key: string) => {
        while (locks.has(key)) await locks.get(key);
        locks.set(key, new Promise<void>(r => { release = () => { locks.delete(key); r(); }; }));
      },
    };
    try { return await fn(tx); } finally { release(); }
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const coord = (school: "a" | "b") => ({ userId: `coord-${school}`, schoolId: `school-${school}`, campusId: `campus-${school}1`, role: "TEACHER" }) as never;
const slot = { startsAt: "2026-11-10T09:00:00.000Z", endsAt: "2026-11-10T10:00:00.000Z" };

test("a lost-response retry replays the one stored session", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  sessions.length = 0;
  const first = await addSession(coord("a"), { activityId: "act-a", ...slot });
  const retry = await addSession(coord("a"), { activityId: "act-a", ...slot });
  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.equal(retry.id, first.id);
  assert.equal(sessions.length, 1);
});

test("two concurrent identical submits serialise into one session", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  sessions.length = 0;
  const [x, y] = await Promise.all([addSession(coord("a"), { activityId: "act-a", ...slot }), addSession(coord("a"), { activityId: "act-a", ...slot })]);
  assert.equal(sessions.length, 1);
  assert.equal(x.id, y.id);
  assert.deepEqual([x.replayed, y.replayed].sort(), [false, true]);
});

test("a different slot is a new session, and each school keeps its own", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  sessions.length = 0;
  await addSession(coord("a"), { activityId: "act-a", ...slot });
  const later = await addSession(coord("a"), { activityId: "act-a", startsAt: "2026-11-11T09:00:00.000Z", endsAt: "2026-11-11T10:00:00.000Z" });
  const other = await addSession(coord("b"), { activityId: "act-b", ...slot });
  assert.equal(later.replayed, false);
  assert.equal(other.replayed, false);
  assert.equal(sessions.length, 3);
  assert.equal(sessions.filter(s => s.schoolId === "school-b").length, 1);
});

test("another school's coordinator cannot reach the activity", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  await assert.rejects(addSession(coord("b"), { activityId: "act-a", ...slot }), (e: { status?: number }) => e.status === 404);
});

test("a teacher who does not run the activity is refused", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  const stranger = { userId: "t-other", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
  await assert.rejects(addSession(stranger, { activityId: "act-a", ...slot }), (e: { status?: number }) => e.status === 404);
});
