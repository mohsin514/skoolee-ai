import assert from "node:assert/strict";
import { mock, test } from "node:test";

type Student = { id: string; fullName: string; phone: string | null; profileImageUrl: string | null; campusId: string; studentUserId: string | null; schoolId: string };
type User = { id: string; fullName: string; phone: string | null; profileImageUrl: string | null; role: string; schoolId: string; campusId: string | null };

let students: Student[] = [];
let users: User[] = [];

const matchStudent = (s: Student, where: Record<string, unknown>) => {
  if (where.studentUserId !== undefined && s.studentUserId !== where.studentUserId) return false;
  if (where.fullName !== undefined && s.fullName !== where.fullName) return false;
  if (where.campusId !== undefined && s.campusId !== where.campusId) return false;
  const campus = where.campus as { schoolId?: string } | undefined;
  if (campus?.schoolId !== undefined && s.schoolId !== campus.schoolId) return false;
  return true;
};

const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<User> }) => {
      const u = users.find((x) => x.id === where.id)!;
      Object.assign(u, data);
      return { ...u, email: "x@x.test", qualification: null, specialization: null, subjectSpecialties: [], teachesAllSubjects: false, experience: null, joiningDate: null, city: null };
    },
  },
  student: {
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Student> }) => {
      const hits = students.filter((s) => matchStudent(s, where));
      for (const s of hits) Object.assign(s, data);
      return { count: hits.length };
    },
  },
};

mock.module("@/lib/db/prisma", { namedExports: { prisma: fakePrisma } });
mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } },
    errorResponse: (e: Error) => Response.json({ error: e.message }, { status: 500 }),
    requireAuthUser: async () => currentSession,
  },
});
mock.module("@/lib/api/validate", { namedExports: { parseBody: async (_req: unknown, _schema: unknown) => patchBody } });
mock.module("@/lib/validators/route-bodies", { namedExports: { jsonObjectBody: {} } });
mock.module("@/lib/storage/s3", { namedExports: { deleteFile: async () => {} } });
mock.module("@/lib/locale/display", { namedExports: { getDisplayLocale: async () => ({ language: "en" }) } });
mock.module("@/lib/roles", { namedExports: { dashboardPathForRole: () => "/", roleLabelFor: () => "Student" } });

let currentSession = { userId: "user-a", role: "STUDENT", schoolId: "school-a", campusId: "campus-a", institutionKind: undefined as unknown };
let patchBody: Record<string, unknown> = {};

const loadRoute = () => import("@/app/api/profile/route");
const patch = async (body: Record<string, unknown>) => {
  patchBody = body;
  const { PATCH } = await loadRoute();
  return (await PATCH({} as never)).json();
};

function seed() {
  users = [
    { id: "user-a", fullName: "Amara Khan", phone: "111", profileImageUrl: null, role: "STUDENT", schoolId: "school-a", campusId: "campus-a" },
    { id: "user-b-namesake", fullName: "Amara Khan", phone: "999", profileImageUrl: null, role: "STUDENT", schoolId: "school-a", campusId: "campus-a" },
  ];
  students = [
    { id: "stu-a", fullName: "Amara Khan", phone: "111", profileImageUrl: null, campusId: "campus-a", studentUserId: "user-a", schoolId: "school-a" },
    { id: "stu-b", fullName: "Amara Khan", phone: "999", profileImageUrl: "b.png", campusId: "campus-a", studentUserId: null, schoolId: "school-a" },
    { id: "stu-c-other-campus", fullName: "Amara Khan", phone: "555", profileImageUrl: null, campusId: "campus-b", studentUserId: null, schoolId: "school-a" },
    { id: "stu-d-other-school", fullName: "Amara Khan", phone: "777", profileImageUrl: null, campusId: "campus-x", studentUserId: null, schoolId: "school-b" },
  ];
  currentSession = { userId: "user-a", role: "STUDENT", schoolId: "school-a", campusId: "campus-a", institutionKind: undefined };
}

test("editing the linked student updates only that record, not a same-campus namesake", async () => {
  seed();
  await patch({ phone: "222", fullName: "Amara Khan Jr" });
  assert.equal(students.find((s) => s.id === "stu-a")!.phone, "222");
  assert.equal(students.find((s) => s.id === "stu-a")!.fullName, "Amara Khan Jr");
  const namesake = students.find((s) => s.id === "stu-b")!;
  assert.equal(namesake.phone, "999");
  assert.equal(namesake.fullName, "Amara Khan");
});

test("a profile photo change does not reach a same-campus namesake's photo", async () => {
  seed();
  await patch({ profileImageUrl: "https://cdn.test/a.png" });
  assert.equal(students.find((s) => s.id === "stu-b")!.profileImageUrl, "b.png");
  assert.equal(students.find((s) => s.id === "stu-a")!.profileImageUrl, "https://cdn.test/a.png");
});

test("another campus's namesake is untouched", async () => {
  seed();
  await patch({ phone: "222" });
  assert.equal(students.find((s) => s.id === "stu-c-other-campus")!.phone, "555");
});

test("a student with no linked record mutates nothing by name", async () => {
  seed();
  students = students.map((s) => (s.id === "stu-a" ? { ...s, studentUserId: null } : s));
  await patch({ phone: "222" });
  assert.equal(students.filter((s) => s.phone === "222").length, 0);
  assert.equal(students.find((s) => s.id === "stu-b")!.phone, "999");
});

test("another school's linked record is not updated even with the same link id", async () => {
  seed();
  students = students.map((s) => (s.id === "stu-d-other-school" ? { ...s, studentUserId: "user-a" } : s));
  await patch({ phone: "222" });
  assert.equal(students.find((s) => s.id === "stu-d-other-school")!.phone, "777");
  assert.equal(students.find((s) => s.id === "stu-a")!.phone, "222");
});
