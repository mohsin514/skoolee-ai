import { test } from "node:test";
import assert from "node:assert/strict";
import { computeActionBreakdown } from "../../src/lib/owner/ai-cost-math";

// SKAI-843 (AI-07): owners see credits per action; failed and abandoned calls are counted, not hidden.
test("merges rows from two schools into one row per feature and action", () => {
  const rows = computeActionBreakdown([
    { feature: "ai_workflow_job", action: "paper_draft", credits: 3, calls: 5, chargedCalls: 3, tokens: 900 },
    { feature: "ai_workflow_job", action: "paper_draft", credits: 2, calls: 2, chargedCalls: 2, tokens: 400 },
    { feature: "generate_remarks", action: "single_remark", credits: 1, calls: 1, chargedCalls: 1, tokens: 50 },
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { feature: "ai_workflow_job", action: "paper_draft", credits: 5, calls: 7, chargedCalls: 5, tokens: 1300, uncharged: 2, creditsPerCall: 0.7143, creditsPerChargedCall: 1 });
});

test("an action with only failed calls shows zero credits and unknown per-charge cost", () => {
  const [row] = computeActionBreakdown([{ feature: null, action: "retry", credits: 0, calls: 3, chargedCalls: 0, tokens: 0 }]);
  assert.equal(row.uncharged, 3);
  assert.equal(row.creditsPerCall, 0);
  assert.equal(row.creditsPerChargedCall, null);
});
