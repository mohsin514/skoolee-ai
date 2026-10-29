import assert from "node:assert/strict";
import test from "node:test";
import { createExamSession } from "../../src/lib/academic/exam-sessions";
import { ApiError } from "../../src/lib/api/scope";

// SKAI-1040: a session where every class already has the exam must be rejected and create nothing.
function fakeDb(existingClassIds: string[]) {
  const writes: string[] = [];
  const db = {
    class: { findMany: async () => [
      { id: "c1", name: "Grade 6", section: "A", subjects: [{ totalMarks: 100 }] },
      { id: "c2", name: "Grade 7", section: null, subjects: [{ totalMarks: 50 }] },
    ] },
    exam: {
      findMany: async () => existingClassIds.map((classId) => ({ classId })),
      createMany: async (args: { data: unknown[] }) => { writes.push(`exam.createMany:${args.data.length}`); return { count: args.data.length }; },
    },
    examSession: { create: async () => { writes.push("examSession.create"); return { id: "s1" }; } },
  };
  return { db: db as never, writes };
}

const base = { schoolId: "sch", campusId: "cmp", userId: "u", title: "Mid-term", term: "Term 1", academicYear: 2026, examType: "MID_TERM", classIds: ["c1", "c2"], startDate: null, endDate: null };

test("rejects with 409 and writes nothing when every selected class already has the exam", async () => {
  const { db, writes } = fakeDb(["c1", "c2"]);
  await assert.rejects(createExamSession({ ...base, db }), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.equal(e.status, 409);
    assert.equal(e.code, "EXAM_SESSION_ALL_CLASSES_HAVE_EXAM");
    assert.match(e.message, /Grade 6 A, Grade 7/);
    return true;
  });
  assert.deepEqual(writes, []);
});

test("still creates the session for the classes that do not have the exam yet", async () => {
  const { db, writes } = fakeDb(["c1"]);
  const result = await createExamSession({ ...base, db });
  assert.equal(result.created, 1);
  assert.deepEqual(result.skipped, ["Grade 6 A"]);
  assert.deepEqual(writes, ["examSession.create", "exam.createMany:1"]);
});
