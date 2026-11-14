import assert from "node:assert/strict";
import { mock, test } from "node:test";

const groupByCalls: Array<{ by: string[]; where: Record<string, any>; take?: number }> = [];
// SKAI-1870: 90 marked days with a gap, more than the 60 the register history shows.
const day = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset));
const rows = Array.from({ length: 90 }, (_, i) => day(i * 2)).flatMap((date, i) => [
  { date, status: "PRESENT", classId: "class-7b" },
  { date, status: i % 4 ? "PRESENT" : "ABSENT", classId: "class-7b" },
]);

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      class: { findFirst: async () => ({ id: "class-7b" }) },
      student: { count: async () => 2, findMany: async () => [{ id: "moved-pupil" }, { id: "other" }] },
      attendance: {
        groupBy: async (args: { by: string[]; where: Record<string, any>; take?: number }) => {
          groupByCalls.push(args);
          const scoped = rows.filter((r) => r.classId === args.where.classId && (!args.where.date || r.date >= args.where.date.gte));
          const groups = new Map<string, any>();
          for (const r of scoped) {
            const key = args.by.map((k) => String((r as any)[k])).join("|");
            const g = groups.get(key) ?? Object.fromEntries([...args.by.map((k) => [k, (r as any)[k]]), ["_count", 0]]);
            g._count++;
            groups.set(key, g);
          }
          const sorted = [...groups.values()].sort((a, b) => b.date - a.date);
          return args.take ? sorted.slice(0, args.take) : sorted;
        },
      },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ValidationError: class extends Error {},
    ApiError: class extends Error {},
    canMarkAttendance: () => true,
    errorResponse: (error: unknown) => { throw error; },
    requireAuthUser: async () => ({ userId: "staff", schoolId: "school-a", campusId: "campus-a", role: "ADMIN" }),
    resolveCampusId: async () => "campus-a",
  },
});

test("class history counts only rows taken for that class, not the current roster's earlier classes", async () => {
  const { GET } = await import("../../src/app/api/attendance/history/route");
  await GET({ url: "http://x/api/attendance/history?classId=class-7b" } as never);
  assert.deepEqual(groupByCalls[0].where, { campusId: "campus-a", classId: "class-7b" });
  assert.equal(groupByCalls[1].where.campusId, "campus-a");
  assert.equal(groupByCalls[1].where.classId, "class-7b");
});

test("history scans only back to the 60th most recent marked day and returns those 60 days", async () => {
  groupByCalls.length = 0;
  const { GET } = await import("../../src/app/api/attendance/history/route");
  const body = await (await GET({ url: "http://x/api/attendance/history?classId=class-7b" } as never)).json();
  assert.deepEqual(groupByCalls[0], { by: ["date"], where: { campusId: "campus-a", classId: "class-7b" }, orderBy: { date: "desc" }, take: 60 });
  // The 60th most recent marked day is day index 30 (every other day), i.e. offset 60.
  assert.deepEqual(groupByCalls[1].where.date, { gte: day(60) });
  assert.equal(body.data.history.length, 60);
  assert.equal(body.data.history[0].date, day(178).toISOString().slice(0, 10));
  assert.equal(body.data.history[59].date, day(60).toISOString().slice(0, 10));
  assert.equal(body.data.history.reduce((n: number, h: { total: number }) => n + h.total, 0), 120);
  assert.ok(body.data.history.every((h: { marked: boolean }) => h.marked));
});
