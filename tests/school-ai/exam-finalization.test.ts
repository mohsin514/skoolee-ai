import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { finalizeExpiredAttempt } from "../../src/lib/school-ai/exam-finalization";
import { assessmentFixture } from "./assessment-fixture";

const now = new Date("2026-10-25T10:00:00Z");
const { paper } = assessmentFixture();

/** Emulate an atomic conditional row update, including a competing write after the caller's read. */
function fixture() {
  const row: Record<string, unknown> = { id: "attempt-1", schoolId: "school-1", status: "IN_PROGRESS", sequence: 3, deadlineAt: new Date(now.getTime() - 1000), pausedAt: null, responses: { q1: "a1", q3: "Combine quantities." }, scoreProposal: null };
  const snapshot = { id: "attempt-1", schoolId: "school-1", sequence: 3, responses: { q1: "a1", q3: "Combine quantities." } };
  const scalar = (value: unknown) => value instanceof Date ? value.getTime() : value;
  const db = { schoolAiExamAttempt: { updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const matched = Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === "object" && !(condition instanceof Date)) return Object.entries(condition).every(([operator, value]) => {
        assert.equal(operator, "lte", "the row simulator must implement every comparison it receives");
        return Number(scalar(row[key])) <= Number(scalar(value));
      });
      return isDeepStrictEqual(row[key], condition);
    });
    if (matched) Object.assign(row, data);
    return { count: Number(matched) };
  } } } as unknown as Parameters<typeof finalizeExpiredAttempt>[0];
  return { db, row, snapshot };
}

test("automatic finalization scores persisted answers exactly once when still expired", async () => {
  const { db, row, snapshot } = fixture();
  assert.equal((await finalizeExpiredAttempt(db, snapshot, paper, now)).count, 1);
  assert.equal(row.status, "SUBMITTED");
  assert.deepEqual(row.submittedAt, now);
  assert.deepEqual(row.responses, snapshot.responses);
  assert.equal((row.scoreProposal as { totalObjectiveMarks: number }).totalObjectiveMarks, 2);
  assert.equal((await finalizeExpiredAttempt(db, snapshot, paper, now)).count, 0);
});

for (const [name, concurrentChange] of [
  ["extension", { deadlineAt: new Date(now.getTime() + 600_000) }],
  ["supervised pause", { pausedAt: new Date(now.getTime() - 5000) }],
  ["new saved answers", { sequence: 4, responses: { q1: "a2", q3: "New saved response." } }],
  ["another final submission", { status: "SUBMITTED" }],
] as const) test(`a concurrent ${name} survives an expired snapshot`, async () => {
  const { db, row, snapshot } = fixture();
  Object.assign(row, concurrentChange); // Happens after the learner or marking desk reads snapshot.
  const expected = structuredClone(row);
  assert.equal((await finalizeExpiredAttempt(db, snapshot, paper, now)).count, 0);
  assert.deepEqual(row, expected);
});
