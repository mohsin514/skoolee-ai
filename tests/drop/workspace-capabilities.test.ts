import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

// SKAI-1980: the Scan hub asks GET /api/school-ai/workspace?capabilities=1 for its subject list. That answer
// skips the record page entirely, still runs the School AI access check, stays scoped to the caller's school
// and campus, and is never cached. Without the flag the route is unchanged.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type User = { userId: string; role: string; schoolId: string; campusId: string };
class SchoolAiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const subjects = [
  { id: "s-a1", name: "Maths", classId: "c-a1", className: "5A", campusId: "campus-a1", schoolId: "school-a" },
  { id: "s-a2", name: "Science", classId: "c-a2", className: "5B", campusId: "campus-a2", schoolId: "school-a" },
  { id: "s-b1", name: "Maths", classId: "c-b1", className: "5A", campusId: "campus-b1", schoolId: "school-b" },
];
let caller: User | null = null, listed = 0;

mock.module(src("lib/auth/same-origin.ts"), { namedExports: { assertSameOrigin: () => undefined } });
mock.module(src("lib/api/scope.ts"), { namedExports: {
  errorResponse: (error: unknown) => Response.json({ error: (error as Error).message }, { status: error instanceof SchoolAiError ? error.status : 500 }),
} });
mock.module(src("lib/school-ai/access.ts"), { namedExports: {
  SchoolAiError, readSchoolAiJson: async () => ({}),
  requireSchoolAiUser: async () => { if (!caller) throw new SchoolAiError("Not signed in.", 401); if (caller.role === "PARENT") throw new SchoolAiError("Insufficient permissions.", 403); return caller; },
  getWorkspaceCapabilities: async (user: User) => ({ subjects: subjects.filter(row => row.schoolId === user.schoolId && row.campusId === user.campusId) }),
} });
mock.module(src("lib/school-ai/repository.ts"), { namedExports: {
  createWorkspaceRecord: async () => ({}),
  listWorkspaceRecords: async () => { listed++; return { records: [], nextCursor: null }; },
} });
mock.module(src("lib/school-ai/schemas.ts"), { namedExports: {
  createWorkspaceSchema: z.object({}), MAX_WORKSPACE_BODY_BYTES: 1, workspaceKindSchema: z.enum(["SOURCE"]), workspaceStatusSchema: z.enum(["DRAFT"]),
} });

const get = async (query: string) => {
  const { GET } = await import("../../src/app/api/school-ai/workspace/route");
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(`http://localhost/api/school-ai/workspace${query}`));
};
const teacher = (schoolId: string, campusId: string): User => ({ userId: `t-${campusId}`, role: "TEACHER", schoolId, campusId });

test("capabilities-only read skips the record page and returns the caller's own subjects", async () => {
  for (const [user, ids] of [[teacher("school-a", "campus-a1"), ["s-a1"]], [teacher("school-a", "campus-a2"), ["s-a2"]], [teacher("school-b", "campus-b1"), ["s-b1"]]] as const) {
    caller = user; listed = 0;
    const response = await get("?capabilities=1");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.deepEqual(body.capabilities.subjects.map((row: { id: string }) => row.id), ids);
    assert.equal(body.records, undefined);
    assert.equal(listed, 0, "no workspace records are read");
  }
});

test("capabilities-only read is still denied to roles without School AI access", async () => {
  caller = { userId: "p-1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" }; listed = 0;
  assert.equal((await get("?capabilities=1")).status, 403);
  caller = null;
  assert.equal((await get("?capabilities=1")).status, 401);
  assert.equal(listed, 0);
});

test("without the flag the route still returns the record page and capabilities", async () => {
  caller = teacher("school-a", "campus-a1"); listed = 0;
  const response = await get("?limit=5");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.records, []);
  assert.deepEqual(body.capabilities.subjects.map((row: { id: string }) => row.id), ["s-a1"]);
  assert.equal(listed, 1);
});
