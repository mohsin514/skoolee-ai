import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1884: the polled control-room board counts integrity events by (school, campus, assignment), so the
// composite index is used in full. Counts are unchanged, and nothing from another school or campus leaks in.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
type Row = Record<string, unknown>;
type User = { userId: string; role: string; schoolId: string; campusId: string };
const groupWheres: Row[] = [];
const matches = (row: Row, where: Row = {}) => Object.entries(where).every(([key, cond]) => cond && typeof cond === "object" && "in" in (cond as Row) ? (cond as { in: unknown[] }).in.includes(row[key]) : row[key] === cond);
const pick = (row: Row, select?: Row) => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : { ...row };
const tables: Record<string, Row[]> = { student: [], schoolAiExamAttempt: [], schoolAiExamIntegrityEvent: [] };
const tx = {
  student: { findMany: async (args: { where: Row; select?: Row }) => tables.student.filter(r => matches(r, args.where)).map(r => pick(r, args.select)) },
  schoolAiExamAttempt: { findMany: async (args: { where: Row; select?: Row }) => tables.schoolAiExamAttempt.filter(r => matches(r, args.where)).map(r => pick(r, args.select)) },
  schoolAiExamIntegrityEvent: { groupBy: async (args: { where: Row }) => {
    groupWheres.push(args.where);
    const counts = new Map<string, number>();
    for (const row of tables.schoolAiExamIntegrityEvent.filter(r => matches(r, args.where))) counts.set(row.attemptId as string, (counts.get(row.attemptId as string) ?? 0) + 1);
    return [...counts].map(([attemptId, n]) => ({ attemptId, _count: { _all: n } }));
  } },
};
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
const assignments: Row[] = [
  { id: "exam-a", schoolId: "school-a", campusId: "campus-a", title: "Maths", studentIds: ["s-1", "s-2"], startsAt: new Date(0), endsAt: new Date(0) },
  { id: "exam-b", schoolId: "school-b", campusId: "campus-b", title: "Maths", studentIds: ["s-9"], startsAt: new Date(0), endsAt: new Date(0) },
];
mock.module(src("lib/school-ai/transaction.ts"), { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => unknown) => fn(tx) } });
mock.module(src("lib/api/scope.ts"), { namedExports: { ApiError } });
mock.module(src("lib/audit-events.ts"), { namedExports: { writeAuditEvent: async () => undefined } });
mock.module(src("lib/school-ai/access.ts"), { namedExports: { isSchoolAiManager: (user: User) => user.role === "CAMPUS_ADMIN" } });
mock.module(src("lib/school-ai/exam-active-marker.ts"), { namedExports: { markCandidateExamActive: async () => undefined } });
mock.module(src("lib/school-ai/exam-service.ts"), { namedExports: {
  scopedAssignment: async (user: User, id: string) => {
    const assignment = assignments.find(a => a.id === id && a.schoolId === user.schoolId && (user.role === "SUPER_ADMIN" || a.campusId === user.campusId));
    if (!assignment) throw new ApiError("Exam not found.", 404);
    return { assignment, student: user.role === "STUDENT" ? { id: "s-1" } : null };
  },
  staffExamAccess: async () => undefined,
} });

const board = async (user: User, id: string) => (await import("../../src/lib/school-ai/control-room-service")).controlBoard(user as never, id, new Date(1000));
const teacherA: User = { userId: "t-a", role: "TEACHER", schoolId: "school-a", campusId: "campus-a" };
const owner: User = { userId: "o-a", role: "SUPER_ADMIN", schoolId: "school-a", campusId: "campus-a" };

test.beforeEach(() => {
  groupWheres.length = 0;
  tables.student = [
    { id: "s-1", schoolId: "school-a", fullName: "Ali", rollNo: "1" }, { id: "s-2", schoolId: "school-a", fullName: "Sara", rollNo: "2" },
    { id: "s-9", schoolId: "school-b", fullName: "Zara", rollNo: "1" },
  ];
  const attempt = (id: string, studentId: string, schoolId: string, campusId: string, assignmentId: string) => ({ id, studentId, schoolId, campusId, assignmentId, status: "IN_PROGRESS", pausedAt: null, deadlineAt: new Date(9e12), updatedAt: new Date(1000), sequence: 1 });
  tables.schoolAiExamAttempt = [attempt("att-1", "s-1", "school-a", "campus-a", "exam-a"), attempt("att-2", "s-2", "school-a", "campus-a", "exam-a"), attempt("att-9", "s-9", "school-b", "campus-b", "exam-b")];
  const event = (attemptId: string, schoolId: string, campusId: string, assignmentId: string) => ({ attemptId, schoolId, campusId, assignmentId });
  tables.schoolAiExamIntegrityEvent = [
    event("att-1", "school-a", "campus-a", "exam-a"), event("att-1", "school-a", "campus-a", "exam-a"), event("att-2", "school-a", "campus-a", "exam-a"),
    // Another school's and another campus's events with the same ids never count.
    event("att-1", "school-b", "campus-b", "exam-a"), event("att-2", "school-a", "campus-z", "exam-a"), event("att-9", "school-b", "campus-b", "exam-b"),
  ];
});

test("the integrity count filters on school, campus and assignment, so the full index prefix applies", async () => {
  const result = await board(teacherA, "exam-a");
  assert.deepEqual(groupWheres, [{ schoolId: "school-a", campusId: "campus-a", assignmentId: "exam-a" }]);
  assert.deepEqual(result.rows.map(row => [row.studentId, row.observations]), [["s-1", 2], ["s-2", 1]]);
});

test("a school-wide owner still reads the assignment's own campus, and another school sees only its own", async () => {
  await board(owner, "exam-a");
  assert.equal(groupWheres[0].campusId, "campus-a");
  const other = await board({ userId: "t-b", role: "TEACHER", schoolId: "school-b", campusId: "campus-b" }, "exam-b");
  assert.deepEqual(other.rows.map(row => [row.studentId, row.observations]), [["s-9", 1]]);
});

test("another school's teacher, another campus's teacher and a candidate are refused", async () => {
  await assert.rejects(board({ userId: "t-b", role: "TEACHER", schoolId: "school-b", campusId: "campus-b" }, "exam-a"), /not found/);
  await assert.rejects(board({ userId: "t-z", role: "TEACHER", schoolId: "school-a", campusId: "campus-z" }, "exam-a"), /not found/);
  await assert.rejects(board({ userId: "s-1", role: "STUDENT", schoolId: "school-a", campusId: "campus-a" }, "exam-a"), /unavailable/);
  assert.equal(groupWheres.length, 0);
});
