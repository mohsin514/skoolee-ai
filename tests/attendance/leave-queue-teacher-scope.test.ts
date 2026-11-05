// SKAI-759: the learner-leave queue limits a teacher to pupils in classes they teach;
// leaders see the whole campus; other schools and campuses never appear.
import assert from "node:assert/strict";
import { mock, test } from "node:test";

type User = { userId: string; role: string; schoolId: string; campusId: string | null };
// Synthetic QA fixtures only: two schools, two campuses in school A.
const classes = [
  { id: "c-a1-taught", campusId: "campus-a1", classTeacherId: "t-a1", subjectTeacherIds: [] as string[] },
  { id: "c-a1-other", campusId: "campus-a1", classTeacherId: "t-x", subjectTeacherIds: [] as string[] },
  { id: "c-a1-subject", campusId: "campus-a1", classTeacherId: "t-y", subjectTeacherIds: ["t-a1"] },
  { id: "c-a2", campusId: "campus-a2", classTeacherId: "t-a1", subjectTeacherIds: [] as string[] },
];
const students = [
  { id: "s-taught", schoolId: "school-a", classId: "c-a1-taught" },
  { id: "s-other", schoolId: "school-a", classId: "c-a1-other" },
  { id: "s-subject", schoolId: "school-a", classId: "c-a1-subject" },
  { id: "s-a2", schoolId: "school-a", classId: "c-a2" },
  { id: "s-b", schoolId: "school-b", classId: "c-b" },
];
const leave = [
  { id: "l1", schoolId: "school-a", campusId: "campus-a1", studentId: "s-taught", status: "PENDING" },
  { id: "l2", schoolId: "school-a", campusId: "campus-a1", studentId: "s-other", status: "PENDING" },
  { id: "l3", schoolId: "school-a", campusId: "campus-a1", studentId: "s-subject", status: "CLARIFICATION" },
  { id: "l4", schoolId: "school-a", campusId: "campus-a2", studentId: "s-a2", status: "PENDING" },
  { id: "l5", schoolId: "school-b", campusId: "campus-b1", studentId: "s-b", status: "PENDING" },
];
class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }

function classMatches(c: (typeof classes)[number] | undefined, w: any): boolean {
  if (!w) return true;
  if (!c) return false;
  if (w.campusId && c.campusId !== w.campusId) return false;
  if (w.OR) {
    return w.OR.some((o: any) => (o.classTeacherId && c.classTeacherId === o.classTeacherId) || (o.subjects && c.subjectTeacherIds.includes(o.subjects.some.teacherId)));
  }
  return true;
}

mock.module("@/lib/api/scope", {
  namedExports: {
    ApiError,
    assertPermission: async () => {},
    canMarkAttendance: (u: User) => ["SUPER_ADMIN", "ADMIN", "TEACHER"].includes(u.role),
  },
});
mock.module("@/lib/db/prisma", {
  namedExports: {
    prisma: {
      learnerLeaveRequest: {
        findMany: async ({ where }: any) => leave.filter((l) =>
          l.schoolId === where.schoolId && l.campusId === where.campusId && where.status.in.includes(l.status)
          && (!where.studentId || where.studentId.in.includes(l.studentId))),
      },
      student: {
        findMany: async ({ where }: any) => students
          .filter((s) => s.schoolId === where.schoolId && (!where.id || where.id.in.includes(s.id))
            && classMatches(classes.find((c) => c.id === s.classId), where.class))
          .map((s) => ({ id: s.id, fullName: s.id, class: { name: s.classId, section: null } })),
      },
    },
  },
});
mock.module("@/lib/datetime", { namedExports: { calendarDateIn: () => "2026-11-06" } });
mock.module("@/lib/locale/store", { namedExports: { getLocalePackage: async () => ({}) } });
mock.module("@/lib/parent/guardian-access", { namedExports: { guardianHasAccess: async () => true } });
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async () => null } });

const queue = async (user: User, campusId: string) => {
  const { staffLeaveQueue } = await import("@/lib/family/leave");
  return (await staffLeaveQueue(user as never, campusId)).map((r: { id: string }) => r.id).sort();
};

test("a teacher sees leave only for pupils in classes they teach (class or subject teacher)", async () => {
  assert.deepEqual(await queue({ userId: "t-a1", role: "TEACHER", schoolId: "school-a", campusId: "campus-a1" }, "campus-a1"), ["l1", "l3"]);
});

test("a campus leader sees the whole campus queue, not another campus or school", async () => {
  assert.deepEqual(await queue({ userId: "a1", role: "ADMIN", schoolId: "school-a", campusId: "campus-a1" }, "campus-a1"), ["l1", "l2", "l3"]);
  assert.deepEqual(await queue({ userId: "b1", role: "ADMIN", schoolId: "school-b", campusId: "campus-b1" }, "campus-b1"), ["l5"]);
});

test("a role that cannot mark attendance is refused", async () => {
  await assert.rejects(queue({ userId: "p1", role: "PARENT", schoolId: "school-a", campusId: "campus-a1" }, "campus-a1"), /cannot review/);
});
