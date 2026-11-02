import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1482: a failed preference load shows only the failure alert, not the empty state as well.
const source = readFileSync("src/components/school-ai/announcement-preferences-panel.tsx", "utf8");

test("the empty state is suppressed while the load-failure alert is shown", () => {
  assert.match(source, /!loading && !error && !rows\.length && <p>\{t\.none\}/);
  assert.doesNotMatch(source, /!loading && !rows\.length && <p>\{t\.none\}/);
});
