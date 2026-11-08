import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1113: POST /api/super/active-campus — SUPER_ADMIN only, own-school live campus only.
const root = join(__dirname, "..", "..");
const src = (path: string) => pathToFileURL(join(root, "src", path)).href;

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const h = { user: null as null | Record<string, unknown>, lookups: [] as unknown[] };
const CAMPUSES = [{ id: "campus-a1", schoolId: "school-a" }, { id: "campus-b1", schoolId: "school-b" }];

mock.module(src("lib/api/scope.ts"), { namedExports: {
  ApiError,
  requireAuthUser: async () => { if (!h.user) throw new ApiError("Unauthorized", 401); return h.user; },
  errorResponse: (error: unknown) => Response.json({ error: (error as Error).message }, { status: error instanceof ApiError ? error.status : 500 }),
} });
mock.module(src("lib/auth/same-origin.ts"), { namedExports: { assertSameOrigin: () => {} } });
mock.module(src("lib/db/tenant-context.ts"), { namedExports: { runUnscoped: async (_r: string, fn: () => unknown) => fn() } });
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: { campus: {
  findFirst: async ({ where }: { where: { id: string; schoolId: string; archivedAt: null } }) => {
    h.lookups.push(where);
    return CAMPUSES.find(c => c.id === where.id && c.schoolId === where.schoolId) ?? null;
  },
  findMany: async ({ where }: { where: { schoolId: string } }) => CAMPUSES.filter(c => c.schoolId === where.schoolId).map(c => ({ id: c.id, name: c.id, city: "City" })),
} } } });

const post = async (body: unknown) => {
  const route = await import("../../src/app/api/super/active-campus/route");
  return route.POST(new Request("http://local/api/super/active-campus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
};
const superAdmin = { userId: "sa-a", schoolId: "school-a", campusId: null, role: "SUPER_ADMIN" };

beforeEach(() => { h.user = superAdmin; h.lookups = []; });

test("sets a user-bound cookie for a campus of the caller's school", async () => {
  const response = await post({ campusId: "campus-a1" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /skoolee_active_campus=sa-a%3Acampus-a1|skoolee_active_campus=sa-a:campus-a1/);
  assert.match(cookie, /HttpOnly/i);
  assert.deepEqual(h.lookups[0], { id: "campus-a1", schoolId: "school-a", archivedAt: null });
});

test("another school's campus gets 404 and no cookie", async () => {
  const response = await post({ campusId: "campus-b1" });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("null clears the choice back to All campuses", async () => {
  const response = await post({ campusId: null });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /skoolee_active_campus=;.*Max-Age=0/i);
});

test("non-SUPER_ADMIN roles are refused and bad input is rejected", async () => {
  for (const role of ["ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER", "PARENT"]) {
    h.user = { ...superAdmin, role, campusId: "campus-a1" };
    assert.equal((await post({ campusId: "campus-a1" })).status, 403, role);
  }
  h.user = superAdmin;
  assert.equal((await post({ campusId: 42 })).status, 400);
  h.user = null;
  assert.equal((await post({ campusId: "campus-a1" })).status, 401);
});

test("GET lists only the caller's school campuses", async () => {
  const route = await import("../../src/app/api/super/active-campus/route");
  const body = await (await route.GET()).json();
  assert.deepEqual(body.data.campuses.map((c: { id: string }) => c.id), ["campus-a1"]);
  assert.equal(body.data.activeCampusId, null);
});
