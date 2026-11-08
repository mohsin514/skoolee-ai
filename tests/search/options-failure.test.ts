import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/components/search/search-workspace.tsx", "utf8");

test("a failed filter-options load is recorded and disclosed, never swallowed", () => {
  assert.doesNotMatch(workspace, /options=1"[^\n]*\.catch\(\(\) => undefined\)/);
  assert.match(workspace, /\.catch\(\(\) => \{ if \(!cancelled\) setOptionsFailed\(true\); \}\)/);
  assert.match(workspace, /else setOptionsFailed\(true\);/);
  assert.match(workspace, /Campus, class and year filters could not be loaded/);
});

test("Try again reloads only the options and a success clears the warning", () => {
  assert.match(workspace, /onClick=\{\(\) => setOptionsAttempt\(n => n \+ 1\)\}/);
  assert.match(workspace, /\}, \[optionsAttempt\]\);/);
  assert.match(workspace, /setOptions\(json\.data\); setOptionsFailed\(false\);/);
});
