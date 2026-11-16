import assert from "node:assert/strict";
import { test } from "node:test";
import { AICreditError } from "../../src/lib/ai/openai";
import { schoolAiError } from "../../src/lib/school-ai/http";
import { schoolAICopy } from "../../src/lib/school-ai/copy";
import { WorkspaceRequestError, workspaceErrorText } from "../../src/components/school-ai/workspace-client";

// SKAI-2204: an exhausted credit balance reaches the workspace as a stable, localised message.
test("AI credit exhaustion carries AI_CREDITS_EXHAUSTED and maps to the credits copy", async () => {
  const response = schoolAiError(new AICreditError("AI credit limit reached"));
  assert.equal(response.status, 402);
  assert.deepEqual(await response.json(), { error: "AI credit limit reached", code: "AI_CREDITS_EXHAUSTED" });
  for (const lang of ["en", "ar", "ur"] as const) {
    const copy = schoolAICopy(lang);
    assert.equal(workspaceErrorText(new WorkspaceRequestError("failed", [], "AI_CREDITS_EXHAUSTED"), copy), copy.AI_CREDITS_EXHAUSTED);
  }
});
