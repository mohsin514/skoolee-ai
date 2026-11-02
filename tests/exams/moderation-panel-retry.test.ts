import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1556: a failed moderation detail load offers a Retry for the same slot.
const src = readFileSync("src/components/school-ai/exam-studio/moderation-panel.tsx", "utf8");

test("non-OK, network and malformed responses are failures", () => {
  assert.match(src, /if \(!response\?\.ok \|\| typeof payload\?\.data\?\.paperVersion !== "number"\) \{ setError\(/);
  assert.match(src, /setError\(null\); setView\(payload\.data\);/);
});

test("the initial failure shows Retry that reloads the same slot", () => {
  assert.match(src, /if \(error && !view\) return <Alert tone="danger" compact>[\s\S]*onClick=\{\(\) => void load\(\)\}>\{t\.retry\}<\/Button><\/Alert>;/);
});
