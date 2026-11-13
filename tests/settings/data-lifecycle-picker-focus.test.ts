import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/settings/DataLifecyclePanel.tsx", "utf8");

test("SKAI-1193: picking a data-subject match moves focus to Change instead of dropping it", () => {
  assert.match(source, /onClick=\{\(\) => \{ focusNext\.current = "change"; setChosen\(match\); onChange\(match\.id\); \}\}/);
  assert.match(source, /<Button ref=\{changeRef\} type="button"/);
});

test("SKAI-1193: Change returns focus to the subject search box", () => {
  assert.match(source, /onClick=\{\(\) => \{ focusNext\.current = "search"; onChange\(""\); setChosen\(null\); \}\}/);
  assert.match(source, /<Input ref=\{searchRef\} type="search"/);
  assert.match(source, /if \(target\) \{ focusNext\.current = null; target\.focus\(\); \}/);
});
