import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2192: a profile photo key must be under the caller's own prefix, and only such keys are deleted on replace.
test("PATCH /api/profile scopes profile-images keys to the caller", () => {
  const route = readFileSync("src/app/api/profile/route.ts", "utf8");
  assert.match(route, /const ownImagePrefix = \(owner: \{ schoolId: string; userId: string \}\) => `profile-images\/\$\{owner\.schoolId\}\/\$\{owner\.userId\}\/`/);
  assert.match(route, /!trimmed\.startsWith\(ownImagePrefix\(owner\)\) \|\| trimmed\.includes\("\.\."\)/);
  assert.match(route, /isOwnS3Key\(prevImage, session\)/);
  assert.doesNotMatch(route, /\^profile-images\\\/\\S\+\$/);
});
