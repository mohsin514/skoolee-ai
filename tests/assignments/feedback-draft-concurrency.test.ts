import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { feedbackInput } from "@/lib/assignments/service";

const source = readFileSync("src/lib/assignments/service.ts", "utf8");
const helper = source.slice(source.indexOf("async function writeFeedback"), source.indexOf("export async function saveFeedback"));

test("SKAI-1484: feedback saves accept the loaded draft token", () => {
  const parsed = feedbackInput.parse({ submissionVersionId: "v1", scores: [], expectedUpdatedAt: "2026-11-01T10:00:00.000Z" });
  assert.equal(parsed.expectedUpdatedAt, "2026-11-01T10:00:00.000Z");
  assert.throws(() => feedbackInput.parse({ submissionVersionId: "v1", scores: [], expectedUpdatedAt: "yesterday" }));
});

test("SKAI-1484: a stale, missing or returned draft is a 409, and the update is conditional", () => {
  assert.match(helper, /if \(expected !== existing\.updatedAt\.toISOString\(\)\) throw stale\(\);/);
  assert.match(helper, /if \(expected\) throw stale\(\);/);
  assert.match(helper, /existing\.status === "RETURNED"\) throw new ApiError\([^)]*, 409\)/);
  assert.match(helper, /updateMany\(\{ where: \{ id: existing\.id, updatedAt: existing\.updatedAt \}, data \}\);\s*if \(claimed\.count !== 1\) throw stale\(\);/);
});

test("SKAI-1484: both save and return go through the guarded write; the UI sends the token", () => {
  assert.equal((source.match(/writeFeedback\(tx, user, version, input\.expectedUpdatedAt, data, false\)/g) ?? []).length, 2);
  assert.doesNotMatch(source, /assignmentFeedback\.upsert\(/);
  const ui = readFileSync("src/components/assignments/AssignmentWorkspace.tsx", "utf8");
  assert.match(ui, /expectedUpdatedAt: version\?\.feedback\?\.updatedAt \?\? null/);
});
