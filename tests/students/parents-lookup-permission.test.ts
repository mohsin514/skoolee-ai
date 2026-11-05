// SKAI-757: /api/students/parents (admission guardian picker) needs Students > Add,
// not just a staff role, and stays inside the caller's campus and school.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
// Synthetic QA fixtures only: two schools, two campuses in school A.
const parents = [
  { id: "p-a1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1", fullName: "QA Guardian A1" },
  { id: "p-a2", role: "PARENT", schoolId: "school-a", campusId: "campus-a2", fullName: "QA Guardian A2" },
  { id: "p-b1", role: "PARENT", schoolId: "school-b", campusId: "campus-b1", fullName: "QA Guardian B1" },
];
const campuses: Record<string, string> = { "campus-a1": "school-a", "campus-a2": "school-a", "campus-b1": "school-b" };

let current: User;
const granted = new Set<string>();
class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => current,
    assertStaffRole: (u: User) => { if (u.role === "PARENT" || u.role === "STUDENT") throw new ApiError("no", 403); },
    assertPermission: async (u: User, module: string, action: string) => {
      if (!granted.has(`${u.role}:${module}.${action}`)) throw new ApiError("Forbidden", 403);
    },
    resolveCampusId: async (u: User, requested?: string | null) => {
      const id = u.role === "SUPER_ADMIN" ? requested || u.campusId : u.campusId;
      if (!id || campuses[id] !== u.schoolId) throw new ApiError("Campus not found", 404);
      return id;
    },
    errorResponse: (e: ApiError) => Response.json({ error: e.message }, { status: e.status ?? 500 }),
  },
});
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      user: {
        findMany: async ({ where }: any) =>
          parents
            .filter((p) => p.role === where.role && p.campusId === where.campusId)
            .map((p) => ({ id: p.id, fullName: p.fullName, parentedStudents: [] })),
      },
    },
  },
});

const call = async (qs = "?search=QA") => {
  const { GET } = await import("@/app/api/students/parents/route");
  const res = await GET(new NextRequest(`https://school.test/api/students/parents${qs}`));
  return { status: res.status, body: await res.json() };
};

test("a role with Students > Add sees own-campus guardians only", async () => {
  granted.clear(); granted.add("ADMIN:students.add");
  current = { userId: "u1", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
  const r = await call();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map((p: any) => p.id), ["p-a1"]);
});

test("a staff role without Students > Add is refused and gets no guardian contacts", async () => {
  granted.clear(); granted.add("LIBRARIAN:students.view");
  current = { userId: "u2", role: "LIBRARIAN", schoolId: "school-a", campusId: "campus-a1" };
  const r = await call();
  assert.equal(r.status, 403);
  assert.equal(r.body.data, undefined);
});

test("families are refused", async () => {
  granted.clear();
  current = { userId: "u3", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" };
  assert.equal((await call()).status, 403);
});

test("a super admin cannot pick another school's campus", async () => {
  granted.clear(); granted.add("SUPER_ADMIN:students.add");
  current = { userId: "u4", role: "SUPER_ADMIN", schoolId: "school-a", campusId: "campus-a1" };
  const other = await call("?search=QA&campusId=campus-b1");
  assert.equal(other.status, 404);
  const second = await call("?search=QA&campusId=campus-a2");
  assert.deepEqual(second.body.data.map((p: any) => p.id), ["p-a2"]);
});
