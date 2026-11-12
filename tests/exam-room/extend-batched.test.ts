import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";

// SKAI-1819: extending or closing a live room reads the attempts (and, for extend, the keys already applied) in one
// query each instead of once per candidate, with the same school, campus and assignment scope and the same outcomes.
// The transaction, assignment scope and staff access are stubbed so the real service functions run.
class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
type Viewer = { userId: string; schoolId: string; campusId: string; role: string };
const teacherA: Viewer = { userId: "t-a", schoolId: "school-a", campusId: "campus-a1", role: "TEACHER" };
const teacherB: Viewer = { userId: "t-b", schoolId: "school-b", campusId: "campus-b1", role: "TEACHER" };
const pupilA: Viewer = { userId: "s-a", schoolId: "school-a", campusId: "campus-a1", role: "STUDENT" };

mock.module("@/lib/api/scope", { namedExports: { ApiError } });
mock.module("@/lib/school-ai/access", { namedExports: { isSchoolAiManager: (user: Viewer) => user.role !== "TEACHER" } });
// The SKAI-1840 Redis exam marker is out of scope here; stub it so the test never opens a Redis connection.
mock.module("@/lib/school-ai/exam-active-marker", { namedExports: { markCandidateExamActive: async () => undefined } });
mock.module("@/lib/school-ai/exam-service", {
  namedExports: {
    // The assignment lives on the caller's own campus; a pupil gets their own row back and must be refused.
    scopedAssignment: async (user: Viewer) => ({ assignment: { id: "room-1", campusId: user.campusId, createdById: user.userId }, student: user.role === "STUDENT" ? { id: user.userId } : null }),
    staffExamAccess: async () => undefined,
  },
});

type Attempt = { id: string; schoolId: string; campusId: string; assignmentId: string; status: string; pausedAt: Date | null; deadlineAt: Date };
type Audit = { schoolId: string; tableName: string; recordId: string; newValue?: Record<string, unknown> };
let attempts: Attempt[] = [];
let audits: Audit[] = [];
const reads: { model: string; where: Record<string, unknown> }[] = [];
const matches = (row: Attempt, where: Record<string, unknown>) => {
  const ids = (where.id as { in: string[] }).in;
  return ids.includes(row.id) && row.schoolId === where.schoolId && row.campusId === where.campusId && row.assignmentId === where.assignmentId && (where.status === undefined || row.status === where.status);
};
const tx = {
  schoolAiExamAttempt: {
    findFirst: async () => { throw new Error("per-attempt lookup"); },
    findMany: async ({ where }: { where: Record<string, unknown> }) => { reads.push({ model: "attempt", where }); return attempts.filter(row => matches(row, where)); },
    updateMany: async ({ where, data }: { where: { id: string; schoolId: string; deadlineAt: Date }; data: { deadlineAt: Date } }) => {
      const row = attempts.find(a => a.id === where.id && a.schoolId === where.schoolId && a.status === "IN_PROGRESS" && a.deadlineAt.getTime() === where.deadlineAt.getTime());
      if (row) row.deadlineAt = data.deadlineAt;
      return { count: row ? 1 : 0 };
    },
    update: async ({ where, data }: { where: { id: string }; data: { deadlineAt: Date } }) => { const row = attempts.find(a => a.id === where.id)!; row.deadlineAt = data.deadlineAt; return row; },
  },
  schoolAiExamPause: { updateMany: async () => ({ count: 0 }) },
  auditLog: {
    count: async () => { throw new Error("per-attempt audit count"); },
    findMany: async ({ where }: { where: { schoolId: string; tableName: string; recordId: { in: string[] }; newValue: { equals: string } } }) => {
      reads.push({ model: "audit", where });
      return audits.filter(row => row.schoolId === where.schoolId && row.tableName === where.tableName && where.recordId.in.includes(row.recordId) && row.newValue?.extensionKey === where.newValue.equals).map(row => ({ recordId: row.recordId }));
    },
    create: async ({ data }: { data: Audit }) => { audits.push(data); return data; },
  },
};
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_user: Viewer, work: (client: typeof tx) => unknown) => work(tx) } });

type Service = typeof import("../../src/lib/school-ai/control-room-service");
let service: Service;
before(async () => { service = await import("../../src/lib/school-ai/control-room-service"); });

const later = () => new Date(Date.now() + 30 * 60_000);
const attempt = (id: string, over: Partial<Attempt> = {}): Attempt => ({ id, schoolId: "school-a", campusId: "campus-a1", assignmentId: "room-1", status: "IN_PROGRESS", pausedAt: null, deadlineAt: later(), ...over });
beforeEach(() => {
  reads.length = 0;
  audits = [];
  attempts = [
    ...Array.from({ length: 500 }, (_, i) => attempt(`a${i}`)),
    attempt("done", { status: "SUBMITTED" }),
    attempt("other-campus", { campusId: "campus-a2" }),
    attempt("other-school", { schoolId: "school-b", campusId: "campus-b1" }),
  ];
});
const extend = (user: Viewer, attemptIds: string[], key = "extend-key-1") => service.extendAttempts(user as never, "room-1", { attemptIds, minutes: 10, reason: "Fire drill", idempotencyKey: key });

test("extending a 500-candidate room reads attempts and applied keys once each", async () => {
  const ids = attempts.slice(0, 500).map(row => row.id);
  const { outcomes } = await extend(teacherA, ids);
  assert.equal(outcomes.filter(row => row.outcome === "EXTENDED").length, 500);
  assert.deepEqual(reads.map(row => row.model), ["attempt", "audit"]);
  assert.deepEqual(reads[1].where.schoolId, "school-a");
  assert.equal(audits.length, 500);
});

test("a repeated key is reported as already applied and moves no deadline twice", async () => {
  await extend(teacherA, ["a1", "a2"]);
  const deadline = attempts.find(row => row.id === "a1")!.deadlineAt.toISOString();
  const { outcomes } = await extend(teacherA, ["a1", "a2", "a3"]);
  assert.deepEqual(outcomes.map(row => row.outcome), ["ALREADY_APPLIED", "ALREADY_APPLIED", "EXTENDED"]);
  assert.equal(outcomes[0].deadlineAt, deadline);
  assert.equal(audits.length, 3);
});

test("attempts outside the caller's school, campus or in-progress state are not extended, in request order", async () => {
  const { outcomes } = await extend(teacherA, ["other-school", "a0", "other-campus", "done", "missing", "a0"]);
  assert.deepEqual(outcomes, [
    { attemptId: "other-school", outcome: "NOT_IN_PROGRESS" },
    { attemptId: "a0", outcome: "EXTENDED", deadlineAt: outcomes[1].deadlineAt },
    { attemptId: "other-campus", outcome: "NOT_IN_PROGRESS" },
    { attemptId: "done", outcome: "NOT_IN_PROGRESS" },
    { attemptId: "missing", outcome: "NOT_IN_PROGRESS" },
  ]);
  // School B's teacher sees only their own school's attempt, and an audit row from school A never counts for B.
  audits.push({ schoolId: "school-a", tableName: "school_ai_exam_attempts", recordId: "other-school", newValue: { extensionKey: "shared-key-01" } });
  const second = await extend(teacherB, ["other-school", "a1"], "shared-key-01");
  assert.deepEqual(second.outcomes.map(row => row.outcome), ["EXTENDED", "NOT_IN_PROGRESS"]);
});

test("a pupil cannot extend or close, and a teacher cannot exceed the teacher limit", async () => {
  await assert.rejects(extend(pupilA, ["a0"]), (error: ApiError) => error.status === 403);
  await assert.rejects(service.closeAttempts(pupilA as never, "room-1", { attemptIds: ["a0"], reason: "Ended early" }), (error: ApiError) => error.status === 403);
  await assert.rejects(service.extendAttempts(teacherA as never, "room-1", { attemptIds: ["a0"], minutes: 30, reason: "Too long", idempotencyKey: "extend-key-1" }), (error: ApiError) => error.status === 403);
  assert.equal(reads.length, 0);
});

test("closing reads the open attempts in one query and closes only those in scope", async () => {
  const { outcomes } = await service.closeAttempts(teacherA as never, "room-1", { attemptIds: ["a0", "done", "other-school", "a1"], reason: "Ended early" });
  assert.deepEqual(outcomes.map(row => row.outcome), ["CLOSED", "NOT_IN_PROGRESS", "NOT_IN_PROGRESS", "CLOSED"]);
  assert.deepEqual(reads.map(row => row.model), ["attempt"]);
  assert.equal(reads[0].where.status, "IN_PROGRESS");
});
