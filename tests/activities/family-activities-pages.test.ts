import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1705: the family list pages 50 at a time with a keyset cursor, so item 51 and later are reachable.
// Every page keeps the guardian, school and campus scope; activities sharing a start time keep a stable order.
type Act = { id: string; schoolId: string; campusId: string; status: string; startsAt: Date; endsAt: Date; capacity: number; classIds: string[]; tripId: null; costAmount: number; costCurrency: string; offerHours: number; kind: string; title: string; description: string; location: string; cancellationTerms: string };
const DAY = 86_400_000, base = Date.now() + DAY;
const acts: Act[] = [];
const mk = (id: string, schoolId: string, campusId: string, startsAt: number): Act => ({ id, schoolId, campusId, status: "PUBLISHED", startsAt: new Date(startsAt), endsAt: new Date(startsAt + 3_600_000), capacity: 5, classIds: [], tripId: null, costAmount: 0, costCurrency: "PKR", offerHours: 24, kind: "CLUB", title: id, description: "", location: "Hall", cancellationTerms: "Synthetic" });
// 51 eligible activities on school-a/campus-a; pairs share a start time. Noise on another campus and school.
for (let i = 0; i < 51; i++) acts.push(mk(`a1-${String(50 - i).padStart(2, "0")}`, "school-a", "campus-a1", base + Math.floor(i / 2) * DAY));
for (let i = 0; i < 5; i++) acts.push(mk(`a2-${i}`, "school-a", "campus-a2", base), mk(`b-${i}`, "school-b", "campus-b1", base));

type Find = { where: { schoolId: string; campusId: string; status: string; endsAt: { gt: Date } }; orderBy?: unknown; take?: number; cursor?: { id: string }; skip?: number };
const findMany = ({ where, take, cursor, skip, orderBy }: Find) => {
  let rows = acts.filter(a => a.schoolId === where.schoolId && a.campusId === where.campusId && a.status === where.status && a.endsAt > where.endsAt.gt);
  const keyed = Array.isArray(orderBy) && JSON.stringify(orderBy).includes('"id"');
  rows.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime() || (keyed ? x.id.localeCompare(y.id) : 0));
  if (cursor) rows = rows.slice(rows.findIndex(r => r.id === cursor.id) + (skip ?? 0));
  return rows.slice(0, take ?? rows.length);
};
const students: Record<string, { id: string; schoolId: string; classId: null; campusId: string; fullName: string }> = {
  "kid-a1": { id: "kid-a1", schoolId: "school-a", classId: null, campusId: "campus-a1", fullName: "Synthetic A1" },
  "kid-b1": { id: "kid-b1", schoolId: "school-b", classId: null, campusId: "campus-b1", fullName: "Synthetic B1" },
};
// SKAI-605: the read-time settle locks and re-reads the activity.
const tx = { $queryRaw: async () => [], activity: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => acts.find(a => a.id === where.id && a.schoolId === where.schoolId) ?? null }, activityPlace: { updateMany: async () => ({ count: 0 }), count: async () => 0, findMany: async () => [], update: async () => ({}) } };
const prisma = {
  activity: { findMany: async (args: Find) => findMany(args) },
  activityPlace: { findMany: async () => [], groupBy: async () => [], findFirst: async () => null, count: async () => 0 },
  student: { findFirst: async ({ where }: { where: { id: string; schoolId: string } }) => { const s = students[where.id]; return s && s.schoolId === where.schoolId ? s : null; } },
  $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ guardianUserId, studentId }: { guardianUserId: string; studentId: string }) => guardianUserId === `parent-of-${studentId}` } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({ currency: "PKR", timezone: "Asia/Karachi" }) } });

const parent = (kid: string, school: string) => ({ userId: `parent-of-${kid}`, role: "PARENT", schoolId: school, campusId: null }) as never;
const list = async (user: never, kid: string, cursor?: string | null) => (await import("../../src/lib/activities/service")).familyActivities(user, kid, cursor);

test("51 activities: the first page has 50 and a cursor, the second has the 51st, no gaps or duplicates", async () => {
  const user = parent("kid-a1", "school-a");
  const first = await list(user, "kid-a1");
  assert.equal(first.activities.length, 50);
  assert.ok(first.nextCursor);
  const second = await list(user, "kid-a1", first.nextCursor);
  assert.equal(second.nextCursor, null);
  const ids = [...first.activities, ...second.activities].map(a => a.id);
  assert.equal(ids.length, 51);
  assert.equal(new Set(ids).size, 51);
  assert.deepEqual(new Set(ids), new Set(acts.filter(a => a.campusId === "campus-a1").map(a => a.id)));
  assert.ok(ids.every(id => id.startsWith("a1-")), "no other campus or school leaks in");
});

test("the other school's guardian sees only their campus, on every page", async () => {
  const r = await list(parent("kid-b1", "school-b"), "kid-b1");
  assert.deepEqual(r.activities.map(a => a.id).sort(), ["b-0", "b-1", "b-2", "b-3", "b-4"]);
  assert.equal(r.nextCursor, null);
});

test("denied: a non-guardian role and another school's guardian are refused even with a cursor", async () => {
  await assert.rejects(list({ userId: "t", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" } as never, "kid-a1", "a1-01"), { status: 403 });
  await assert.rejects(list(parent("kid-a1", "school-b"), "kid-a1", "a1-01"), { status: 404 });
  await assert.rejects(list(parent("kid-b1", "school-a"), "kid-a1", "a1-01"), { status: 404 });
});
