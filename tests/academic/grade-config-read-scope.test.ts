import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1685: GET /api/grade-config must check exams.view and resolve the class inside the caller's campus.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

type User = { userId: string; role: string; schoolId: string; campusId: string };
const A: User = { userId: "admin-a", role: "PRINCIPAL", schoolId: "school-a", campusId: "campus-a" };
const B: User = { userId: "admin-b", role: "PRINCIPAL", schoolId: "school-b", campusId: "campus-b" };
const CLASSES = [
  { id: "class-a", campusId: "campus-a", name: "Class 5", section: "A" },
  { id: "class-b", campusId: "campus-b", name: "Class 5", section: "A" },
];
const CONFIGS = [
  { id: "cfg-a", classId: "class-a", academicYear: 2026, passingPercentage: 40, isActive: true, updatedAt: new Date(0) },
  { id: "cfg-b", classId: "class-b", academicYear: 2026, passingPercentage: 65, isActive: true, updatedAt: new Date(0) },
];
const state = { user: A as User | null, denyExams: false };

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

mock.module(src("lib/auth.ts"), { namedExports: { getAuthUser: async () => state.user } });
mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    assertStaffRole: (u: User) => { if (u.role === "STUDENT" || u.role === "PARENT") throw new ApiError("Not available", 403); },
    assertPermission: async () => { if (state.denyExams) throw new ApiError("Insufficient permissions: exams.view", 403); },
    canLeadAcademics: async () => true,
  },
});
mock.module(src("lib/group-policy/service.ts"), { namedExports: { assertWritable: async () => ({}), recordProvenance: async () => undefined } });
mock.module(src("lib/db/prisma.ts"), {
  namedExports: {
    prisma: {
      class: {
        findFirst: async ({ where }: { where: { id: string; campusId: string } }) =>
          CLASSES.find((c) => c.id === where.id && c.campusId === where.campusId) ?? null,
        findMany: async ({ where }: { where: { campusId: string } }) =>
          CLASSES.filter((c) => c.campusId === where.campusId).map((c) => ({ ...c, _count: { students: 1, subjects: 1 } })),
      },
      gradeWeightConfig: {
        findUnique: async ({ where }: { where: { classId_academicYear: { classId: string } } }) =>
          CONFIGS.find((c) => c.classId === where.classId_academicYear.classId) ?? null,
        findMany: async ({ where }: { where: { classId: { in: string[] } } }) => CONFIGS.filter((c) => where.classId.in.includes(c.classId)),
      },
    },
  },
});

const get = async (query: string) => {
  const { GET } = await import("../../src/app/api/grade-config/route");
  const res = await GET(new Request(`http://local/api/grade-config?${query}`) as never);
  return { status: res.status, body: await res.json() };
};

beforeEach(() => { state.user = A; state.denyExams = false; });

test("same-campus class returns its configured rules", async () => {
  const { status, body } = await get("classId=class-a&academicYear=2026");
  assert.equal(status, 200);
  assert.equal(body.exists, true);
  assert.equal(body.config.passingPercentage, 40);
});

test("another school's class reads as not found, identical to an unknown id", async () => {
  const foreign = await get("classId=class-b&academicYear=2026");
  const unknown = await get("classId=missing&academicYear=2026");
  assert.equal(foreign.status, 404);
  assert.deepEqual(foreign, unknown);
  assert.equal(JSON.stringify(foreign.body).includes("65"), false);
});

test("two schools each see only their own class in scope=all and single reads", async () => {
  state.user = B;
  assert.equal((await get("classId=class-b&academicYear=2026")).body.config.passingPercentage, 65);
  assert.equal((await get("classId=class-a&academicYear=2026")).status, 404);
  const all = await get("scope=all&academicYear=2026");
  assert.deepEqual(all.body.data.flatMap((g: { sections: { id: string }[] }) => g.sections.map((s) => s.id)), ["class-b"]);
});

test("families and staff without exams.view are refused with 403", async () => {
  state.user = { ...A, role: "PARENT" };
  assert.equal((await get("classId=class-a&academicYear=2026")).status, 403);
  assert.equal((await get("scope=all&academicYear=2026")).status, 403);
  state.user = { ...A, role: "LIBRARIAN" };
  state.denyExams = true;
  assert.equal((await get("classId=class-a&academicYear=2026")).status, 403);
});
