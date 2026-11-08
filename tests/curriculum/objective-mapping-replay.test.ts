import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("SKAI-216 a repeated objective decision replays the current one under a pair lock", () => {
  const src = readFileSync("src/lib/curriculum/service.ts", "utf8");
  const body = src.slice(src.indexOf("export async function recordMapping"), src.indexOf("export async function assertObjectivesExist"));
  assert.match(body, /pg_advisory_xact_lock\(hashtext\(\$\{`curriculum-mapping:/);
  assert.match(body, /latest\.relation === input\.relation && latest\.note === input\.note\) return latest;/);
  assert.ok(body.indexOf("return latest") < body.indexOf("curriculumObjectiveMapping.create"), "replay happens before a new row is written");
});
