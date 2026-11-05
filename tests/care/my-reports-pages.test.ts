import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1698: "Concerns I recorded" pages newest-first past the newest 20 with a cursor; every page keeps school
// and reporter scope, returns only id/reference/date, and an id tiebreak keeps equal timestamps from gapping.
type Row = { id: string; schoolId: string; campusId: string; reporterId: string; reference: string; observation: string; createdAt: Date };
const rows: Row[] = [];
const add = (school: string, campus: string, reporter: string, n: number, tag = campus) => {
  for (let i = 0; i < n; i++) rows.push({ id: `${reporter}-${tag}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, reporterId: reporter, reference: `SG-${tag}-${i}`, observation: "Synthetic observation", createdAt: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 2))) });
};
add("school-a", "campus-a1", "t1", 22); // 22 by the reporter on campus A1 (pairs share a timestamp)
add("school-a", "campus-a2", "t1", 1); // same reporter, other campus of the same school: still theirs
add("school-a", "campus-a2", "t2", 4); // other reporter, other campus
add("school-b", "campus-b1", "t1", 5, "b1"); // other school, same user id

type Find = { where: Record<string, unknown>; take: number; skip?: number; cursor?: { id: string }; select: Record<string, boolean> };
const calls: Find[] = [];
const prisma = {
  safeguardingConcern: {
    findMany: async (args: Find) => {
      calls.push(args);
      const { where, take, skip = 0, cursor, select } = args;
      const scoped = rows.filter(r => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? scoped.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return scoped.slice(start + skip, start + skip + take).map(r => Object.fromEntries(Object.keys(select).map(k => [k, (r as Record<string, unknown>)[k]])));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });

const user = (school: string, id: string, role: string, campusId: string | null = null) => ({ userId: id, schoolId: school, campusId, role }) as never;

test("the first page is the newest 20 and the cursor reaches every older receipt with no gap or duplicate", async () => {
  const { myReports } = await import("../../src/lib/care/service");
  const first = await myReports(user("school-a", "t1", "TEACHER", "campus-a1"));
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const older = await myReports(user("school-a", "t1", "TEACHER", "campus-a1"), first.nextCursor);
  assert.equal(older.nextCursor, null);
  const all = [...first.items, ...older.items];
  assert.equal(new Set(all.map(r => r.id)).size, 23);
  assert.ok(all.every((r, i) => i === 0 || all[i - 1].createdAt.getTime() >= r.createdAt.getTime()), "newest-first");
  assert.ok(all.some(r => r.reference === "SG-campus-a2-0"), "own concern on the other campus is included");
  assert.ok(all.every(r => Object.keys(r).sort().join() === "createdAt,id,reference"), "no confidential fields");
});

test("every page keeps school and reporter scope; other schools and reporters never appear", async () => {
  const { myReports } = await import("../../src/lib/care/service");
  calls.length = 0;
  const b = await myReports(user("school-b", "t1", "TEACHER", "campus-b1"));
  assert.deepEqual(b.items.map(r => r.reference).sort(), ["SG-b1-0", "SG-b1-1", "SG-b1-2", "SG-b1-3", "SG-b1-4"]);
  assert.equal(b.nextCursor, null);
  const t2 = await myReports(user("school-a", "t2", "TEACHER", "campus-a2"));
  assert.equal(t2.items.length, 4);
  // A cursor from another school's or reporter's row cannot reach it: the where clause is always scoped.
  const crossed = await myReports(user("school-b", "t1", "TEACHER"), "t2-campus-a2-00");
  assert.deepEqual(crossed.items, []);
  assert.ok(calls.every(c => c.where.reporterId && c.where.schoolId && Object.keys(c.where).length === 2));
});

test("family and student roles are denied on every page", async () => {
  const { myReports } = await import("../../src/lib/care/service");
  for (const role of ["PARENT", "STUDENT"]) {
    await assert.rejects(() => myReports(user("school-a", "t1", role)));
    await assert.rejects(() => myReports(user("school-a", "t1", role), "t1-campus-a1-00"));
  }
});
