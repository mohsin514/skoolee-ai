import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/components/assignments/LearnerAssignments.tsx", "utf8");

test("SKAI-1442: the submit key falls back to memory when storage returns nothing", () => {
  assert.match(source, /const submitKeyRef = useRef<string \| null>\(null\);/);
  assert.match(source, /store\.get\(submitKey\) \?\? submitKeyRef\.current \?\? `s-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(source, /submitKeyRef\.current = idempotencyKey;/);
});

test("SKAI-1442: a confirmed submit clears the in-memory key with the stored one", () => {
  assert.match(source, /store\.remove\(submitKey\); submitKeyRef\.current = null;/);
});
