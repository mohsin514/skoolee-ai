import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-603: a session cannot be scheduled on a cancelled activity (direct API call bypassing the hidden button).
const sessions: unknown[] = [];
const activities = [
  { id: "act-live", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "coord-a", staffIds: [] as string[], status: "PUBLISHED" },
  { id: "act-off", schoolId: "school-a", campusId: "campus-a1", coordinatorId: "coord-a", staffIds: [] as string[], status: "CANCELLED" },
];
const sessionModel = { findFirst: async () => null, create: async ({ data }: { data: object }) => { const row = { id: `s${sessions.length + 1}`, ...data }; sessions.push(row); return row; } };
const prisma = {
  activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => activities.find(a => a.id === where.id && a.schoolId === where.schoolId) ?? null },
  activitySession: sessionModel,
  $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ activitySession: sessionModel, $executeRaw: async () => 0 }),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });

const coord = { userId: "coord-a", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
const slot = { startsAt: "2099-11-10T09:00:00.000Z", endsAt: "2099-11-10T10:00:00.000Z" };

test("a cancelled activity refuses a new session and writes nothing", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  sessions.length = 0;
  await assert.rejects(addSession(coord, { activityId: "act-off", ...slot }), (e: { status?: number }) => e.status === 409);
  assert.equal(sessions.length, 0);
});

test("a published activity still takes a session", async () => {
  const { addSession } = await import("../../src/lib/activities/service");
  sessions.length = 0;
  const s = await addSession(coord, { activityId: "act-live", ...slot });
  assert.equal(s.replayed, false);
  assert.equal(sessions.length, 1);
});
