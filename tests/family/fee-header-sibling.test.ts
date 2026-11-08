import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/parent/fees/page.tsx", "utf8");

test("SKAI-1464: the fee header shows a balance only for the child it was loaded for", () => {
  assert.match(source, /onSummary=\{next => setSummary\(next && \{ \.\.\.next, forStudent: studentId \?\? "default" \}\)\}/);
  assert.match(source, /summary\.forStudent === \(studentId \?\? "default"\) \? summary : null/);
  assert.doesNotMatch(source, /summary\.outstanding/);
});
