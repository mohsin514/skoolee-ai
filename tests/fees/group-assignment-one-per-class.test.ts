import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-378: a class holds at most one fee group per academic year, so invoice generation,
// statements and fee resolution never pick between groups. Two campuses (A, B) plus a second school (X).
type Row = { id: string; campusId: string; feeGroupId: string; classId: string; academicYear: number };
const groups = [{ id: "g-a1", campusId: "campus-a" }, { id: "g-a2", campusId: "campus-a" }, { id: "g-b1", campusId: "campus-b" }, { id: "g-x1", campusId: "campus-x" }];
const classes = [{ id: "c-a", campusId: "campus-a" }, { id: "c-b", campusId: "campus-b" }, { id: "c-x", campusId: "campus-x" }];
let rows: Row[] = [];

const byIdCampus = (list: Array<{ id: string; campusId: string }>) => async ({ where }: { where: { id: string; campusId: string } }) =>
  list.find(r => r.id === where.id && r.campusId === where.campusId) ?? null;
const fakeTx = { feeGroupAssignment: { create: async ({ data }: { data: Omit<Row, "id"> }) => { const row = { id: `as-${rows.length + 1}`, ...data }; rows.push(row); return row; } } };
const fakePrisma = {
  feeGroup: { findFirst: byIdCampus(groups) },
  class: { findFirst: byIdCampus(classes) },
  feeGroupAssignment: {
    findUnique: async ({ where: { feeGroupId_classId_academicYear: k } }: { where: { feeGroupId_classId_academicYear: Omit<Row, "id" | "campusId"> } }) =>
      rows.find(r => r.feeGroupId === k.feeGroupId && r.classId === k.classId && r.academicYear === k.academicYear) ?? null,
    findFirst: async ({ where }: { where: { campusId: string; classId: string; academicYear: number } }) =>
      rows.find(r => r.campusId === where.campusId && r.classId === where.classId && r.academicYear === where.academicYear) ?? null,
  },
  $transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx),
};

class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }
const campusOf: Record<string, string> = { "u-a": "campus-a", "u-b": "campus-b", "u-x": "campus-x" };
mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/audit-events", { namedExports: { writeAuditEvent: async () => {} } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    resolveCampusId: async (user: { id: string }, requested?: string | null) => {
      if (requested && requested !== campusOf[user.id]) throw new ApiError("Forbidden", 403);
      return campusOf[user.id];
    },
  },
});

const load = () => import("@/lib/fees/group-assignment-command");
const user = (id: string) => ({ id }) as never;

test("refuses a second group for the same class and year", async () => {
  rows = [];
  const { assignFeeGroup } = await load();
  await assignFeeGroup(user("u-a"), { feeGroupId: "g-a1", classId: "c-a", academicYear: 2026 });
  await assert.rejects(assignFeeGroup(user("u-a"), { feeGroupId: "g-a2", classId: "c-a", academicYear: 2026 }), (e: ApiError) => e.status === 409 && /already has a fee group/.test(e.message));
  await assert.rejects(assignFeeGroup(user("u-a"), { feeGroupId: "g-a1", classId: "c-a", academicYear: 2026 }), (e: ApiError) => e.status === 409);
  assert.equal(rows.length, 1);
});

test("a different year, campus or school is not blocked", async () => {
  rows = [];
  const { assignFeeGroup } = await load();
  await assignFeeGroup(user("u-a"), { feeGroupId: "g-a1", classId: "c-a", academicYear: 2026 });
  await assignFeeGroup(user("u-a"), { feeGroupId: "g-a2", classId: "c-a", academicYear: 2027 });
  await assignFeeGroup(user("u-b"), { feeGroupId: "g-b1", classId: "c-b", academicYear: 2026 });
  await assignFeeGroup(user("u-x"), { feeGroupId: "g-x1", classId: "c-x", academicYear: 2026 });
  assert.equal(rows.length, 4);
});

test("another campus or school cannot assign a group across tenants", async () => {
  rows = [];
  const { assignFeeGroup } = await load();
  await assert.rejects(assignFeeGroup(user("u-b"), { feeGroupId: "g-a1", classId: "c-a", academicYear: 2026 }), (e: ApiError) => e.status === 404);
  await assert.rejects(assignFeeGroup(user("u-x"), { campusId: "campus-a", feeGroupId: "g-a1", classId: "c-a" }), (e: ApiError) => e.status === 403);
  assert.equal(rows.length, 0);
});
