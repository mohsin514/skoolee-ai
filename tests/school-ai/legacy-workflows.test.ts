import assert from "node:assert/strict";
import { test } from "node:test";
import { approvedOpenAIEndpoint, openAICompletionSettings } from "../../src/lib/ai/openai-settings";
import { getAIPrototypeDraft } from "../../src/lib/ai/prototype";
import { AI_FEATURES } from "../../src/lib/ai/prompts";

test("configured OpenAI models use compatible completion controls", () => {
  assert.deepEqual(openAICompletionSettings("gpt-4o-mini", 0.4, 700), { temperature: 0.4, max_completion_tokens: 700 });
  for (const model of ["o1", "o3-mini", "o4-mini", "gpt-5", "gpt-5-mini", "gpt-5.1"]) {
    const settings = openAICompletionSettings(model, 0.4, 700);
    assert.equal("temperature" in settings, false, model);
    assert.equal("max_tokens" in settings, false, model);
    assert.ok(settings.max_completion_tokens > 700, "reasoning has a budget beyond visible output");
  }
});

test("readiness and requests accept only the approved OpenAI API destination", () => {
  for (const url of ["https://api.openai.com/v1", "https://api.openai.com/v1/"]) assert.equal(approvedOpenAIEndpoint(url), true);
  for (const url of ["https://api.openai.com/other", "http://api.openai.com/v1", "https://api.openai.com:123/v1", "https://user:secret@api.openai.com/v1", "https://api.openai.com/v1?forward=elsewhere", "https://unapproved.example/v1", "broken"])
    assert.equal(approvedOpenAIEndpoint(url), false, url);
});

test("every legacy AI feature has an explicit fictional, uncharged sample preview", () => {
  const outputs = new Set<string>();
  for (const feature of AI_FEATURES) {
    const sample = getAIPrototypeDraft(feature);
    assert.ok(sample, feature);
    assert.match(sample.output, /^SAMPLE DATA/);
    assert.match(sample.output, /Fictional preview; no school records were used or saved/);
    assert.equal(sample.saved, false);
    assert.equal(sample.tokensUsed, 0);
    assert.match(sample.model, /^demo:/);
    outputs.add(sample.output);
  }
  assert.equal(outputs.size, AI_FEATURES.length);
  assert.equal(getAIPrototypeDraft("unknown"), null);
  assert.equal(getAIPrototypeDraft("__proto__"), null);
});
