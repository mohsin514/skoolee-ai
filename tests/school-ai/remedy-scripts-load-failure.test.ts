import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examIncidentCopy } from "@/components/school-ai/exam-incident-copy";

// SKAI-1596: a failed manual-remedy script load is a retryable error, distinct from a question with no scripts.
const src = readFileSync("src/components/school-ai/exam-remedy-panel.tsx", "utf8");

test("non-OK, network and malformed responses become a failed state, ignoring stale responses", () => {
  assert.match(src, /const payload = response\.ok \? await response\.json\(\)\.catch\(\(\) => null\) : null;\n\s*if \(!Array\.isArray\(payload\?\.scripts\)\) throw/);
  assert.match(src, /\.catch\(\(\) => \{ if \(live\) \{ setScripts\(\[\]\); setScriptsState\("failed"\); \} \}\);/);
  assert.match(src, /\}, \[api, manual, questionId, scriptsTry\]\);/);
});

test("failed and genuinely empty states render differently; Retry reloads the same question", () => {
  assert.match(src, /scriptsState === "failed" \? <div role="alert"[^>]*data-remark-scripts-failed>/);
  assert.match(src, /onClick=\{\(\) => setScriptsTry\(value => value \+ 1\)\}>\{t\.remedyRetry\}/);
  assert.match(src, /scriptsState === "loaded" && scripts\.length === 0 \? <p[^>]*data-remark-scripts-empty>\{t\.scriptsNone\}/);
});

test("copy exists in every language", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = examIncidentCopy(lang);
    assert.ok(t.scriptsLoadFailed && t.scriptsNone, lang);
  }
});
