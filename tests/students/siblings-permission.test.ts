// SKAI-1757: /api/students/siblings needs Students > View, campus scope and teacher class scope.
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
type Row = { id: string; schoolId: string; campusId: string; siblingGroupId: string | null; teacherIds: string[]; parent: Record<string, string> };

// Synthetic QA fixtures only: two schools, two campuses in school A.
const rows: Row[] = [
  { id: "a1-s1", schoolId: "school-a", campusId: "campus-a1", siblingGroupId: "g-a", teacherIds: ["t-a1"], parent: { id: "p1", fullName: "QA Guardian 1", phone: "000-0001", email: "g1@qa.test" } },
  { id: "a1-s2", schoolId: "school-a", campusId: "campus-a1", siblingGroupId: "g-a", teacherIds: [], parent: { id: "p1", fullName: "QA Guardian 1", phone: "000-0001", email: "g1@qa.test" } },
  { id: "a2-s1", schoolId: "school-a", campusId: "campus-a2", siblingGroupId: "g-a", teacherIds: [], parent: { id: "p2", fullName: "QA Guardian 2", phone: "000-0002", email: "g2@qa.test" } },
  { id: "b-s1", schoolId: "school-b", campusId: "campus-b1", siblingGroupId: "g-a", teacherIds: [], parent: { id: "p3", fullName: "QA Guardian 3", phone: "000-0003", email: "g3@qa.test" } },
];

let current: User;
const denied = new Set<string>();
class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }

function matches(r: Row, w: any): boolean {
  if (w.id && r.id !== w.id) return false;
  if (w.schoolId && r.schoolId !== w.schoolId) return false;
  if (w.campusId && r.campusId !== w.campusId) return false;
  if (typeof w.siblingGroupId === "string" && r.siblingGroupId !== w.siblingGroupId) return false;
  const or = w.class?.is?.OR;
  if (or) {
    const tid = or[0].classTeacherId;
    if (!r.teacherIds.includes(tid)) return false;
  }
  return true;
}
function project(r: Row, select: any) {
  const parent = select.parent ? Object.fromEntries(Object.keys(select.parent.select).map((k) => [k, r.parent[k]])) : undefined;
  return { id: r.id, siblingGroupId: r.siblingGroupId, ...(parent ? { parent } : {}) };
}

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => current,
    assertStaffRole: (u: User) => { if (u.role === "PARENT" || u.role === "STUDENT") throw new ApiError("no", 403); },
    assertPermission: async (u: User, module: string, action: string) => {
      if (denied.has(`${u.role}:${module}.${action}`)) throw new ApiError("Forbidden", 403);
    },
    errorResponse: (e: ApiError) => Response.json({ error: e.message }, { status: e.status ?? 500 }),
  },
});
mock.module("@/lib/auth/policy", {
  namedExports: {
    campusScope: (u: User) => u.role === "SUPER_ADMIN" ? { schoolId: u.schoolId } : { schoolId: u.schoolId, campusId: u.campusId },
  },
});
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      student: {
        findFirst: async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
        findMany: async ({ where, select }: any) => rows.filter((r) => matches(r, where)).map((r) => project(r, select)),
      },
    },
  },
});

const call = async (qs = "") => {
  const { GET } = await import("@/app/api/students/siblings/route");
  const res = await GET(new NextRequest(`https://school.test/api/students/siblings${qs}`));
  return { status: res.status, body: await res.json() };
};
const ids = (b: { data: { id: string }[] }) => b.data.map((r) => r.id).sort();

test("permitted campus registrar sees only own-campus siblings with guardian contacts", async () => {
  current = { userId: "r-a1", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
  const list = await call();
  assert.equal(list.status, 200);
  assert.deepEqual(ids(list.body), ["a1-s1", "a1-s2"]);
  assert.equal(list.body.data[0].parent.phone, "000-0001");
  const byStudent = await call("?studentId=a1-s1");
  assert.deepEqual(ids(byStudent.body), ["a1-s1", "a1-s2"]);
});

test("role without Students view gets 403 and no data in both modes", async () => {
  current = { userId: "sup-a1", role: "SUPPORT", schoolId: "school-a", campusId: "campus-a1" };
  denied.add("SUPPORT:students.view");
  for (const qs of ["", "?studentId=a1-s1", "?search=QA"]) {
    const r = await call(qs);
    assert.equal(r.status, 403);
    assert.equal(r.body.data, undefined);
  }
});

test("another campus's pupil is not found and its guardians never returned", async () => {
  current = { userId: "r-a1", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" };
  assert.equal((await call("?studentId=a2-s1")).status, 404);
  assert.ok(!JSON.stringify((await call()).body).includes("g2@qa.test"));
});

test("two schools are isolated even for a school-wide admin", async () => {
  current = { userId: "sa-a", role: "SUPER_ADMIN", schoolId: "school-a", campusId: null };
  assert.deepEqual(ids((await call()).body), ["a1-s1", "a1-s2", "a2-s1"]);
  assert.equal((await call("?studentId=b-s1")).status, 404);
  current = { userId: "sa-b", role: "SUPER_ADMIN", schoolId: "school-b", campusId: null };
  assert.deepEqual(ids((await call()).body), ["b-s1"]);
});

test("teacher is limited to taught classes and gets no guardian contacts", async () => {
  current = { userId: "t-a1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" };
  const list = await call();
  assert.deepEqual(ids(list.body), ["a1-s1"]);
  assert.deepEqual(Object.keys(list.body.data[0].parent).sort(), ["fullName", "id"]);
  assert.equal((await call("?studentId=a1-s2")).status, 404);
});
