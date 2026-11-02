import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1645: returning feedback checks the resubmission policy of the release the work was submitted under.
const source = readFileSync("src/lib/assignments/service.ts", "utf8");
const body = source.slice(source.indexOf("export async function returnFeedback"), source.indexOf("export const reopenInput"));

test("returnFeedback reads the submission's own assignment release", () => {
  assert.match(body, /tx\.assignmentVersion\.findFirstOrThrow\(\{ where: \{ schoolId: user\.schoolId, assignmentId, version: version\.assignmentVersion \} \}\)/);
  assert.doesNotMatch(body, /version: assignment\.currentVersion/);
});
