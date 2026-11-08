import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1708: released care messages page past the newest 20 with a cursor; every page keeps school,
// recipient, recipient type and RELEASED-only scope, with an id tiebreak so equal timestamps never gap or repeat.
type Row = { id: string; schoolId: string; campusId: string; recipientUserId: string; recipientType: string; status: string; purpose: string; content: string; releasedAt: Date | null };
const rows: Row[] = [];
const add = (school: string, campus: string, user: string, type: string, n: number, status = "RELEASED") => {
  for (let i = 0; i < n; i++) rows.push({ id: `${user}-${status}-${String(i).padStart(2, "0")}`, schoolId: school, campusId: campus, recipientUserId: user, recipientType: type, status, purpose: "Update", content: `Message ${i}`, releasedAt: status === "RELEASED" ? new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 2))) : null });
};
add("school-a", "campus-a1", "g1", "GUARDIAN", 21); // 21 released: one page of 20, then 1 older (pairs share a timestamp)
add("school-a", "campus-a1", "g1", "GUARDIAN", 3, "PROPOSED"); // unreleased proposals for the same guardian
add("school-a", "campus-a2", "g2", "GUARDIAN", 4); // same school, other campus, other recipient
add("school-a", "campus-a1", "t1", "STAFF", 2); // staff recipient
add("school-b", "campus-b1", "g1", "GUARDIAN", 5); // other school, same user id

type Find = { where: Record<string, unknown>; take: number; skip?: number; cursor?: { id: string }; orderBy: unknown };
const calls: Find[] = [];
const prisma = {
  safeguardingDisclosure: {
    findMany: async (args: Find) => {
      calls.push(args);
      const { where, take, skip = 0, cursor } = args;
      const scoped = rows.filter(r => Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v))
        .sort((a, b) => b.releasedAt!.getTime() - a.releasedAt!.getTime() || b.id.localeCompare(a.id));
      const start = cursor ? scoped.findIndex(r => r.id === cursor.id) : 0;
      if (start < 0) return [];
      return scoped.slice(start + skip, start + skip + take).map(({ id, purpose, content, releasedAt }) => ({ id, purpose, content, releasedAt }));
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => { throw new Error("unused"); } } });

const user = (school: string, id: string, role: string) => ({ userId: id, schoolId: school, campusId: null, role }) as never;

test("the first page holds the newest 20 and the cursor reaches the 21st with no gap or duplicate", async () => {
  const { messagesForMe } = await import("../../src/lib/care/service");
  const first = await messagesForMe(user("school-a", "g1", "PARENT"));
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const older = await messagesForMe(user("school-a", "g1", "PARENT"), first.nextCursor);
  assert.equal(older.items.length, 1);
  assert.equal(older.nextCursor, null);
  const ids = new Set([...first.items, ...older.items].map(m => m.id));
  assert.equal(ids.size, 21);
  assert.ok([...ids].every(id => id.startsWith("g1-RELEASED-")));
  assert.deepEqual(calls.at(-1)!.orderBy, [{ releasedAt: "desc" }, { id: "desc" }]);
});

test("every page keeps school, recipient and RELEASED scope; other schools, campuses and roles see only their own", async () => {
  const { messagesForMe } = await import("../../src/lib/care/service");
  const first = await messagesForMe(user("school-a", "g1", "PARENT"));
  await messagesForMe(user("school-a", "g1", "PARENT"), first.nextCursor);
  for (const c of calls.slice(-2)) assert.deepEqual(c.where, { schoolId: "school-a", recipientUserId: "g1", status: "RELEASED", recipientType: "GUARDIAN" });
  const otherSchool = await messagesForMe(user("school-b", "g1", "PARENT"));
  assert.equal(otherSchool.items.length, 5);
  assert.ok(otherSchool.items.every(m => !first.items.some(f => f.id === m.id) || m.id.startsWith("g1-")));
  assert.equal(calls.at(-1)!.where.schoolId, "school-b");
  const otherCampus = await messagesForMe(user("school-a", "g2", "PARENT"));
  assert.deepEqual(otherCampus.items.map(m => m.id).sort(), ["g2-RELEASED-00", "g2-RELEASED-01", "g2-RELEASED-02", "g2-RELEASED-03"]);
  assert.equal(otherCampus.nextCursor, null);
  // A staff member reading a guardian's cursor still gets only STAFF messages addressed to them.
  const staffWithForeignCursor = await messagesForMe(user("school-a", "t1", "TEACHER"), first.nextCursor);
  assert.deepEqual(staffWithForeignCursor.items, []);
  const staff = await messagesForMe(user("school-a", "t1", "TEACHER"));
  assert.equal(staff.items.length, 2);
  // A guardian id used under a staff role gets no guardian messages.
  const wrongType = await messagesForMe(user("school-a", "g1", "TEACHER"));
  assert.deepEqual(wrongType.items, []);
});
