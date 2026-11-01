import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1502: campus-wide teacher attendance is for campus operators only; teachers read only their own record.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = { user: null as Record<string, unknown> | null, queries: [] as Array<Record<string, unknown>> };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    resolveCampusId: async () => "campus-a",
    canManageCampusOps: (user: { role: string }) => user.role === "CAMPUS_ADMIN" || user.role === "SUPER_ADMIN",
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
const read = async (args: Record<string, unknown>) => { state.queries.push(args); return []; };
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: new Proxy({}, { get: () => ({ findMany: read }) }),
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: async () => undefined } });

const get = (query: string) => ({ nextUrl: new URL(`http://local/api/teacher-attendance?${query}`) }) as never;
const load = () => import("../../src/app/api/teacher-attendance/route");

beforeEach(() => { state.queries = []; });

test("parents and students are denied campus-wide teacher attendance", async () => {
  const { GET } = await load();
  for (const role of ["PARENT", "STUDENT"]) {
    state.user = { userId: "u-parent", role, schoolId: "school-a", campusId: "campus-a" };
    const res = await GET(get("date=2026-10-31"));
    assert.equal(res.status, 403, role);
  }
  assert.equal(state.queries.length, 0);
});

test("teacher without userId is forced to their own record", async () => {
  const { GET } = await load();
  state.user = { userId: "t-1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  const res = await GET(get("date=2026-10-31"));
  assert.equal(res.status, 200);
  assert.equal(state.queries.length, 1);
  assert.deepEqual((state.queries[0] as { where: { userId: string } }).where.userId, "t-1");
});

test("teacher asking for another teacher is denied", async () => {
  const { GET } = await load();
  state.user = { userId: "t-1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
  const res = await GET(get("date=2026-10-31&userId=t-2"));
  assert.equal(res.status, 403);
});

test("campus operator can read the campus-wide view", async () => {
  const { GET } = await load();
  state.user = { userId: "op-1", role: "CAMPUS_ADMIN", schoolId: "school-a", campusId: "campus-a" };
  const res = await GET(get("date=2026-10-31"));
  assert.equal(res.status, 200);
});
