import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_RELEASE_THRESHOLDS } from "@/config/ai-release-thresholds";
import { AI_EVALUATION_CASES, AI_EVALUATION_DATASET_VERSION, type AIReleaseEvaluation } from "@/lib/ai/evaluation";
import { evaluationFingerprint, type EvaluationStatus } from "@/lib/ai-evaluation/educator/gate";
import { EDUCATOR_EVAL_PACKS } from "@/lib/ai-evaluation/educator/item-set";
import { D5_THRESHOLDS } from "@/lib/ai-evaluation/educator/metrics";
import { aiReleaseGateRequired, assessAIReleaseGate } from "@/lib/ai-evaluation/release-gate";

const candidate = { model: "openai:test-model", promptVersion: "p1", policyVersion: "g1" };
const now = new Date("2026-10-30T00:00:00Z");
const signOff = { signedOffBy: "QA-01 academic lead", role: "Academic lead", signedOffAt: "2026-10-01T00:00:00Z" };
const promotion: AIReleaseEvaluation = {
  ...candidate, datasetVersion: AI_EVALUATION_DATASET_VERSION, reviewedBy: ["EN-R1"], reviewedAt: "2026-10-20T00:00:00Z",
  results: AI_EVALUATION_CASES.map(item => ({ caseId: item.id, passed: true, educatorReviewed: true })),
};
const passing = { items: 30, alignment: 0.95, criticalErrors: 0, markingAgreement: 0.9, kappa: 0.8, disputed: 0 };

function status(edit: (metrics: typeof passing) => typeof passing = m => m, evaluatedAt = "2026-10-20T00:00:00Z"): EvaluationStatus {
  const result = { verdict: "PASSED" as const, itemSetSha256: "a".repeat(64), setVersion: "1.0.0", evaluatedAt, metrics: edit({ ...passing }), failures: [] };
  return {
    fingerprint: evaluationFingerprint(candidate), model: candidate.model, updatedAt: evaluatedAt,
    packs: Object.fromEntries(EDUCATOR_EVAL_PACKS.map(pack => [pack, Object.fromEntries(AI_RELEASE_THRESHOLDS.launchLanguages.map(language => [language, result]))])),
  };
}
const gate = (overrides: Partial<Parameters<typeof assessAIReleaseGate>[0]> = {}) =>
  assessAIReleaseGate({ candidate, promotion, status: status(), signOff, now, ...overrides });

test("complete, current, signed-off evidence above threshold is approved", () => {
  assert.deepEqual(gate(), { approved: true, blockers: [] });
});

test("the committed repository state is blocked (no sign-off, no evidence)", () => {
  const result = gate({ promotion: null, signOff: null, status: { fingerprint: null, model: null, updatedAt: null, packs: {} } });
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some(b => b.includes("not signed off")));
  assert.ok(result.blockers.some(b => b.includes("No recorded evaluation")));
  assert.ok(result.blockers.some(b => b.includes("No educator evaluation results")));
});

test("results for another model or prompt are stale", () => {
  const result = gate({ candidate: { ...candidate, promptVersion: "p2" } });
  assert.equal(result.approved, false);
  assert.ok(result.blockers.some(b => b.includes("stale")));
});

test("evidence older than the age limit is stale", () => {
  const old = new Date(now.getTime() - (AI_RELEASE_THRESHOLDS.maxEvidenceAgeDays + 1) * 86_400_000).toISOString();
  assert.ok(gate({ status: status(m => m, old), signOff: { ...signOff, signedOffAt: "2020-01-01T00:00:00Z" } }).blockers.some(b => b.includes("older than")));
});

test("results observed before the thresholds were signed off are refused", () => {
  assert.ok(gate({ signOff: { ...signOff, signedOffAt: "2026-10-25T00:00:00Z" } }).blockers.some(b => b.includes("before the thresholds")));
});

test("a missing launch language blocks the release", () => {
  const s = status();
  s.packs[EDUCATOR_EVAL_PACKS[0]] = { en: s.packs[EDUCATOR_EVAL_PACKS[0]].en };
  assert.ok(gate({ status: s }).blockers.some(b => b.includes("(ur): no evaluation result")));
});

for (const [name, edit, needle] of [
  ["too few items", (m: typeof passing) => ({ ...m, items: 29 }), "needs 30"],
  ["one critical case", (m: typeof passing) => ({ ...m, criticalErrors: 1 }), "critical wrong-key"],
  ["low alignment", (m: typeof passing) => ({ ...m, alignment: 0.89 }), "alignment"],
  ["low marking agreement", (m: typeof passing) => ({ ...m, markingAgreement: 0.84 }), "marking agreement"],
  ["low kappa", (m: typeof passing) => ({ ...m, kappa: 0.59 }), "kappa"],
] as const) {
  test(`below threshold: ${name} blocks the release`, () => {
    const result = gate({ status: status(edit) });
    assert.equal(result.approved, false);
    assert.ok(result.blockers.some(b => b.includes(needle)), result.blockers.join("\n"));
  });
}

test("a non-PASSED verdict blocks even with good metrics", () => {
  const s = status();
  s.packs[EDUCATOR_EVAL_PACKS[1]] = { ...s.packs[EDUCATOR_EVAL_PACKS[1]], ar: { ...s.packs[EDUCATOR_EVAL_PACKS[1]].ar, verdict: "REPEAT" } };
  assert.ok(gate({ status: s }).blockers.some(b => b.includes("verdict REPEAT")));
});

test("a blank sign-off does not count", () => {
  assert.ok(gate({ signOff: { signedOffBy: " ", role: "Lead", signedOffAt: "2026-10-01" } }).blockers.some(b => b.includes("not signed off")));
});

test("the gate is required unless AI is explicitly off", () => {
  assert.equal(aiReleaseGateRequired({}), true);
  assert.equal(aiReleaseGateRequired({ AI_FEATURES_ENABLED: "true" }), true);
  assert.equal(aiReleaseGateRequired({ AI_FEATURES_ENABLED: "no" }), true);
  assert.equal(aiReleaseGateRequired({ AI_FEATURES_ENABLED: "FALSE" }), false);
});

test("D5 metric thresholds come from the single config file", () => {
  for (const key of ["minAlignment", "maxCriticalErrors", "minMarkingAgreement", "minKappa"] as const) assert.equal(D5_THRESHOLDS[key], AI_RELEASE_THRESHOLDS[key]);
});
