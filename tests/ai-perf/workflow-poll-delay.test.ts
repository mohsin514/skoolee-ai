import { test } from "node:test";
import assert from "node:assert/strict";
import { pollDelay } from "../../src/components/ai-workflows/use-workflow-run";

// SKAI-1884: a moving AI Workflows run is checked every second for its first 10 s, then every 2.5 s.
test("a run is polled fast at first and steps down after 10 seconds", () => {
  assert.equal(pollDelay(0), 1000);
  assert.equal(pollDelay(10_000), 1000);
  assert.equal(pollDelay(10_001), 2500);
  assert.equal(pollDelay(120_000), 2500);
});
