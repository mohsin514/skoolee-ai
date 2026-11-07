// SKAI-1001 walk (lane e, 2026-11-08, AR and UR accounts): these signed-in chrome strings still rendered in English.
import { test } from "node:test";
import assert from "node:assert/strict";
import { translateUi } from "../../src/lib/locale/ui-messages";

const KEYS = [
  "Conversations with teachers and the school office stay on the school record.",
  "SkooleeAI support asked to access one of your campuses. Nothing happens until you approve.",
  "≈{0} students per teacher",
  "vacant",
];

test("signed-in chrome found in English on the AR/UR walk is translated", () => {
  const missing: string[] = [];
  for (const language of ["ar", "ur"] as const) for (const key of KEYS) if (translateUi(key, language) === key) missing.push(`${language}: ${key}`);
  assert.deepEqual(missing, []);
});
