import assert from "node:assert/strict";
import { before, mock, test } from "node:test";
import { readFileSync } from "node:fs";

// SKAI-1211: the shared reviewed DELETE handler answers in the SKAI-1163 envelope.
// Auth, scope and the transaction are stubbed so the real operationDeleteResponse runs.
class ApiError extends Error {
  status: number; code?: string;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
class ValidationError extends ApiError {}
let role = "CAMPUS_ADMIN";
const user = () => ({ userId: "u1", schoolId: "qa-01", campusId: "campus-a", role });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError, ValidationError,
    errorResponse: (error: unknown) => error instanceof ApiError ? Response.json({ error: error.message }, { status: error.status }) : Response.json({ error: "Request failed" }, { status: 500 }),
    requireAuthUser: async () => user(),
    resolveCampusId: async () => "campus-a",
    assertStaffRole: () => undefined,
    canManageCampusOps: () => role === "CAMPUS_ADMIN",
    canManageFinance: () => role === "CAMPUS_ADMIN",
    canManageLibrary: () => role === "CAMPUS_ADMIN",
  },
});
const groups: Record<string, { id: string; name: string; campusId: string; schoolId: string; updatedAt: Date; _count: { students: number } }> = {
  g1: { id: "g1", name: "Robotics", campusId: "campus-a", schoolId: "qa-01", updatedAt: new Date("2026-01-01T00:00:00Z"), _count: { students: 0 } },
};
const tx = {
  campus: { findFirst: async () => ({ id: "campus-a" }) },
  auditLog: { findFirst: async () => null, create: async () => ({}) },
  studentGroup: {
    findFirst: async ({ where }: { where: { id: string; campusId: string; schoolId: string } }) => {
      const row = groups[where.id];
      return row && row.campusId === where.campusId && row.schoolId === where.schoolId ? row : null;
    },
    delete: async ({ where }: { where: { id: string } }) => { delete groups[where.id]; },
  },
};
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, work: (t: unknown) => unknown) => work(tx) } });
mock.module("@/lib/api/teacher-assignments", { namedExports: { authorizeAssignment: async () => undefined } });
mock.module("@/lib/timetable/locking", { namedExports: { lockTimetableCampus: async () => undefined } });
mock.module("@/lib/storage/s3", { namedExports: { deleteFile: async () => undefined } });

type Handler = (request: never, kind: string) => Promise<Response>;
let handler: Handler;
before(async () => { handler = (await import("../../src/lib/destructive/operations")).operationDeleteResponse as unknown as Handler; });

const call = (query: string, version?: string) => {
  const url = new URL(`http://localhost/api/student-groups?${query}`);
  return handler({ nextUrl: url, headers: new Headers(version ? { "If-Match": version } : {}) } as never, "student-groups");
};

test("preview and confirmed delete return { data }", async () => {
  role = "CAMPUS_ADMIN";
  const preview = await call("id=g1&preview=true");
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("Cache-Control"), "no-store");
  const body = await preview.json();
  assert.equal(body.success, undefined);
  assert.equal(body.data.preview.label, "Robotics");
  assert.equal(body.data.preview.blocked, false);
  const done = await call("id=g1", body.data.preview.version);
  assert.equal(done.status, 200);
  assert.deepEqual(await done.json(), { data: { id: "g1", replayed: false } });
});

test("not found, unreviewed and denied deletes return { error: { code, message } }", async () => {
  role = "CAMPUS_ADMIN";
  groups.g2 = { id: "g2", name: "Chess", campusId: "campus-a", schoolId: "qa-01", updatedAt: new Date(), _count: { students: 0 } };
  groups.other = { id: "other", name: "Other school", campusId: "campus-a", schoolId: "qa-02", updatedAt: new Date(), _count: { students: 0 } };
  const missing = await call("id=other&preview=true");
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: { code: "NOT_FOUND", message: "Record not found" } });
  const unreviewed = await call("id=g2");
  assert.equal(unreviewed.status, 428);
  assert.equal((await unreviewed.json()).error.message, "Review the record before confirming deletion.");
  groups.g2._count.students = 3;
  const blocked = await call("id=g2&preview=true");
  assert.equal((await blocked.json()).data.preview.blocked, true);
  assert.equal((await call("id=g2")).status, 409);
  role = "TEACHER";
  const denied = await call("id=g2&preview=true");
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: { code: "FORBIDDEN", message: "Insufficient permissions" } });
  assert.ok(groups.g2, "denied delete kept the record");
});

test("the reviewed-delete dialog reads the envelope", () => {
  const source = readFileSync("src/components/ui/reviewed-delete.tsx", "utf8");
  assert.match(source, /readApiData<\{ preview\?: Preview \}>/);
  assert.doesNotMatch(source, /result\.preview/);
  assert.doesNotMatch(readFileSync("src/lib/destructive/operations.ts", "utf8"), /errorResponse\(|Response\.json\(/);
});
