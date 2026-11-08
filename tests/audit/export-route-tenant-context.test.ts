import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

// SKAI-1748: GET /api/audit-log/export ran tenantTransaction with no bound tenant and always failed with
// TenantContextError. The route now binds the signed-in user's school before exporting.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type Row = { id: string; schoolId: string; campusId: string | null; tableName: string; recordId: string; userId: string; createdAt: Date; oldValue: unknown; newValue: unknown };
const rows: Row[] = [];
const seed = () => {
  rows.length = 0;
  rows.push(
    { id: "a1", schoolId: "school-a", campusId: "campus-a", tableName: "students", recordId: "student-a", userId: "owner-a", createdAt: new Date(Date.UTC(2026, 9, 1)), oldValue: null, newValue: { status: "ACTIVE" } },
    { id: "b1", schoolId: "school-b", campusId: "campus-b", tableName: "students", recordId: "student-b", userId: "owner-b", createdAt: new Date(Date.UTC(2026, 9, 1)), oldValue: null, newValue: { status: "ACTIVE" } },
  );
};
// The fake db applies the tenant guard's school filter, the way the real extension does.
const fakeDb = (schoolId: string) => {
  const inSchool = () => rows.filter((r) => r.schoolId === schoolId);
  return {
    $executeRaw: async () => 0,
    campus: { findMany: async () => [{ id: `campus-${schoolId.slice(-1)}`, name: "Campus" }] },
    user: { findMany: async () => [] },
    auditLog: {
      findFirst: async ({ where }: { where: { AND: Array<Record<string, unknown>> } }) =>
        inSchool().find((r) => where.AND.every((c) => typeof c.recordId !== "string" || (c.recordId === r.recordId && c.tableName === r.tableName))) ?? null,
      findMany: async ({ take }: { take: number }) => inSchool().slice(0, take),
      create: async ({ data }: { data: Row }) => { rows.push({ ...data, id: randomUUID(), createdAt: new Date() }); return data; },
      update: async () => ({}),
    },
  };
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const owner = (school: "a" | "b") => ({ userId: `owner-${school}`, role: "SUPER_ADMIN", schoolId: `school-${school}`, campusId: `campus-${school}`, institutionKind: "GROUP" });
const state = { user: owner("a") as Record<string, unknown> };

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    errorResponse: (error: unknown) => Response.json({ error: (error as Error).name }, { status: error instanceof ApiError ? error.status : 500 }),
  },
});
mock.module(src("lib/permissions.ts"), { namedExports: { assertPermission: async () => undefined } });
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {},
    // Same precondition as the real tenantTransaction: an explicitly bound school.
    tenantTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const { requireSchoolId } = await import("../../src/lib/db/tenant-context");
      return fn(fakeDb(requireSchoolId()));
    },
  },
});

const exportCsv = async () => {
  const { GET } = await import("../../src/app/api/audit-log/export/route");
  const url = new URL(`http://local/api/audit-log/export?requestKey=${randomUUID()}`);
  const res = await GET({ nextUrl: url } as never);
  return { status: res.status, text: await res.text() };
};

beforeEach(() => { state.user = owner("a"); seed(); });

test("a group owner's export succeeds, and so does a repeat", async () => {
  for (let i = 0; i < 3; i++) {
    const { status, text } = await exportCsv();
    assert.equal(status, 200, text);
    assert.match(text, /student-a/);
  }
});

test("two schools each export only their own activity", async () => {
  assert.doesNotMatch((await exportCsv()).text, /student-b/);
  state.user = owner("b");
  const b = await exportCsv();
  assert.match(b.text, /student-b/);
  assert.doesNotMatch(b.text, /student-a/);
});

test("roles without an activity log are still refused with 403", async () => {
  state.user = { ...owner("a"), role: "TEACHER" };
  assert.equal((await exportCsv()).status, 403);
});
