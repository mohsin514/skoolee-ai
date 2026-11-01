import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRemarkFrozen } from "../../src/lib/ai/remark-policy";

// SKAI-738: background remark generation never overwrites approved or published remarks.
test("only draft remarks are regenerated", () => {
  const draft = { remarksApproved: false, status: "GENERATED", publishedVersionId: null };
  assert.equal(isRemarkFrozen(draft), false);
  assert.equal(isRemarkFrozen({ ...draft, status: "REVIEWED" }), false);
  assert.equal(isRemarkFrozen({ ...draft, remarksApproved: true }), true);
  assert.equal(isRemarkFrozen({ ...draft, status: "PUBLISHED" }), true);
  assert.equal(isRemarkFrozen({ ...draft, status: "SENT" }), true);
  assert.equal(isRemarkFrozen({ ...draft, publishedVersionId: "v1" }), true);
});

test("the worker checks before spending credits and does not retry a frozen card", () => {
  const source = readFileSync("src/workers/remark-worker.ts", "utf8");
  const guard = source.indexOf("isRemarkFrozen(existing)");
  assert.ok(guard > 0 && guard < source.indexOf("await generateRemark("));
  assert.match(source, /throw new UnrecoverableError\(/);
});
