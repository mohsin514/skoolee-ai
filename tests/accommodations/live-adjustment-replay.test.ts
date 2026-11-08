import assert from "node:assert/strict";
import { mock, test } from "node:test";

// SKAI-1459: a retried live adjustment (same request key) must not move the deadline twice.
type Attempt = { id: string; schoolId: string; assignmentId: string; studentId: string; status: string; deadlineAt: Date };
type Row = { id: string; schoolId: string; assignmentId: string; attemptId: string; studentId: string; requestKey: string | null; addedMinutes: number; reason: string };
let attempts: Attempt[] = [];
let rows: Row[] = [];
let audits = 0;
let seq = 0;
const assignments = [{ id: "exam-a", schoolId: "school-a", campusId: "campus-a" }, { id: "exam-b", schoolId: "school-b", campusId: "campus-c" }];

// Each transaction runs alone (as the per-attempt row lock serialises them in Postgres).
let chain = Promise.resolve();
const tx = {
  schoolAiExamAssignment: { findFirst: async ({ where }: { where: { id: string; schoolId: string; campusId?: string } }) => assignments.find(a => a.id === where.id && a.schoolId === where.schoolId && (where.campusId === undefined || a.campusId === where.campusId)) ?? null },
  schoolAiExamAttempt: {
    findFirst: async ({ where }: { where: { schoolId: string; assignmentId: string; studentId: string } }) => {
      const a = attempts.find(x => x.schoolId === where.schoolId && x.assignmentId === where.assignmentId && x.studentId === where.studentId && x.status === "IN_PROGRESS");
      return a ? { ...a } : null;
    },
    updateMany: async ({ where, data }: { where: { id: string; deadlineAt: Date }; data: { deadlineAt: Date } }) => {
      const a = attempts.find(x => x.id === where.id && x.deadlineAt.getTime() === where.deadlineAt.getTime());
      if (a) a.deadlineAt = data.deadlineAt;
      return { count: a ? 1 : 0 };
    },
  },
  accommodationLiveAdjustment: {
    findFirst: async ({ where }: { where: Partial<Row> }) => rows.find(r => Object.entries(where).every(([k, v]) => r[k as keyof Row] === v)) ?? null,
    create: async ({ data }: { data: Omit<Row, "id"> }) => { const row = { id: `live-${++seq}`, ...data }; rows.push(row); return row; },
  },
  auditLog: { create: async () => { audits++; return {}; } },
};
mock.module("@/lib/school-ai/transaction", { namedExports: { schoolAiTransaction: async (_u: unknown, fn: (t: typeof tx) => Promise<unknown>) => { const run = chain.then(() => fn(tx)); chain = run.then(() => undefined, () => undefined); return run; } } });
mock.module("@/lib/api/scope", { namedExports: { ApiError: class ApiError extends Error { constructor(m: string, public status = 400) { super(m); } }, canManageOperations: (u: { role: string }) => u.role !== "TEACHER" } });
mock.module("@/lib/auth/policy", { namedExports: { studentScope: () => ({}) } });
mock.module("@/lib/chat/policy", { namedExports: { teacherClassIds: async () => [] } });

const staff = (schoolId = "school-a", campusId = "campus-a", role = "CAMPUS_ADMIN") => ({ userId: "u-1", role, schoolId, campusId }) as never;
const extend = async (user: never, exam: string, requestKey: string) => (await import("@/lib/accommodations/service")).liveAdjustment(user, exam, { studentId: "stu-1", addedMinutes: 10, reason: "Fire alarm", requestKey });
const start = new Date(Date.now() + 30 * 60_000);
const KEY1 = "11111111-1111-4111-8111-111111111111", KEY2 = "22222222-2222-4222-8222-222222222222";

function seed() {
  rows = []; audits = 0; seq = 0; chain = Promise.resolve();
  attempts = [
    { id: "att-a", schoolId: "school-a", assignmentId: "exam-a", studentId: "stu-1", status: "IN_PROGRESS", deadlineAt: new Date(start) },
    { id: "att-b", schoolId: "school-b", assignmentId: "exam-b", studentId: "stu-1", status: "IN_PROGRESS", deadlineAt: new Date(start) },
  ];
}
const minutesAdded = (id: string) => (attempts.find(a => a.id === id)!.deadlineAt.getTime() - start.getTime()) / 60_000;

test("replay after a lost response returns the original receipt and moves the deadline once", async () => {
  seed();
  const first = await extend(staff(), "exam-a", KEY1);
  const again = await extend(staff(), "exam-a", KEY1);
  assert.equal(again.id, first.id);
  assert.equal(minutesAdded("att-a"), 10);
  assert.equal(rows.length, 1);
  assert.equal(audits, 1);
});

test("concurrent identical submissions produce one adjustment", async () => {
  seed();
  const [a, b] = await Promise.all([extend(staff(), "exam-a", KEY1), extend(staff(), "exam-a", KEY1)]);
  assert.equal(a.id, b.id);
  assert.equal(minutesAdded("att-a"), 10);
});

test("a new key is a separate intentional adjustment", async () => {
  seed();
  await extend(staff(), "exam-a", KEY1);
  await extend(staff(), "exam-a", KEY2);
  assert.equal(minutesAdded("att-a"), 20);
});

test("the request key is required", async () => {
  seed();
  const { liveAdjustment } = await import("@/lib/accommodations/service");
  await assert.rejects(liveAdjustment(staff(), "exam-a", { studentId: "stu-1", addedMinutes: 10, reason: "Fire alarm" }));
});

test("keys are scoped per school; other school and campus and denied roles are isolated", async () => {
  seed();
  await extend(staff(), "exam-a", KEY1);
  await extend(staff("school-b", "campus-c"), "exam-b", KEY1);
  assert.equal(minutesAdded("att-b"), 10, "same key in another school is its own adjustment");
  await assert.rejects(extend(staff("school-a", "campus-b"), "exam-a", KEY2), { status: 404 });
  await assert.rejects(extend(staff("school-a", "campus-a", "TEACHER"), "exam-a", KEY2), { status: 403 });
  assert.equal(minutesAdded("att-a"), 10);
});
