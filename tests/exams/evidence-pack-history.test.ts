import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioEvidenceCopy } from "@/lib/school-ai/exam-studio-copy-evidence";

// SKAI-1570: evidence-pack history failures are not shown as "no packs".
const src = readFileSync("src/components/school-ai/exam-studio/evidence-pack-panel.tsx", "utf8");

test("non-OK, network and malformed reads set historyFailed; 403 stays an empty list", () => {
  assert.match(src, /if \(response\.status === 403\) \{ setPacks\(\[\]\); setHistoryFailed\(false\); return; \}/);
  assert.match(src, /if \(!response\.ok \|\| !Array\.isArray\(payload\?\.packs\)\) throw/);
  assert.match(src, /catch \{\s*setHistoryFailed\(true\);/);
  assert.doesNotMatch(src, /setPacks\(response\.ok \? payload\.packs as PackRow\[\] : \[\]\)/);
});

test("the failure shows Retry and suppresses the empty copy; loaded rows stay", () => {
  assert.match(src, /historyFailed \? <p role="alert"[\s\S]*?onClick=\{\(\) => void load\(\)\}>\{t\.retry\}/);
  assert.match(src, /packs\.length === 0 && historyFailed \? null : packs\.length === 0 \?/);
  for (const lang of ["en", "ar", "ur"] as const) { const t = studioEvidenceCopy(lang); assert.ok(t.historyFailed && t.retry, lang); }
});
