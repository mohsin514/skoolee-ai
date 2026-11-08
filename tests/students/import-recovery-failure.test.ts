import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync("src/components/students/bulk-import-dialog.tsx", "utf8");

test("a failed or malformed recovery lookup is recorded as failed, not as no unfinished rehearsal", () => {
  assert.match(dialog, /if \(!response\.ok\) throw new Error\("recovery lookup failed"\)/);
  assert.match(dialog, /if \(!Array\.isArray\(result\?\.data\)\) throw new Error\("recovery lookup failed"\)/);
  assert.match(dialog, /\.catch\(\(\) => \{ if \(!cancelled\) setRecoveryFailed\(true\); \}\)/);
  assert.doesNotMatch(dialog, /\.catch\(\(\) => undefined\)/);
});

test("Try again only re-runs discovery (never stages or commits) and a success clears the error", () => {
  assert.match(dialog, /onClick=\{\(\) => setRecoveryAttempt\(\(n\) => n \+ 1\)\}>\{t\("Try again"\)\}/);
  assert.match(dialog, /\}, \[open, batch, recoveryAttempt\]\);/);
  assert.match(dialog, /setRecoveryFailed\(false\); setUnfinished\(staged \|\| null\);/);
});
