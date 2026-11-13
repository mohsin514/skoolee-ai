import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PROMOTION_DEPTH, wouldCreatePromotionCycle } from "../../src/lib/staff/designation-promotion";

// A ladder: teacher -> senior teacher -> head of department -> principal (top, promotesTo null).
const ladder = new Map<string, string | null>([
  ["teacher", "senior"],
  ["senior", "hod"],
  ["hod", "principal"],
  ["principal", null],
  ["clerk", null],
]);

test("PATCH guard: promoting a rank further up the ladder is allowed", () => {
  assert.equal(wouldCreatePromotionCycle("teacher", "hod", ladder), false);
  assert.equal(wouldCreatePromotionCycle("clerk", "principal", ladder), false);
});

test("PATCH guard: clearing the promotion target is never a cycle", () => {
  assert.equal(wouldCreatePromotionCycle("principal", null, ladder), false);
  assert.equal(wouldCreatePromotionCycle("principal", undefined, ladder), false);
});

test("PATCH guard: a rank that promotes back down into itself is refused", () => {
  // principal -> teacher would close teacher -> senior -> hod -> principal -> teacher.
  assert.equal(wouldCreatePromotionCycle("principal", "teacher", ladder), true);
  // hod -> senior closes senior -> hod -> senior.
  assert.equal(wouldCreatePromotionCycle("hod", "senior", ladder), true);
});

test("PATCH guard: a rank cannot promote into itself", () => {
  assert.equal(wouldCreatePromotionCycle("senior", "senior", ladder), true);
});

test("PATCH guard: a corrupt existing chain longer than the limit is refused, not trusted", () => {
  const long = new Map<string, string | null>();
  for (let i = 0; i < MAX_PROMOTION_DEPTH + 5; i += 1) long.set(`r${i}`, `r${i + 1}`);
  assert.equal(wouldCreatePromotionCycle("new-rank", "r0", long), true);
});
