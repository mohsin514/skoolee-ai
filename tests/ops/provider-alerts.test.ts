import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyProviderFailure } from "../../src/lib/ai/openai";

// SKAI-866: quota, rejected credentials and rate limiting are told apart for operator alerts.
test("provider failures are classified for alerting", () => {
  assert.equal(classifyProviderFailure({ status: 429, code: "insufficient_quota" }), "QUOTA_EXHAUSTED");
  assert.equal(classifyProviderFailure({ status: 429, error: { type: "insufficient_quota" } }), "QUOTA_EXHAUSTED");
  assert.equal(classifyProviderFailure({ status: 401, code: "invalid_api_key" }), "CREDENTIAL_REJECTED");
  assert.equal(classifyProviderFailure({ status: 403 }), "CREDENTIAL_REJECTED");
  assert.equal(classifyProviderFailure({ status: 429, code: "rate_limit_exceeded" }), "RATE_LIMITED");
  assert.equal(classifyProviderFailure({ status: 500 }), "OTHER");
  assert.equal(classifyProviderFailure(new Error("network")), "OTHER");
  assert.equal(classifyProviderFailure(null), "OTHER");
});

test("the alert line carries no message, prompt or key", () => {
  const source = readFileSync("src/lib/ai/openai.ts", "utf8");
  assert.match(source, /console\.error\(JSON\.stringify\(\{ component: "ai-provider", reason, provider \}\)\)/);
});
