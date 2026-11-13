import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1943: the owner's Tenant users list leaves out the platform operator's own account, and the role
// filter / chart labels read distinctly for ADMIN and CAMPUS_ADMIN.
type Row = { id: string; role: string; schoolId: string; isActive: boolean; createdAt: Date };
const users: Row[] = [
  { id: "owner", role: "APP_OWNER", schoolId: "school-a", isActive: true, createdAt: new Date(5) },
  { id: "admin-a", role: "ADMIN", schoolId: "school-a", isActive: true, createdAt: new Date(4) },
  { id: "campus-admin-b", role: "CAMPUS_ADMIN", schoolId: "school-b", isActive: true, createdAt: new Date(3) },
  { id: "teacher-b", role: "TEACHER", schoolId: "school-b", isActive: false, createdAt: new Date(2) },
];
type Where = { NOT?: { role?: string }; role?: string; schoolId?: string; isActive?: boolean };
const matches = (u: Row, w: Where) =>
  (!w.NOT?.role || u.role !== w.NOT.role) && (!w.role || u.role === w.role) &&
  (!w.schoolId || u.schoolId === w.schoolId) && (w.isActive === undefined || u.isActive === w.isActive);
const wheres: Where[] = [];
let caller: { role: string } | null = { role: "APP_OWNER" };

class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const db = {
  user: {
    count: async ({ where }: { where: Where }) => { wheres.push(where); return users.filter((u) => matches(u, where)).length; },
    findMany: async ({ where, skip, take }: { where: Where; skip: number; take: number }) => {
      wheres.push(where);
      return users.filter((u) => matches(u, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(skip, skip + take);
    },
  },
};
mock.module("@/lib/db/prisma", { namedExports: { prisma: db, RLS_ENABLED: false } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requirePlatformOwner: async () => { if (!caller) throw new ApiError("Unauthorized", 401); if (caller.role !== "APP_OWNER") throw new ApiError("Forbidden", 403); return caller; },
    errorResponse: (error: { message: string; status?: number }) => Response.json({ success: false, error: error.message }, { status: error.status ?? 500 }),
  },
});
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async () => {} } });
mock.module("@/lib/owner/account-setup-email", { namedExports: { sendAccountSetupEmail: async () => ({}) } });

const get = async (query = "") => {
  const { GET } = await import("@/app/api/owner/users/route");
  const response = await GET(new Request(`http://localhost/api/owner/users?${query}`) as never);
  return { status: response.status, json: await response.json() };
};

test("the platform operator's own account is not listed as a tenant user", async () => {
  caller = { role: "APP_OWNER" }; wheres.length = 0;
  const { status, json } = await get();
  assert.equal(status, 200);
  assert.deepEqual(json.data.map((u: Row) => u.id), ["admin-a", "campus-admin-b", "teacher-b"]);
  assert.equal(json.pagination.total, 3, "the count leaves it out too");
  assert.ok(wheres.every((w) => w.NOT?.role === "APP_OWNER"));
});

test("filters keep working and still leave the operator out", async () => {
  caller = { role: "APP_OWNER" };
  assert.deepEqual((await get("schoolId=school-a")).json.data.map((u: Row) => u.id), ["admin-a"]);
  assert.deepEqual((await get("role=CAMPUS_ADMIN")).json.data.map((u: Row) => u.id), ["campus-admin-b"]);
  assert.deepEqual((await get("role=APP_OWNER")).json.data, []);
  assert.equal((await get("role=NOPE")).status, 400);
});

test("school roles and signed-out callers are refused", async () => {
  caller = { role: "SUPER_ADMIN" };
  assert.equal((await get()).status, 403);
  caller = null;
  assert.equal((await get()).status, 401);
});

test("platform role labels are distinct for every role in each language; Arabic and Urdu are unchanged", async () => {
  const { platformRoleLabel, roleLabel, USER_ROLES } = await import("@/lib/roles");
  for (const language of ["en", "ar", "ur"] as const) {
    const labels = USER_ROLES.map((role) => platformRoleLabel(role, language));
    assert.equal(new Set(labels).size, labels.length, `${language} labels repeat: ${labels.join(", ")}`);
  }
  assert.equal(platformRoleLabel("ADMIN"), "School Admin");
  assert.equal(platformRoleLabel("CAMPUS_ADMIN"), "Campus Admin");
  for (const role of USER_ROLES) {
    assert.equal(platformRoleLabel(role, "ar"), roleLabel(role, "ar"));
    assert.equal(platformRoleLabel(role, "ur"), roleLabel(role, "ur"));
  }
  assert.equal(roleLabel("ADMIN"), "Campus Admin", "the app-wide label is untouched");
});
