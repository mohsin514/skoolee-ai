import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1656: a failed service-queue load keeps the agent's queue tab and offers Retry.
const source = readFileSync("src/components/service-desk/service-desk.tsx", "utf8");

test("queue failure no longer downgrades the user to non-agent", () => {
  assert.doesNotMatch(source, /setQ\(\{ agent: false, requests: \[\] \}\)/);
  assert.match(source, /catch \{ setQueueFailed\(true\); \}/);
});

test("queue tab stays visible and shows a retryable error", () => {
  assert.match(source, /hidden: !q\?\.agent && !queueFailed/);
  assert.match(source, /<ErrorState description=\{ui\("The service queue could not be loaded\."\)\} onRetry=\{\(\) => loadQueue\(\)\}/);
});
