import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1706: a counsellor reaches every mentoring request through keyset pages; scope and role are re-checked per page.
type Req = { id: string; schoolId: string; campusId: string; studentId: string; createdAt: Date };
const requests: Req[] = [];
const t0 = Date.UTC(2026, 9, 1);
const seed = (school: string, campus: string, n: number) => {
  for (let i = 0; i < n; i++) requests.push({ id: `${campus}-r${String(i).padStart(3, "0")}`, schoolId: school, campusId: campus, studentId: `${campus}-s`, createdAt: new Date(t0 + (i % 40) * 60_000) });
};
seed("school-a", "campus-a1", 51);
seed("school-a", "campus-a2", 5);
seed("school-b", "campus-b1", 5);

const counsellors = [{ schoolId: "school-a", userId: "coun-a1", campusId: "campus-a1" }, { schoolId: "school-b", userId: "coun-b1", campusId: "campus-b1" }];
const cmp = (a: Req, b: Req) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const prisma = {
  pathwayCounsellor: { findFirst: async ({ where }: { where: { schoolId: string; userId: string; campusId: string } }) => counsellors.find((c) => c.schoolId === where.schoolId && c.userId === where.userId && c.campusId === where.campusId) ?? null },
  student: { findMany: async () => [] },
  mentoringRequest: {
    findMany: async ({ where, orderBy, take, cursor, skip }: { where: { schoolId: string; campusId: string }; orderBy: unknown; take?: number; cursor?: { id: string }; skip?: number }) => {
      assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
      const all = requests.filter((r) => r.schoolId === where.schoolId && r.campusId === where.campusId).sort(cmp);
      const start = cursor ? all.findIndex((r) => r.id === cursor.id) + (skip ?? 0) : 0;
      return all.slice(start, take === undefined ? undefined : start + take);
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => false } });

const user = (userId: string, school: string, campus: string, role = "TEACHER") => ({ userId, schoolId: school, campusId: campus, role }) as never;

test("51 requests: the first page has 50 and a cursor, the second has the oldest one", async () => {
  const { mentoringRequestPage } = await import("../../src/lib/pathways/service");
  const me = user("coun-a1", "school-a", "campus-a1");
  const first = await mentoringRequestPage(me);
  assert.equal(first.requests.length, 50);
  assert.ok(first.nextCursor);
  const second = await mentoringRequestPage(me, first.nextCursor);
  assert.equal(second.requests.length, 1);
  assert.equal(second.nextCursor, null);
  const ids = [...first.requests, ...second.requests].map((r) => r.id);
  assert.equal(new Set(ids).size, 51);
  assert.ok(ids.every((id) => id.startsWith("campus-a1-")));
});

test("other schools and campuses never appear, even with a foreign cursor", async () => {
  const { mentoringRequestPage } = await import("../../src/lib/pathways/service");
  const b = await mentoringRequestPage(user("coun-b1", "school-b", "campus-b1"), "campus-a1-r010");
  assert.ok(b.requests.every((r) => r.schoolId === "school-b" && r.campusId === "campus-b1"));
  await assert.rejects(mentoringRequestPage(user("coun-a1", "school-a", "campus-a2")), { status: 403 });
});

test("a non-designated teacher and a student are denied on every page", async () => {
  const { mentoringRequestPage } = await import("../../src/lib/pathways/service");
  await assert.rejects(mentoringRequestPage(user("teach-a1", "school-a", "campus-a1", "TEACHER"), "campus-a1-r010"), { status: 403 });
  await assert.rejects(mentoringRequestPage(user("stu-a1", "school-a", "campus-a1", "STUDENT")), { status: 403 });
});
