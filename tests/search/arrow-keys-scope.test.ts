import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("src/components/search/search-workspace.tsx", "utf8");
const handler = workspace.slice(workspace.indexOf("const onKeyDown"), workspace.indexOf("event.preventDefault();", workspace.indexOf("const onKeyDown")));

test("arrow-key result navigation only runs when focus is inside the result list", () => {
  assert.match(handler, /if \(!\(event\.target instanceof Node\) \|\| !listRef\.current\?\.contains\(event\.target\)\) return;/);
});

test("the list-scope guard runs before preventDefault, so inputs and selects keep native arrows", () => {
  const guard = workspace.indexOf("!listRef.current?.contains(event.target)");
  const prevent = workspace.indexOf("event.preventDefault();", workspace.indexOf("const onKeyDown"));
  assert.ok(guard > 0 && guard < prevent);
});
