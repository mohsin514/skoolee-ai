import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examIncidentCopy } from "@/components/school-ai/exam-incident-copy";

// SKAI-1594: the remedy panel shows a load failure with Try again instead of vanishing.
const src = readFileSync("src/components/school-ai/exam-remedy-panel.tsx", "utf8");

test("HTTP, network and malformed-body failures set loadFailed", () => {
  assert.match(src, /fetch\(api, \{ cache: "no-store" \}\)\.catch\(\(\) => null\)/);
  assert.match(src, /if \(!Array\.isArray\(payload\?\.questions\) \|\| !Array\.isArray\(payload\?\.remedies\)\) \{ setLoadFailed\(true\); return; \}/);
});

test("initial failure keeps the section with Retry; refresh failure keeps loaded data", () => {
  assert.match(src, /if \(!data\) return failure \? <section[^]*?data-remedy-panel><h3[^]*?\{failure\}<\/section> : null;/);
  assert.match(src, /onClick=\{\(\) => void load\(\)\}>\{t\.remedyRetry\}/);
  assert.match(src, /\{t\.remedyHint\}<\/p>\n\s*\{failure\}/);
  assert.doesNotMatch(src, /setLoadFailed\(true\);[^\n]*setData\(null\)/);
});

test("copy exists in every language", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = examIncidentCopy(lang);
    assert.ok(t.remedyLoadFailed && t.remedyRetry, lang);
  }
});
