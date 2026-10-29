import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1119: a TEACHER must not mark their own attendance through POST /api/teacher-attendance.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = { user: null as Record<string, unknown> | null, writes: 0 };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    resolveCampusId: async () => "campus-a",
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
const write = async () => { state.writes += 1; return {}; };
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: new Proxy({}, { get: () => ({ findUnique: async () => null, create: write, upsert: write, findMany: async () => [] }) }),
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: async () => undefined } });

const request = (body: unknown) => new Request("http://local/api/teacher-attendance", { method: "POST", body: JSON.stringify(body) }) as never;
const load = () => import("../../src/app/api/teacher-attendance/route");

beforeEach(() => { state.writes = 0; });

test("teacher self-marking is rejected with 403 and writes nothing", async () => {
  const { POST } = await load();
  state.user = { userId: "t1", role: "TEACHER", campusId: "campus-a", schoolId: "school-a" };
  const res = await POST(request({}));
  assert.equal(res.status, 403);
  assert.equal(state.writes, 0);
});

test("other non-admin roles stay forbidden", async () => {
  const { POST } = await load();
  state.user = { userId: "p1", role: "PARENT", campusId: "campus-a", schoolId: "school-a" };
  const res = await POST(request({ entries: [], date: "2026-10-29" }));
  assert.equal(res.status, 403);
});

test("principal reaches the register validation (not blocked by role)", async () => {
  const { POST } = await load();
  state.user = { userId: "pr1", role: "PRINCIPAL", campusId: "campus-a", schoolId: "school-a" };
  const res = await POST(request({}));
  assert.equal(res.status, 400);
});
