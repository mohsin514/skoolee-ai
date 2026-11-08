import assert from "node:assert/strict";
import { mock, test } from "node:test";

const event = (i: number) => ({ id: `e${String(i).padStart(3, "0")}`, action: "PERMISSIONS_CHANGED", reason: "r", createdAt: new Date(2026, 0, 1, 0, 0, 100 - i), actor: { fullName: "Admin A" } });
const calls: Array<Record<string, unknown>> = [];
let relationFound = true;

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      student: { findFirst: async () => ({ id: "s1", fullName: "Pupil", rollNo: 1, campusId: "c1", campus: { name: "A" } }) },
      guardianRelationship: {
        findFirst: async () => (relationFound ? { id: "rel-1" } : null),
        findMany: async () => [{ id: "rel-1", status: "ACTIVE", accessVersions: [], accessEvents: Array.from({ length: 26 }, (_, i) => event(i)) }],
      },
      guardianReviewQueue: { findMany: async () => [] },
      guardianAccessEvent: { findMany: async (args: Record<string, unknown>) => { calls.push(args); return Array.from({ length: 3 }, (_, i) => event(30 + i)); } },
    },
  },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
    canManageAcademics: () => true,
    canManageCampusOps: () => true,
    errorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    requireAuthUser: async () => ({ userId: "admin", schoolId: "school-a", campusId: "c1", role: "ADMIN" }),
  },
});
mock.module("@/lib/auth/policy", { namedExports: { studentScope: () => ({ schoolId: "school-a" }) } });
mock.module("@/lib/permissions", { namedExports: { assertPermission: async () => {} } });

const load = async () => (await import("../../src/app/api/students/[id]/guardians/route")).GET;
const req = (q: string) => ({ nextUrl: new URL(`http://x/api/students/s1/guardians${q}`) }) as never;
const params = { params: Promise.resolve({ id: "s1" }) };

test("first page keeps 25 newest events and returns a cursor when more exist", async () => {
  const body = await (await (await load())(req(""), params)).json();
  assert.equal(body.relationships[0].events.length, 25);
  assert.equal(body.relationships[0].eventsCursor, "e024");
});

test("older pages read after the cursor in a stable newest-first order, scoped to the child's relationship", async () => {
  relationFound = true; calls.length = 0;
  const body = await (await (await load())(req("?events=rel-1&before=e024"), params)).json();
  assert.equal(body.events.length, 3);
  assert.equal(body.eventsCursor, null);
  assert.deepEqual(calls[0].where, { schoolId: "school-a", relationshipId: "rel-1" });
  assert.deepEqual(calls[0].cursor, { id: "e024" });
  assert.deepEqual(calls[0].orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("another child's relationship id is refused", async () => {
  relationFound = false;
  const res = await (await load())(req("?events=rel-other&before=x"), params);
  assert.equal(res.status, 404);
});
