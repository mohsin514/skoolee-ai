import { test, after } from "node:test";
import assert from "node:assert/strict";
import { redis } from "../../src/lib/queue/connection";
import { prisma } from "../../src/lib/db/prisma";
import { STEP_STATUSES } from "../../src/lib/ai-workflows/executor/scheduler";
import { uiState } from "../../src/lib/ai-workflows/view";
import { practiceModeApplies } from "../../src/lib/ai-workflows/practice";
import { aiWorkflowsV2Enabled } from "../../src/lib/ai-workflows/flag";
import { STATE_WORDS, ERROR_WORDS } from "../../src/components/ai-workflows/run-copy";
import { WORKFLOW_ERROR_CODES } from "../../src/lib/ai-workflows/errors";

after(async () => { await prisma.$disconnect(); redis.disconnect(); });
const write = { kind: "write" as const, capability: "x", entities: [], counts: {}, link: null, replayed: false };

test("every engine step status renders, in all three languages", () => {
  for (const status of STEP_STATUSES) {
    const state = uiState(status, status === "SUCCEEDED" ? write : null, null);
    for (const language of ["en", "ar", "ur"] as const) assert.ok(STATE_WORDS[state][language], `${status} → ${state} has no ${language} word`);
  }
});

test("'saved' needs a receipt; an unverified or failed write is never shown as saved or as 'nothing changed'", () => {
  assert.equal(uiState("SUCCEEDED", write, null), "saved");
  assert.equal(uiState("SUCCEEDED", null, null), "uncertain");
  assert.equal(uiState("SUCCEEDED", { ...write, kind: "read" }, null), "looked_up");
  assert.equal(uiState("SUCCEEDED", { ...write, kind: "draft" }, null), "draft");
  assert.equal(uiState("FAILED_UNVERIFIED", null, null), "uncertain");
  assert.equal(uiState("UNCERTAIN", null, null), "uncertain");
  assert.equal(uiState("FAILED", null, "PRACTICE_MODE"), "practice");
});

test("every error code the engine can return has localised copy", () => {
  for (const code of Object.keys(WORKFLOW_ERROR_CODES)) {
    if (["NOT_FOUND", "KEY_CONFLICT", "SUPERSEDED"].includes(code)) continue;
    assert.ok(ERROR_WORDS[code as keyof typeof ERROR_WORDS]?.ur, `${code} has no Urdu copy`);
  }
});

test("practice mode: production with the release gate closed refuses real schools; demo tenants and dev stay live", () => {
  assert.equal(practiceModeApplies("real-school", { NODE_ENV: "production" }, null), true);
  assert.equal(practiceModeApplies("demo-school", { NODE_ENV: "production", AI_WORKFLOWS_LIVE_SCHOOLS: "demo-school, other" }, null), false);
  assert.equal(practiceModeApplies("real-school", { NODE_ENV: "development" }, null), false);
  assert.equal(practiceModeApplies("real-school", { NODE_ENV: "production" }, { recorded: true }), false, "an approved evaluation lifts it");
});

test("the rollout flag defaults on outside production and is per school in production", () => {
  assert.equal(aiWorkflowsV2Enabled("a", { NODE_ENV: "development" }), true);
  assert.equal(aiWorkflowsV2Enabled("a", { NODE_ENV: "production" }), false);
  assert.equal(aiWorkflowsV2Enabled("a", { NODE_ENV: "production", AI_WORKFLOWS_V2: "a,b" }), true);
  assert.equal(aiWorkflowsV2Enabled("c", { NODE_ENV: "production", AI_WORKFLOWS_V2: "a,b" }), false);
  assert.equal(aiWorkflowsV2Enabled("a", { NODE_ENV: "development", AI_WORKFLOWS_V2: "off" }), false);
});
