import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { studioOfficeCopy } from "@/lib/school-ai/exam-studio-copy-office";

// SKAI-1574: a failed readiness load shows unknown/stale with Retry instead of hiding the control tower.
const src = readFileSync("src/components/academic/exams/ControlTower.tsx", "utf8");

test("HTTP, network and invalid-body failures set the failed state", () => {
  assert.match(src, /if \(!response\.ok \|\| !payload\?\.data \|\| !Array\.isArray\(payload\.data\.papers\)\) throw/);
  assert.match(src, /catch \{\s*setFailed\(true\);/);
});

test("initial failure renders an unknown tower; refresh failure keeps data marked stale", () => {
  assert.match(src, /data-ready="unknown"/);
  assert.match(src, /data-tower-failed=\{data \? "stale" : "unknown"\}/);
  assert.match(src, /\{data \? t\.towerStale : t\.towerLoadFailed\}/);
  assert.match(src, /onClick=\{\(\) => void load\(\)\}>\{t\.towerRetry\}/);
  assert.doesNotMatch(src, /if \(!data\) return null;/);
});

test("failure copy exists in every language", () => {
  for (const lang of ["en", "ar", "ur"] as const) {
    const t = studioOfficeCopy(lang);
    assert.ok(t.towerLoadFailed && t.towerStale && t.towerRetry, lang);
  }
});
