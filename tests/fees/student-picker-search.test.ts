// SKAI-1828: the fee discount and carry-forward pickers search the roster on the server (fields=picker) instead
// of preloading `pageSize=1000`, which /api/students ignored (only the first 50 pupils were ever findable).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock, test } from "node:test";

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }

// Synthetic QA fixtures only: two schools, two campuses in school A, 60 pupils on campus A1 so one sits past row 50.
const classes: Record<string, { campusId: string; classTeacherId: string }> = {
  "c-a1": { campusId: "campus-a1", classTeacherId: "t-a1" },
  "c-a2": { campusId: "campus-a2", classTeacherId: "t-a2" },
  "c-b1": { campusId: "campus-b1", classTeacherId: "t-b1" },
};
const campusSchool: Record<string, string> = { "campus-a1": "school-a", "campus-a2": "school-a", "campus-b1": "school-b" };
const pupils = [
  ...Array.from({ length: 60 }, (_, i) => ({ id: `a1-${i}`, fullName: `QA Pupil ${String(i).padStart(2, "0")}`, rollNo: `R${i}`, classId: "c-a1" })),
  { id: "a2-0", fullName: "QA Pupil Zed", rollNo: "R0", classId: "c-a2" },
  { id: "b1-0", fullName: "QA Pupil Zed", rollNo: "R0", classId: "c-b1" },
];

let calls: Array<{ select: Record<string, unknown>; take: number }> = [];
const visible = (where: any) => pupils.filter((p) => {
  const cls = classes[p.classId];
  if (campusSchool[cls.campusId] !== where.campus.schoolId) return false;
  if (where.campus.id && cls.campusId !== where.campus.id) return false;
  if (where.class?.is?.OR && !where.class.is.OR.some((o: any) => o.classTeacherId === cls.classTeacherId)) return false;
  if (where.OR) {
    const q = where.OR[0].id.contains.toLowerCase();
    if (!p.fullName.toLowerCase().includes(q) && !p.rollNo.toLowerCase().includes(q)) return false;
  }
  return true;
});

mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      student: {
        findMany: async ({ where, select, skip, take }: any) => {
          calls.push({ select, take });
          return visible(where).slice(skip, skip + take).map((p) => Object.fromEntries(Object.keys(select).map((k) => [k, (p as any)[k] ?? null])));
        },
        count: async ({ where }: any) => visible(where).length,
      },
    },
  },
});
let currentUser: User;
mock.module("@/lib/lists/access", { namedExports: { assertListBudget: async () => {} } });
mock.module("@/lib/students/create", { namedExports: { createStudentRecords: async () => new Response() } });
mock.module("@/lib/notifications/in-app", { namedExports: { notify: async () => {} } });
mock.module("@/lib/students/enrollment", {
  namedExports: { applyEnrollment: async () => {}, applyGraduation: async () => {}, classSeats: async () => ({}), dateOnly: (d: Date) => d },
});
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    requireAuthUser: async () => currentUser,
    assertModuleRead: async (u: User) => { if (u.role === "PARENT") throw new ApiError("Forbidden", 403); },
    assertPermission: async () => {},
    assertStaffRole: () => {},
    canManageCampusOps: () => true,
    readJsonObject: async () => ({}),
    resolveCampusId: async (u: User, requested: string | null) => requested ?? u.campusId,
    scopedCampusWhere: (u: User, campusId?: string | null) => ({ campus: { schoolId: u.schoolId, ...(campusId ? { id: campusId } : {}) } }),
    errorResponse: (e: { message: string; status?: number }) => Response.json({ success: false, error: e.message }, { status: e.status ?? 500 }),
  },
});

const get = async (user: User, query: string) => {
  currentUser = user;
  calls = [];
  const { GET } = await import("@/app/api/students/route");
  const res = await GET(new Request(`http://localhost/api/students?${query}`) as never);
  return { status: res.status, body: await res.json() };
};
const accountantA1: User = { userId: "acc-a1", role: "ACCOUNTANT", schoolId: "school-a", campusId: "campus-a1" };

test("a pupil past the first 50 is found by a picker search on the same campus", async () => {
  const { body } = await get(accountantA1, "fields=picker&limit=20&search=Pupil%2055&campusId=campus-a1");
  assert.deepEqual(body.data.map((s: { id: string }) => s.id), ["a1-55"]);
});

test("picker rows carry no documents or per-student counts and are capped at 20", async () => {
  const { body } = await get(accountantA1, "fields=picker&limit=200&campusId=campus-a1");
  assert.equal(body.data.length, 20);
  assert.equal(calls[0].take, 20);
  assert.equal("documents" in calls[0].select, false);
  assert.equal("_count" in calls[0].select, false);
  assert.equal("guardianPhone" in body.data[0], false);
  assert.equal(body.pagination.total, 60);
});

test("the full roster read keeps the summary fields without the picker flag", async () => {
  await get(accountantA1, "campusId=campus-a1");
  assert.equal(calls[0].take, 50);
  assert.ok("guardianPhone" in calls[0].select && "class" in calls[0].select);
});

// SKAI-1875: no roster consumer reads documents or per-pupil counts; each row paid a correlated COUNT over
// years of attendance, invoices and timeline events. The profile loads them from /api/students/<id>.
test("roster rows carry no documents or per-pupil attendance, invoice or timeline counts", async () => {
  for (const query of ["campusId=campus-a1&limit=200", "status=archived&limit=100&page=1"]) {
    await get(accountantA1, query);
    assert.equal("documents" in calls[0].select, false);
    assert.equal("_count" in calls[0].select, false);
  }
  const source = readFileSync("src/app/api/students/route.ts", "utf8");
  assert.doesNotMatch(source, /timelineEvents: true/);
});

test("picker search stays inside the caller's school and campus", async () => {
  const a1 = await get(accountantA1, "fields=picker&search=Zed&campusId=campus-a1");
  assert.deepEqual(a1.body.data, []);
  const schoolB = await get({ userId: "acc-b1", role: "ACCOUNTANT", schoolId: "school-b", campusId: "campus-b1" }, "fields=picker&search=Zed");
  assert.deepEqual(schoolB.body.data.map((s: { id: string }) => s.id), ["b1-0"]);
});

test("a teacher's picker keeps the taught-class restriction and a parent is denied", async () => {
  const teacher = await get({ userId: "t-a2", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" }, "fields=picker&search=Pupil");
  assert.deepEqual(teacher.body.data, []);
  const parent = await get({ userId: "p-1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" }, "fields=picker&search=Pupil");
  assert.equal(parent.status, 403);
});

test("the fee pickers no longer preload the roster with the ignored pageSize parameter", () => {
  const source = readFileSync("src/components/fees/FeeLayersTab.tsx", "utf8");
  assert.doesNotMatch(source, /pageSize=1000/);
  assert.match(source, /useStudentPicker\(campusId, search, Boolean\(assigning\)/);
  assert.match(source, /useStudentPicker\(campusId, studentSearch, showModal\)/);
  const hook = readFileSync("src/components/fees/use-student-picker.ts", "utf8");
  assert.match(hook, /fields: "picker"/);
  assert.match(hook, /controller\.abort\(\)/);
});
