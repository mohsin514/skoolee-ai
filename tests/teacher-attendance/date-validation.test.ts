import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-135: attendance dates are stored as calendar days in UTC, impossible dates and unknown statuses
// are rejected before any write, and a campus outside the caller's school is denied.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

const state = {
  user: null as Record<string, unknown> | null,
  upserts: [] as Array<{ where: { userId_date: { userId: string; date: Date } }; update: unknown }>,
};

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requireAuthUser: async () => state.user,
    resolveCampusId: async (user: { schoolId: string }, requested?: string | null) => {
      const campusSchool: Record<string, string> = { "campus-alpha": "school-alpha", "campus-beta": "school-beta" };
      const campusId = requested || "campus-alpha";
      if (campusSchool[campusId] !== user.schoolId) throw new ApiError("This account cannot access that record", 403);
      return campusId;
    },
    errorResponse: (error: unknown) => {
      const status = error instanceof ApiError ? error.status : 500;
      return Response.json({ success: false, error: (error as Error).message }, { status });
    },
  },
});
const upsert = async (args: any) => { state.upserts.push(args); return {}; };
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      teacherAttendance: { upsert },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  },
});
mock.module(src("lib/notifications/in-app.ts"), { namedExports: { notify: async () => undefined } });

const request = (body: unknown) => new Request("http://local/api/teacher-attendance", { method: "POST", body: JSON.stringify(body) }) as never;
const load = () => import("../../src/app/api/teacher-attendance/route");
const admin = { userId: "a1", role: "CAMPUS_ADMIN", campusId: "campus-alpha", schoolId: "school-alpha", fullName: "Admin" };
const entry = { userId: "t1", status: "PRESENT" };

beforeEach(() => { state.upserts = []; state.user = admin; });

test("a valid date is stored as the same UTC calendar day regardless of server timezone", async () => {
  const { POST } = await load();
  const res = await POST(request({ date: "2026-11-12", entries: [entry] }));
  assert.equal(res.status, 200);
  assert.equal(state.upserts.length, 1);
  assert.equal(state.upserts[0].where.userId_date.date.toISOString(), "2026-11-12T00:00:00.000Z");
});

test("impossible calendar dates are rejected with 400 and nothing is written", async () => {
  const { POST } = await load();
  for (const date of ["2026-13-45", "2026-02-30", "2026-11-31"]) {
    const res = await POST(request({ date, entries: [entry] }));
    assert.equal(res.status, 400, date);
  }
  assert.equal(state.upserts.length, 0);
});

test("an unknown status is a 400 validation error and writes nothing, even alongside a valid entry", async () => {
  const { POST } = await load();
  const res = await POST(request({ date: "2026-11-12", entries: [entry, { userId: "t2", status: "BOGUS" }] }));
  assert.equal(res.status, 400);
  assert.equal(state.upserts.length, 0);
});

test("an entry without a userId is a 400 and writes nothing", async () => {
  const { POST } = await load();
  const res = await POST(request({ date: "2026-11-12", entries: [{ status: "PRESENT" }] }));
  assert.equal(res.status, 400);
  assert.equal(state.upserts.length, 0);
});

test("an admin of another school cannot mark attendance for a campus they do not own", async () => {
  const { POST } = await load();
  const res = await POST(request({ date: "2026-11-12", entries: [entry], campusId: "campus-beta" }));
  assert.equal(res.status, 403);
  assert.equal(state.upserts.length, 0);
});
