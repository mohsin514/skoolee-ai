import { test } from "node:test";
import assert from "node:assert/strict";
import { setupFinishLabel, setupGenerationCopy } from "../../src/components/school-ai/setup-generation-copy";

test("last setup question promises automatic setup only when AI Workflows can run it", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const copy = setupGenerationCopy(language);
    assert.equal(setupFinishLabel(copy, true), copy.finish);
    assert.equal(setupFinishLabel(copy, false), copy.finishManual);
    assert.notEqual(copy.finishManual, copy.finish);
  }
});
