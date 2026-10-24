import assert from "node:assert/strict";
import { test } from "node:test";
import { convertGradebookMark, countGradebookOutcomes, gradebookPublicationInputSchema } from "../../src/lib/school-ai/exam-gradebook";

test("gradebook conversion never truncates fractions or silently rescales exact marks", () => {
  assert.equal(convertGradebookMark(4, 5, 5, "EXACT"), 4);
  assert.equal(convertGradebookMark(4.5, 5, 5, "EXACT"), null);
  assert.equal(convertGradebookMark(4, 5, 100, "EXACT"), null);
  assert.equal(convertGradebookMark(4.5, 5, 100, "PROPORTIONAL_WHOLE"), 90);
  assert.equal(convertGradebookMark(1, 8, 100, "PROPORTIONAL_WHOLE"), 13);
  for (const [raw, maximum, target] of [[-1, 5, 100], [6, 5, 100], [1, 0, 100], [NaN, 5, 100], [1, 5, 1.5], [1, Infinity, 100]]) assert.equal(convertGradebookMark(raw, maximum, target, "PROPORTIONAL_WHOLE"), null);
});
test("non-starters, unmoderated responses and unavailable students stay distinct", () => {
  const outcomes = (["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "REVIEWED", "UNAVAILABLE"] as const).map((state, i) => ({ state, studentId: String(i), fullName: null, rollNo: null }));
  assert.deepEqual(countGradebookOutcomes(outcomes), { assigned: 5, notStarted: 1, inProgress: 1, submitted: 1, reviewed: 1, unavailable: 1 });
});
test("gradebook publication only accepts an exact preview request, never posted scores", () => {
  const input = { examId: "exam", conversion: "EXACT", version: 1, previewHash: "a".repeat(64), idempotencyKey: "0a1bff22-daf7-4e54-b7e4-e63dbb128f68" };
  assert(gradebookPublicationInputSchema.safeParse(input).success);
  for (const patch of [{ marks: [100] }, { version: 0 }, { conversion: "ROUND_DOWN" }, { previewHash: "unreviewed" }]) assert(!gradebookPublicationInputSchema.safeParse({ ...input, ...patch }).success);
});
