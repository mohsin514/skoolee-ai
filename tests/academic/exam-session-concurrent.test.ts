import assert from "node:assert/strict";
import test from "node:test";
import { createExamSession } from "../../src/lib/academic/exam-sessions";
import { ApiError } from "../../src/lib/api/scope";

// SKAI-1670: a concurrent create that committed first wins; the loser re-checks under the lock and writes nothing.
function racedDb(committedByWinner: string[]) {
  const writes: string[] = [];
  let examReads = 0;
  const db = {
    $executeRaw: async () => { writes.push("lock"); return 1; },
    class: { findMany: async () => [
      { id: "c1", name: "Grade 6", section: "A", subjects: [{ totalMarks: 100 }] },
      { id: "c2", name: "Grade 7", section: null, subjects: [{ totalMarks: 50 }] },
    ] },
    exam: {
      // First read (before the lock) sees nothing; the in-lock re-read sees what the winner committed.
      findMany: async () => (examReads++ === 0 ? [] : committedByWinner.map((classId) => ({ classId }))),
      createMany: async (args: { data: { classId: string }[] }) => { writes.push(`exam.createMany:${args.data.map((d) => d.classId).join(",")}`); return { count: args.data.length }; },
    },
    examSession: { create: async () => { writes.push("examSession.create"); return { id: "s2" }; } },
  };
  return { db: db as never, writes };
}

const base = { schoolId: "sch", campusId: "cmp", userId: "u", title: "Mid-term", term: "Term 1", academicYear: 2026, examType: "MID_TERM", classIds: ["c1", "c2"], startDate: null, endDate: null };

test("losing an identical race returns 409 and creates no session or exams", async () => {
  const { db, writes } = racedDb(["c1", "c2"]);
  await assert.rejects(() => createExamSession({ ...base, db }), (e: unknown) => e instanceof ApiError && e.status === 409);
  assert.deepEqual(writes, ["lock"]);
});

test("a partially overlapping race creates only the unclaimed class and reports the other as skipped", async () => {
  const { db, writes } = racedDb(["c1"]);
  const result = await createExamSession({ ...base, db });
  assert.deepEqual(writes, ["lock", "examSession.create", "exam.createMany:c2"]);
  assert.equal(result.created, 1);
  assert.deepEqual(result.skipped, ["Grade 6 A"]);
});
