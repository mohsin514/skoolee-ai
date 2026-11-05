import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1743: a guardian's weekly updates page past the newest 8 with a cursor; every page keeps school,
// child and guardian scope, ordering is stable on equal weeks, and nothing is skipped or repeated.
type Row = { id: string; schoolId: string; campusId: string; studentId: string; guardianUserId: string; status: string; weekStart: Date; seenAt: Date | null; version: number };
const rows: Row[] = [];
const add = (school: string, campus: string, student: string, n: number, status = "SENT") => {
  for (let i = 0; i < n; i++) rows.push({ id: `${student}-${status}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, studentId: student, guardianUserId: `g-${student}`, status, weekStart: new Date(Date.UTC(2026, 0, 5 + 7 * Math.min(i, 9))), seenAt: null, version: 1 });
};
add("school-a", "campus-a1", "s-a", 11); // 11 sent: a page of 8, then 3 older (two share a week)
add("school-a", "campus-a1", "s-a", 2, "BLOCKED");
add("school-a", "campus-a2", "s-a2", 2); // same school, other campus, other child
add("school-b", "campus-b1", "s-b", 9); // other school

type Where = { schoolId: string; studentId: string; guardianUserId: string; status: string; id?: string };
const scoped = (w: Where) => rows.filter(r => r.schoolId === w.schoolId && r.studentId === w.studentId && r.guardianUserId === w.guardianUserId && r.status === w.status && (!w.id || r.id === w.id))
  .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime() || b.id.localeCompare(a.id));
const prisma = {
  familyDigestDelivery: {
    findFirst: async ({ where }: { where: Where }) => scoped(where)[0] ?? null,
    findMany: async ({ where, take, skip = 0, cursor }: { where: Where; take: number; skip?: number; cursor?: { id: string } }) => {
      const list = scoped(where);
      const start = cursor ? list.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return list.slice(start + skip, start + skip + take).map(r => ({ ...r, entry: { content: { statements: [], nextStep: null, staffContact: "", noEvidence: false } }, digest: { approvedAt: null, approvedById: null } }));
    },
    updateMany: async ({ where }: { where: { id: { in: string[] } } }) => { for (const r of rows) if (where.id.in.includes(r.id)) r.seenAt = new Date(); return { count: where.id.in.length }; },
  },
  user: { findMany: async () => [] },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async ({ schoolId, studentId, guardianUserId }: { schoolId: string; studentId: string; guardianUserId: string }) => guardianUserId === `g-${studentId}` && rows.some(r => r.schoolId === schoolId && r.studentId === studentId) ? { id: "rel" } : null } });

const guardian = (school: string, id: string, role = "PARENT") => ({ userId: id, schoolId: school, campusId: null, role }) as never;

test("the first page holds the newest 8 and the cursor reaches every older sent update once", async () => {
  const { guardianDigests } = await import("../../src/lib/family/digests");
  const first = await guardianDigests(guardian("school-a", "g-s-a"), "s-a");
  assert.equal(first.items.length, 8);
  assert.ok(first.nextCursor);
  const older = await guardianDigests(guardian("school-a", "g-s-a"), "s-a", first.nextCursor);
  assert.equal(older.nextCursor, null);
  const ids = [...first.items, ...older.items].map(r => r.id);
  assert.equal(new Set(ids).size, 11);
  assert.ok(ids.every(id => id.includes("-SENT-")));
  assert.deepEqual(ids, [...ids].sort((a, b) => b.localeCompare(a)));
  assert.ok(rows.filter(r => r.studentId === "s-a" && r.status === "SENT").every(r => r.seenAt));
});

test("pages never cross school, campus, child or guardian, and other roles are denied", async () => {
  const { guardianDigests } = await import("../../src/lib/family/digests");
  const small = await guardianDigests(guardian("school-a", "g-s-a2"), "s-a2");
  assert.equal(small.items.length, 2);
  assert.equal(small.nextCursor, null);
  assert.deepEqual(await guardianDigests(guardian("school-a", "g-s-a2"), "s-a2", "s-a-SENT-03"), { items: [], nextCursor: null });
  await assert.rejects(guardianDigests(guardian("school-b", "g-s-b"), "s-a", "s-a-SENT-03"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(guardianDigests(guardian("school-a", "g-s-b"), "s-a", "s-a-SENT-03"), (e: { status?: number }) => e.status === 404);
  await assert.rejects(guardianDigests(guardian("school-a", "g-s-a", "TEACHER"), "s-a"), (e: { status?: number }) => e.status === 404);
});
