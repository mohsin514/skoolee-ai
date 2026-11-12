import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { validateReferences } from "../../src/lib/db/prisma";
import { AccessDenied } from "../../src/lib/auth/policy";
import { referenceTransaction, type ReferenceClient } from "../../src/lib/db/reference-transaction";
import type { TenantContext } from "../../src/lib/db/tenant-context";

// SKAI-1817: a bulk write checks each foreign key once for its distinct values, not once per row, and keeps the
// same school + campus scope, so one foreign-school or foreign-campus reference still denies the whole write.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  conversation: [
    { id: "conv-a1", schoolId: "school-a", campusId: "campus-a1" },
    { id: "conv-a2", schoolId: "school-a", campusId: "campus-a2" },
    { id: "conv-b1", schoolId: "school-b", campusId: "campus-b1" },
  ],
  user: [
    ...Array.from({ length: 1200 }, (_, i) => ({ id: `parent-a1-${i}`, schoolId: "school-a", campusId: "campus-a1" })),
    { id: "parent-a2", schoolId: "school-a", campusId: "campus-a2" },
    { id: "parent-shared", schoolId: "school-a", campusId: null },
    { id: "parent-b1", schoolId: "school-b", campusId: "campus-b1" },
  ],
};

const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, value]) => {
  if (key === "AND") return (value as Row[]).every((part) => matches(row, part));
  if (key === "OR") return (value as Row[]).some((part) => matches(row, part));
  if (value && typeof value === "object" && "in" in (value as Row)) return ((value as Row).in as unknown[]).includes(row[key]);
  return row[key] === value;
});

const calls: Array<{ model: string; op: string; where: Row }> = [];
const client = new Proxy({}, {
  get: (_target, model: string) => ({
    findFirst: async ({ where }: { where: Row }) => { calls.push({ model, op: "findFirst", where }); return tables[model]?.find((r) => matches(r, where)) ?? null; },
    findMany: async ({ where }: { where: Row }) => { calls.push({ model, op: "findMany", where }); return (tables[model] ?? []).filter((r) => matches(r, where)); },
  }),
}) as ReferenceClient;

const teacherA1: TenantContext = { schoolId: "school-a", campusId: "campus-a1", userId: "teacher-a1", role: "TEACHER" };
const teacherA2: TenantContext = { schoolId: "school-a", campusId: "campus-a2", userId: "teacher-a2", role: "TEACHER" };
const ownerB: TenantContext = { schoolId: "school-b", campusId: null, userId: "owner-b", role: "SUPER_ADMIN" };
const check = (data: unknown, context: TenantContext) =>
  referenceTransaction.run(client, () => validateReferences("conversationMember", data, context));
const members = (conversationId: string, userIds: string[]) => userIds.map((userId) => ({ conversationId, userId, schoolId: "school-a" }));
const parentsA1 = Array.from({ length: 600 }, (_, i) => `parent-a1-${i}`);

beforeEach(() => { calls.length = 0; });

test("a 600-row bulk insert runs one lookup per foreign key, not one per row", async () => {
  await check(members("conv-a1", parentsA1), teacherA1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => `${c.model}.${c.op}`).sort(), ["conversation.findFirst", "user.findMany"]);
  for (const call of calls) assert.ok(JSON.stringify(call.where).includes('"schoolId":"school-a"'), "every lookup keeps the school scope");
  for (const call of calls) assert.ok(JSON.stringify(call.where).includes('"campusId":"campus-a1"'), "staff lookups keep the campus scope");
});

test("one foreign-school reference in a bulk insert denies the whole write", async () => {
  await assert.rejects(check(members("conv-a1", [...parentsA1.slice(0, 5), "parent-b1"]), teacherA1), AccessDenied);
  await assert.rejects(check([...members("conv-a1", ["parent-a1-0"]), ...members("conv-b1", ["parent-a1-1"])], teacherA1), AccessDenied);
});

test("one other-campus reference denies a campus-scoped teacher; campus-wide rows stay allowed", async () => {
  await assert.rejects(check(members("conv-a1", ["parent-a1-0", "parent-a2"]), teacherA1), AccessDenied);
  await check(members("conv-a1", ["parent-a1-0", "parent-shared"]), teacherA1);
  await check(members("conv-a2", ["parent-a2", "parent-shared"]), teacherA2);
  await assert.rejects(check(members("conv-a2", ["parent-a2", "parent-a1-0"]), teacherA2), AccessDenied);
});

test("school B cannot reference school A rows even without a campus filter", async () => {
  await check([{ conversationId: "conv-b1", userId: "parent-b1" }], ownerB);
  await assert.rejects(check([{ conversationId: "conv-b1", userId: "parent-b1" }, { conversationId: "conv-b1", userId: "parent-a2" }], ownerB), AccessDenied);
});

test("a staff role with no campus is refused before any lookup", async () => {
  await assert.rejects(check(members("conv-a1", ["parent-a1-0", "parent-a1-1"]), { ...teacherA1, campusId: null }), AccessDenied);
  assert.equal(calls.length, 0);
});

test("very large inserts are chunked and duplicates are checked once", async () => {
  const many = [...Array.from({ length: 1200 }, (_, i) => `parent-a1-${i}`), ...parentsA1.slice(0, 100)];
  await check(members("conv-a1", many), { ...teacherA1, role: "SUPER_ADMIN" });
  const userCalls = calls.filter((c) => c.model === "user");
  assert.equal(userCalls.length, 2, "1200 distinct ids run as two chunks of at most 1000");
  const ids = userCalls.flatMap((c) => JSON.stringify(c.where).match(/parent-a1-\d+/g) ?? []);
  assert.equal(ids.length, 1200);
  assert.equal(new Set(ids).size, 1200);
});
