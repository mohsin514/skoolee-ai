import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1702: My requests must page past the newest 50, keep the requester/school filter on every page,
// and never reach another school's or another requester's rows.
type Row = { id: string; schoolId: string; campusId: string; requesterId: string; watcherIds: string[]; createdAt: Date };
const base = new Date("2026-10-01T00:00:00Z").getTime();
const rows: Row[] = [];
for (let i = 0; i < 53; i++) rows.push({ id: `a-${String(i).padStart(3, "0")}`, schoolId: "school-a", campusId: i % 2 ? "campus-a1" : "campus-a2", requesterId: "staff-a", watcherIds: [], createdAt: new Date(base + i * 1000) });
rows.push({ id: "a-other", schoolId: "school-a", campusId: "campus-a1", requesterId: "staff-x", watcherIds: [], createdAt: new Date(base + 99_000) });
rows.push({ id: "b-001", schoolId: "school-b", campusId: "campus-b1", requesterId: "staff-a", watcherIds: [], createdAt: new Date(base + 98_000) });

const calls: Array<Record<string, unknown>> = [];
function findMany(args: { where: { schoolId: string; OR: Array<{ requesterId?: string; watcherIds?: { has: string } }> }; take: number; skip?: number; cursor?: { id: string } }) {
  calls.push(args as never);
  const me = args.where.OR[0].requesterId!;
  const matching = rows.filter(r => r.schoolId === args.where.schoolId && (r.requesterId === me || r.watcherIds.includes(me)))
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || (x.id < y.id ? 1 : -1));
  let start = 0;
  if (args.cursor) { const at = matching.findIndex(r => r.id === args.cursor!.id); if (at < 0) return []; start = at + (args.skip ?? 0); }
  return matching.slice(start, start + args.take).map(r => ({ ...r, reference: `SD-${r.id}`, title: "t", location: "l", priority: "NORMAL", status: "OPEN", blockedReason: null, ownerId: null, category: { name: "c", team: "t", safety: false }, resolveDueAt: null, responseDueAt: null, firstResponseAt: null, resolvedAt: null, reopenedCount: 0, version: 1 }));
}
mock.module("@/lib/db/prisma", { namedExports: { prisma: { serviceRequest: { findMany }, user: { findMany: async () => [] } } } });

const staffA = { userId: "staff-a", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" } as never;
const parent = { userId: "parent-a", schoolId: "school-a", campusId: "campus-a1", role: "PARENT" } as never;

test("My requests pages past 50 and reaches every own request exactly once", async () => {
  const { myRequests } = await import("../../src/lib/service-desk/service");
  const first = await myRequests(staffA);
  assert.equal(first.requests.length, 50);
  assert.ok(first.nextCursor, "a first page of 50 out of 53 must offer a cursor");
  const second = await myRequests(staffA, first.nextCursor);
  assert.equal(second.requests.length, 3);
  assert.equal(second.nextCursor, null);
  const ids = [...first.requests, ...second.requests].map(r => r.id);
  assert.equal(new Set(ids).size, 53);
  assert.ok(ids.every(id => id.startsWith("a-") && id !== "a-other"), "no other requester or other school");
  const last = calls.at(-1)!;
  assert.deepEqual((last.where as { schoolId: string }).schoolId, "school-a");
  assert.deepEqual(last.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("a cursor from another school's request returns nothing of that school", async () => {
  const { myRequests } = await import("../../src/lib/service-desk/service");
  const page = await myRequests(staffA, "b-001");
  assert.equal(page.requests.length, 0);
});

test("a denied role is still refused on later pages", async () => {
  const { myRequests } = await import("../../src/lib/service-desk/service");
  await assert.rejects(() => myRequests(parent, "a-010"), /for staff/);
});
