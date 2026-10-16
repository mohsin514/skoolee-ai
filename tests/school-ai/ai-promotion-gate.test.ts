import assert from "node:assert/strict";
import { test } from "node:test";
import { scanForPII, assertNoPII } from "../../src/lib/ai/pseudonymize";
import { AI_EVALUATION_CASES, AI_EVALUATION_DATASET_VERSION, assessAIPromotion, type AIReleaseEvaluation } from "../../src/lib/ai/evaluation";

const candidate = { model: "gpt-4o-mini", promptVersion: "phase4-ai-v1", policyVersion: "gateway-policy-v1" };
const reviewed = (overrides: Partial<AIReleaseEvaluation> = {}): AIReleaseEvaluation => ({
  ...candidate, datasetVersion: AI_EVALUATION_DATASET_VERSION, reviewedBy: ["Synthetic educator"], reviewedAt: "2026-10-17T09:00:00Z",
  results: AI_EVALUATION_CASES.map(item => ({ caseId: item.id, passed: true, educatorReviewed: true })), ...overrides,
});

test("egress scanner catches Arabic-Indic and Urdu digits, Gulf grouped mobiles, Emirates ID and IBAN", () => {
  for (const text of [
    "رقم ولي الأمر ٠٥٠١٢٣٤٥٦٧",
    "والد کا فون ۰۳۰۰۱۲۳۴۵۶۷ ہے",
    "Guardian mobile 050 123 4567",
    "Mother: 055-987-6543",
    "Emirates ID 784-1990-1234567-1",
    "Refund to SA03 8000 0000 6080 1016 7519",
    "IBAN AE070331234567890123456",
  ]) assert.ok(scanForPII(text).length > 0, text);
  assert.throws(() => assertNoPII("ولي الأمر ٠٥٠١٢٣٤٥٦٧"), /personal identifier/);
});

test("egress scanner leaves ordinary marks, dates and question text alone", () => {
  for (const text of ["Scored 45/50 on 2026-10-17", "Question 3: ٣ + ٤ = ؟", "Class 7B, room 204, period 3", "Term 1 average 78.5%"]) {
    assert.deepEqual(scanForPII(text), [], text);
  }
});

test("promotion is blocked without a recorded evaluation", () => {
  const result = assessAIPromotion(candidate, null);
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some(item => item.includes("No recorded evaluation")));
});

test("a complete educator-reviewed evaluation of the exact candidate approves promotion", () => {
  assert.deepEqual(assessAIPromotion(candidate, reviewed()), { approved: true, blockers: [] });
});

test("a failed answer-key case or missing educator review blocks promotion", () => {
  const failed = reviewed({ results: AI_EVALUATION_CASES.map(item => ({ caseId: item.id, passed: item.id !== "answer-key-mismatch", educatorReviewed: true })) });
  assert.ok(assessAIPromotion(candidate, failed).blockers.includes("Case answer-key-mismatch failed."));
  const unreviewed = reviewed({ results: AI_EVALUATION_CASES.map(item => ({ caseId: item.id, passed: true, educatorReviewed: item.category !== "arabic-quality" })) });
  assert.ok(assessAIPromotion(candidate, unreviewed).blockers.includes("Case arabic-key needs educator review."));
});

test("an evaluation of a different model, prompt or dataset does not carry over", () => {
  const blockers = assessAIPromotion({ ...candidate, promptVersion: "phase5-ai-v1" }, reviewed({ datasetVersion: "older" })).blockers;
  assert.ok(blockers.some(item => item.includes("promptVersion")));
  assert.ok(blockers.some(item => item.includes("dataset older")));
});

test("missing case results and absent reviewers block promotion", () => {
  const blockers = assessAIPromotion(candidate, reviewed({ reviewedBy: [], results: [] })).blockers;
  assert.ok(blockers.includes("Evaluation has no named reviewer and review time."));
  assert.equal(blockers.filter(item => item.endsWith("has no result.")).length, AI_EVALUATION_CASES.length);
});
