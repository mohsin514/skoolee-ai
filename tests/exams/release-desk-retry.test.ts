import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { examReleaseCopy } from "@/components/school-ai/exam-release-copy";

// SKAI-1568: a failed first load of the release desk can be retried in place.
const src = readFileSync("src/components/school-ai/exam-release-panel.tsx", "utf8");

test("a missing readiness payload is a failure, not an empty desk", () => {
  assert.match(src, /if \(!readiness \|\| typeof readiness !== "object"\) throw new Error\(t\.failed\);/);
});

test("the unavailable branch shows a localized Retry that reloads the same record", () => {
  assert.match(src, /if \(!view\) return [\s\S]*?onClick=\{\(\) => void retryLoad\(\)\} data-release-retry>\{t\.retry\}/);
  assert.match(src, /const retryLoad = async \(\) => \{ setRetrying\(true\); setStatus\(null\); try \{ await load\(\); \}/);
  for (const lang of ["en", "ar", "ur"] as const) assert.ok(examReleaseCopy(lang).retry, lang);
});
