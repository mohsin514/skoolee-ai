import assert from "node:assert/strict";
import test from "node:test";
import { grantIntakeConsent, needsIntakeConsent, type IntakeKind } from "../../src/lib/school-ai/intake-consent";
import { schoolAICopy } from "../../src/lib/school-ai/copy";

// SKAI-814: voice, document and camera intake each ask for consent before anything is captured or sent.
test("each intake kind needs its own consent once per composer", () => {
  const kinds: IntakeKind[] = ["voice", "upload", "camera"];
  let granted: ReadonlySet<IntakeKind> = new Set();
  for (const kind of kinds) assert.equal(needsIntakeConsent(granted, kind), true);
  granted = grantIntakeConsent(granted, "upload");
  assert.equal(needsIntakeConsent(granted, "upload"), false);
  assert.equal(needsIntakeConsent(granted, "camera"), true);
  assert.equal(needsIntakeConsent(granted, "voice"), true);
});

test("granting returns a new set and never mutates the previous one", () => {
  const before: ReadonlySet<IntakeKind> = new Set();
  const after = grantIntakeConsent(before, "voice");
  assert.equal(before.size, 0);
  assert.equal(after.has("voice"), true);
});

test("consent copy exists for every kind in EN, AR and UR", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const c = schoolAICopy(language);
    for (const text of [c.consentVoice, c.consentUpload, c.consentCamera, c.consentAllow, c.consentCancel]) assert.ok(typeof text === "string" && text.trim().length > 0, language);
  }
});
