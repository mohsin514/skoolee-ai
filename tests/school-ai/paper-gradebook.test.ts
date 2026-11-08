import assert from "node:assert/strict";
import { test } from "node:test";
import { assessmentFixture } from "./assessment-fixture";
import { paperGradebookSendSchema, paperOutcomeEvidence } from "../../src/lib/school-ai/paper-gradebook";
import { paperGradebookCopy } from "../../src/lib/school-ai/paper-gradebook-copy";

test("paper outcome evidence counts each candidate once and excludes unselected choices", () => {
  const { paper } = assessmentFixture();
  const result = paperOutcomeEvidence(paper, [{ marks: { q1: 2, q3: 3 } }, { marks: { q2: 0, q3: 1 } }], new Map([["outcome-1", "Add whole numbers"]]));
  assert.deepEqual(result, [{ id: "outcome-1", title: "Add whole numbers", earned: 6, possible: 10, scoredShare: 60, candidates: 2 }]);
  assert.deepEqual(paperOutcomeEvidence(paper, [], new Map()), []);
  assert.equal(paperOutcomeEvidence({ ...paper, questions: paper.questions.map(question => ({ ...question, outcomeIds: ["outcome-1", "outcome-1"] })) }, [{ marks: { q1: 2, q3: 3 } }], new Map())[0].possible, 5, "repeated outcome ids do not inflate evidence");
});

test("paper gradebook confirmation requires a reviewed fingerprint and explicit conversion", () => {
  assert.equal(paperGradebookSendSchema.safeParse({ conversion: "EXACT" }).success, false);
  assert.equal(paperGradebookSendSchema.safeParse({ conversion: "PROPORTIONAL_WHOLE", previewHash: "a".repeat(64), idempotencyKey: "ca025c17-d78e-4aca-8ef2-26b71a1cba89" }).success, true);
});

test("paper gradebook copy has matching placeholders in English, Arabic and Urdu", () => {
  const en = paperGradebookCopy("en");
  for (const language of ["ar", "ur"] as const) {
    const translated = paperGradebookCopy(language);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      assert.ok(translated[key].trim());
      assert.deepEqual((translated[key].match(/\{\d+\}/g) ?? []).sort(), (en[key].match(/\{\d+\}/g) ?? []).sort(), key);
    }
  }
});
