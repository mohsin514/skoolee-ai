import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { freezeItemSet, itemSetContentSha256, validateItemSet, type ItemSet } from "@/lib/ai-evaluation/educator/item-set";
import { cohensKappa, evaluateReviews, type ReviewFile } from "@/lib/ai-evaluation/educator/metrics";
import { evaluationFingerprint, packAiEvaluationGate, type EvaluationStatus } from "@/lib/ai-evaluation/educator/gate";
import { parseMark, runEducatorEvaluation, type Scorer } from "@/lib/ai-evaluation/educator/runner";
import { curriculumPackGate } from "@/lib/school-ai/curriculum-pack-registry";
import { PIILeakError } from "@/lib/ai/pseudonymize";

const version = { model: "openai:test-model", promptVersion: "p1", policyVersion: "g1" };
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

function makeSet(n: number, placeholder = false): ItemSet {
  return {
    schemaVersion: 1, pack: "fbise-g9-maths", language: "en", setVersion: "1.0.0", placeholder, frozen: null,
    items: Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, topic: "Algebra", difficulty: "easy" as const, stem: `Solve x + ${i} = ${i + 2}`, referenceAnswer: "x = 2", maxMarks: 2, syntheticResponse: "x = 2", placeholder })),
  };
}

test("kappa matches textbook values and edge cases", () => {
  // Classic 2x2: 20 yes/yes, 5 yes/no, 10 no/yes, 15 no/no -> po 0.7, pe 0.5, kappa 0.4.
  const a = [...Array(25).fill(true), ...Array(25).fill(false)];
  const b = [...Array(20).fill(true), ...Array(5).fill(false), ...Array(10).fill(true), ...Array(15).fill(false)];
  near(cohensKappa(a, b), 0.4);
  near(cohensKappa([1, 2, 3], [1, 2, 3]), 1);
  assert.equal(cohensKappa([true, true], [true, true]), 1);
  assert.equal(cohensKappa([true, false], [false, true]) < 0, true);
  assert.throws(() => cohensKappa([1], [1, 2]));
});

test("frozen sets refuse edits, un-frozen sets, placeholders and short sets", () => {
  assert.deepEqual(validateItemSet(makeSet(30)).ok, false);
  const frozen = freezeItemSet(makeSet(30));
  assert.equal(validateItemSet(frozen).ok, true);
  assert.throws(() => freezeItemSet(frozen));
  const edited = structuredClone(frozen);
  edited.items[0].referenceAnswer = "x = 3";
  const check = validateItemSet(edited);
  assert.ok(!check.ok && check.errors.some(e => e.includes("edited after it was frozen")));
  const short = validateItemSet(freezeItemSet(makeSet(5)));
  assert.ok(!short.ok && short.errors.some(e => e.includes("floor is 30")));
  const placeholder = freezeItemSet(makeSet(30, true));
  assert.equal(validateItemSet(placeholder).ok, false);
  assert.equal(validateItemSet(placeholder, { allowPlaceholder: true }).ok, true);
});

test("committed placeholder sets are frozen, unedited and refused for real scoring", () => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "evaluation/educator/items/ksa-intermediate-maths/ar/items.json"), "utf8"));
  assert.equal(validateItemSet(raw, { allowPlaceholder: true }).ok, true);
  assert.equal(validateItemSet(raw).ok, false);
});

function review(reviewer: string, sha: string, n: number, override: (i: number) => Partial<{ aligned: boolean; critical: boolean; mark: number }> = () => ({})): ReviewFile {
  return { reviewer, itemSetSha256: sha, items: Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, aligned: true, critical: false, mark: 2, ...override(i) })) };
}

test("review metrics: adjudication, thresholds and repeat on low kappa", () => {
  const sha = "a".repeat(64);
  const ids = Array.from({ length: 30 }, (_, i) => `item-${i}`);
  const marks = Object.fromEntries(ids.map(id => [id, 2]));
  const base = { itemIds: ids, itemSetSha256: sha, aiMarks: marks };
  // Varied alignment so kappa is defined: both reviewers say items 0-1 are not aligned.
  const notAligned = (i: number) => ({ aligned: i > 1 });
  const pass = evaluateReviews({ ...base, reviewerA: review("EN-R1", sha, 30, notAligned), reviewerB: review("EN-R2", sha, 30, notAligned), adjudication: null });
  assert.equal(pass.metrics.alignment, 28 / 30);
  assert.equal(pass.metrics.kappa, 1);
  assert.equal(pass.verdict, "PASSED");

  // Disputed mark without adjudication is an error; with it, the adjudicator decides.
  const disputedB = review("EN-R2", sha, 30, i => ({ ...notAligned(i), mark: i === 5 ? 1 : 2 }));
  assert.throws(() => evaluateReviews({ ...base, reviewerA: review("EN-R1", sha, 30, notAligned), reviewerB: disputedB, adjudication: null }), /no adjudication/);
  const adjudicated = evaluateReviews({ ...base, reviewerA: review("EN-R1", sha, 30, notAligned), reviewerB: disputedB, adjudication: { reviewer: "EN-ADJ", itemSetSha256: sha, items: [{ id: "item-5", aligned: true, critical: true, mark: 1 }] } });
  assert.equal(adjudicated.metrics.disputed, 1);
  assert.equal(adjudicated.metrics.criticalErrors, 1);
  assert.equal(adjudicated.verdict, "FAILED");

  const lowMarks = evaluateReviews({ ...base, aiMarks: { ...marks, "item-0": 0, "item-1": 0, "item-2": 0, "item-3": 0, "item-4": 0 }, reviewerA: review("EN-R1", sha, 30, notAligned), reviewerB: review("EN-R2", sha, 30, notAligned), adjudication: null });
  near(lowMarks.metrics.markingAgreement, 25 / 30);
  assert.equal(lowMarks.verdict, "FAILED");

  const disagreeB = review("EN-R2", sha, 30, i => ({ aligned: i % 2 === 0 }));
  const adjAll: ReviewFile = { reviewer: "EN-ADJ", itemSetSha256: sha, items: ids.map(id => ({ id, aligned: true, critical: false, mark: 2 })) };
  const repeat = evaluateReviews({ ...base, reviewerA: review("EN-R1", sha, 30, notAligned), reviewerB: disagreeB, adjudication: adjAll });
  assert.equal(repeat.verdict, "REPEAT");
  assert.throws(() => evaluateReviews({ ...base, reviewerA: review("EN-R1", sha, 30), reviewerB: review("EN-R1", sha, 30), adjudication: null }), /different reviewers/);
});

test("pack AI gate: failures always block, missing results block only when enforced", () => {
  const fp = evaluationFingerprint(version);
  assert.notEqual(fp, evaluationFingerprint({ ...version, model: "openai:other" }));
  const empty: EvaluationStatus = { fingerprint: null, model: null, updatedAt: null, packs: {} };
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", empty, fp, false).allowed, true);
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", empty, fp, true).allowed, false);
  const metrics = { items: 30, alignment: 1, criticalErrors: 0, markingAgreement: 1, kappa: 1, disputed: 0 };
  const result = (verdict: "PASSED" | "FAILED") => ({ verdict, itemSetSha256: "x", setVersion: "1.0.0", evaluatedAt: "t", metrics, failures: verdict === "FAILED" ? ["Alignment low."] : [] });
  const failed: EvaluationStatus = { fingerprint: fp, model: version.model, updatedAt: "t", packs: { "fbise-g9-maths": { en: result("FAILED") } } };
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", failed, fp, false).allowed, false);
  assert.equal(packAiEvaluationGate("bise-lahore-ssc1-mathematics-2027", failed, fp, false).allowed, true);
  // A stale fingerprint no longer counts as a measured failure, but is still unevaluated when enforced.
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", failed, "other", true).allowed, false);
  const passed: EvaluationStatus = { ...failed, packs: { "fbise-g9-maths": { en: result("PASSED"), ur: result("PASSED"), ar: result("PASSED") } } };
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", passed, fp, true).allowed, true);
  const partial: EvaluationStatus = { ...failed, packs: { "fbise-g9-maths": { en: result("PASSED") } } };
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", partial, fp, true).allowed, false);

  const gate = curriculumPackGate({ declared: { packId: "p", version: 1 }, knownPackIds: new Set(["p"]), catalogue: null, activation: null, aiEvaluation: { allowed: false, reasons: ["off"] } });
  assert.ok(gate.gated && !gate.allowed && gate.code === "CURRICULUM_PACK_NOT_ACTIVE", "activation is still checked first");
});

test("runner scores with a mocked model, reuses results until the fingerprint changes, and records verdicts", async () => {
  const root = mkdtempSync(join(tmpdir(), "d5-eval-"));
  const statusPath = join(root, "status.json");
  const set = freezeItemSet(makeSet(30));
  mkdirSync(join(root, "items/fbise-g9-maths/en"), { recursive: true });
  writeFileSync(join(root, "items/fbise-g9-maths/en/items.json"), JSON.stringify(set));
  let calls = 0;
  const prompts: string[] = [];
  const scorer: Scorer = async messages => { calls++; prompts.push(messages.user); return 2; };

  const first = await runEducatorEvaluation({ root, statusPath, version, scorer });
  assert.equal(calls, 30);
  assert.equal(first.reports.find(r => r.pack === "fbise-g9-maths" && r.language === "en")?.state, "SCORED");
  await runEducatorEvaluation({ root, statusPath, version, scorer });
  assert.equal(calls, 30, "same fingerprint reuses stored marks");
  await runEducatorEvaluation({ root, statusPath, version: { ...version, promptVersion: "p2" }, scorer });
  assert.equal(calls, 60, "prompt change re-scores");
  assert.ok(prompts.every(prompt => !prompt.includes("@")));

  const fp = evaluationFingerprint(version).slice(0, 16);
  const sha = itemSetContentSha256(set);
  const dir = join(root, "reviews", fp, "fbise-g9-maths/en");
  mkdirSync(dir, { recursive: true });
  const reviewed = (r: string) => review(r, sha, 30, i => ({ aligned: i !== 0, critical: i === 0 }));
  writeFileSync(join(dir, "reviewer-a.json"), JSON.stringify(reviewed("EN-R1")));
  writeFileSync(join(dir, "reviewer-b.json"), JSON.stringify(reviewed("EN-R2")));
  const run = await runEducatorEvaluation({ root, statusPath, version, scorer });
  assert.equal(run.status.packs["fbise-g9-maths"].en.verdict, "FAILED");
  assert.equal(packAiEvaluationGate("fbise-ssc1-mathematics-2027", run.status, run.fingerprint, false).allowed, false);
});

test("runner refuses PII in a prompt and invalid model marks", async () => {
  const root = mkdtempSync(join(tmpdir(), "d5-pii-"));
  const set = makeSet(30);
  set.items[0].syntheticResponse = "Contact me at parent@example.com";
  mkdirSync(join(root, "items/fbise-g9-maths/en"), { recursive: true });
  writeFileSync(join(root, "items/fbise-g9-maths/en/items.json"), JSON.stringify(freezeItemSet(set)));
  await assert.rejects(runEducatorEvaluation({ root, statusPath: join(root, "s.json"), version, scorer: async () => 1 }), PIILeakError);
  assert.equal(parseMark('{"mark":2}', 2), 2);
  assert.throws(() => parseMark('{"mark":3}', 2));
});
