import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1502: GET /api/teacher-attendance must not expose campus-wide staff data to
// parents, students or ordinary teachers, and must keep school/campus scoping.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type U = { userId: string; role: string; campusId: string; schoolId: string };
const state = { user: null as U | null, calls: [] as { model: string; where: Record<string, unknown> }[] };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const TEACHERS: Record<string, { id: string; fullName: string; email: string }[]> = {
  "campus-a": [{ id: "ta1", fullName: "Alpha One", email: "ta1@qa.test" }, { id: "ta2", fullName: "Alpha Two", email: "ta2@qa.test" }],
  "campus-b": [{ id: "tb1", fullName: "Beta One", email: "tb1@qa.test" }],
};

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ValidationError: class extends Error {},
    ApiError,
    requireAuthUser: async () => state.user,
    resolveCampusId: async (u: U) => u.campusId,
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
const model = (name: string) => ({
  findMany: async ({ where }: { where: Record<string, unknown> }) => {
    state.calls.push({ model: name, where });
    if (name === "user") return TEACHERS[where.campusId as string] ?? [];
    return [];
  },
});
mock.module(src("lib/db/prisma.ts"), {
  namedExports: { prisma: { user: model("user"), teacherAttendance: model("teacherAttendance") } },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: async () => undefined } });

const get = async (qs: string) => {
  const { GET } = await import("../../src/app/api/teacher-attendance/route");
  const url = new URL(`http://local/api/teacher-attendance?${qs}`);
  return GET({ nextUrl: url } as never);
};
const as = (role: string, campus: "a" | "b", userId = `${role.toLowerCase()}-${campus}`) => {
  state.user = { userId, role, campusId: `campus-${campus}`, schoolId: `school-${campus}` };
};

beforeEach(() => { state.calls = []; });

for (const role of ["PARENT", "STUDENT"]) {
  for (const qs of ["date=2026-10-31", "month=2026-10", "userId=ta1&month=2026-10"]) {
    test(`${role} is denied (${qs}) and nothing is queried`, async () => {
      as(role, "a");
      const res = await get(qs);
      assert.equal(res.status, 403);
      assert.equal(state.calls.length, 0);
    });
  }
}

test("teacher without userId is forced to self scope", async () => {
  as("TEACHER", "a", "ta1");
  for (const qs of ["date=2026-10-31", "month=2026-10"]) {
    state.calls = [];
    const res = await get(qs);
    assert.equal(res.status, 200);
    assert.equal(state.calls.some((c) => c.model === "user"), false);
    assert.deepEqual(state.calls.map((c) => c.where.userId), ["ta1"]);
  }
});

test("teacher asking for another teacher is denied", async () => {
  as("TEACHER", "a", "ta1");
  assert.equal((await get("userId=ta2&month=2026-10")).status, 403);
  assert.equal(state.calls.length, 0);
});

for (const role of ["CAMPUS_ADMIN", "PRINCIPAL"]) {
  test(`${role} reads only its own campus roster across two schools`, async () => {
    as(role, "a");
    const a = await (await get("date=2026-10-31")).json();
    assert.deepEqual(a.data.items.map((t: { id: string }) => t.id), ["ta1", "ta2"]);
    as(role, "b");
    const b = await (await get("month=2026-10")).json();
    assert.deepEqual(b.data.items.map((t: { userId: string }) => t.userId), ["tb1"]);
    assert.ok(state.calls.every((c) => c.where.campusId));
  });
}

test("malformed date or month is rejected", async () => {
  as("CAMPUS_ADMIN", "a");
  assert.equal((await get("month=bad")).status, 400);
  assert.equal((await get("date=2026-13-40")).status, 400);
});
