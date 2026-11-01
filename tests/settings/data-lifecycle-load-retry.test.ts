import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/settings/DataLifecyclePanel.tsx", "utf8");

test("SKAI-1477: an initial data-lifecycle load failure offers Retry that re-runs the overview", () => {
  assert.match(source, /const firstLoad = useCallback\(\(\) => \{ setLoadFailed\(false\); setStatus\(null\); load\(\)\.catch/);
  assert.match(source, /\{!data && loadFailed \? <> <Button [^>]*onClick=\{firstLoad\} data-lifecycle-retry>\{t\.retry\}<\/Button><\/> : null\}/);
});

test("SKAI-1477: the Retry label exists in EN, AR and UR", () => {
  const copy = readFileSync("src/components/settings/data-lifecycle-copy.ts", "utf8");
  assert.equal((copy.match(/^  retry: "/gm) ?? []).length, 3);
});
