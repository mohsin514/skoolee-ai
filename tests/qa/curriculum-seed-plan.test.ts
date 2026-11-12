import assert from "node:assert/strict";
import { test } from "node:test";
import { curriculumDataSchema } from "../../src/lib/school-ai/assessment";
import { boardsFor, curriculumFor } from "../../scripts/qa/curriculum-seed-plan";

test("qa-alpha gets two boards with an identically titled objective; other schools get one", () => {
  assert.equal(boardsFor("qa-alpha").length, 2);
  assert.equal(boardsFor("qa-beta").length, 1);
  const [a, b] = boardsFor("qa-alpha").map(board => curriculumFor(board, "s", "c", 2026));
  assert.equal(a.outcomes[0].title, b.outcomes[0].title);
  assert.notEqual(a.outcomes[0].id, b.outcomes[0].id, "objective ids stay distinct across boards");
  assert.notEqual(a.pack?.packId, b.pack?.packId);
});

test("every seeded curriculum is a valid approved, versioned pack", () => {
  for (const board of boardsFor("qa-alpha")) {
    const parsed = curriculumDataSchema.safeParse(curriculumFor(board, "subject", "class", 2026));
    assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  }
});
