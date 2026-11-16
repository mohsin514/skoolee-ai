import assert from "node:assert/strict";
import { test } from "node:test";
import { Pseudonymizer } from "../../src/lib/ai/pseudonymize";
import { buildAIFeaturePrompt } from "../../src/lib/ai/prompts";

// SKAI-2191: names registered from the context are also masked in free text before the prompt leaves.
test("a question and a remark naming a pupil are masked in the final prompt", () => {
  const p = new Pseudonymizer();
  const context = p.maskObject({ students: [{ fullName: "Zain Bhatti" }], pendingReviewItems: [{ title: "Zain Bhatti report remark draft" }] });
  const input = p.maskObject({ question: "Is Zain Bhatti at risk?" });
  const prompt = buildAIFeaturePrompt({ role: "PRINCIPAL", feature: "at_risk_students", context, input } as never);
  const sent = p.mask(prompt.user);
  assert.equal(sent.includes("Zain Bhatti"), false);
  assert.match(sent, /\[(STUDENT|PERSON)_1\]/);
  assert.equal(p.unmask(sent).includes("Zain Bhatti"), true);
});

test("a fresh pseudonymizer with pupils registered masks a translation remark", () => {
  const p = new Pseudonymizer();
  p.token("Kashif Siddiqui", "STUDENT");
  assert.equal(p.mask("Kashif Siddiqui did well in maths this term."), "[STUDENT_1] did well in maths this term.");
});
