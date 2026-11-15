import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2042: a group admin (SUPER_ADMIN, no home campus) reaches the service desk for the campus chosen in the
// header switcher. activeCampusId is validated against the user's school in getAuthUser, so no tenant widening.
test("service desk campus falls back to the validated active campus", () => {
  const src = readFileSync("src/lib/service-desk/service.ts", "utf8");
  assert.match(src, /String\(requested \?\? ""\) \|\| user\.campusId \|\| user\.activeCampusId \|\| ""/);
  assert.match(src, /user\.role !== "SUPER_ADMIN" && user\.campusId && campusId !== user\.campusId/);
});
