import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { passingPercentageFrom } from "../../src/lib/academic/pass-mark";

test("uses the configured pass mark, including non-default 40% and 35%", () => {
  assert.equal(passingPercentageFrom({ config: { passingPercentage: 40 } }), 40);
  assert.equal(passingPercentageFrom({ config: { passingPercentage: 35 } }), 35);
});

test("failed or malformed rule loads never fall back to 50", () => {
  for (const cfg of [null, {}, { config: null }, { config: { passingPercentage: "40" } }, { config: { passingPercentage: 140 } }, { error: "Failed" }]) {
    assert.equal(passingPercentageFrom(cfg), null);
  }
});

test("Pass/Fail is withheld with a retry while the rule is unknown", () => {
  const src = readFileSync("src/components/academic/exams/ExamDetailDialog.tsx", "utf8");
  assert.doesNotMatch(src, /useState\(50\)/);
  assert.match(src, /passPct !== null && pct >= passPct/);
  assert.match(src, /Could not load the pass mark, so Pass and Fail are hidden\./);
});
