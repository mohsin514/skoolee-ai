import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1532: a reports API failure is never shown as "No report cards yet".
const src = readFileSync("src/components/academic/exams/ReportCardsPanel.tsx", "utf8");

test("the reports fetch checks the status and the response shape", () => {
  assert.match(src, /fetch\(`\/api\/reports\?\$\{sp\}`\)\s*\.then\(\(r\) => \(r\.ok \? r\.json\(\) : \{ success: false \}\)\)\s*\.catch/);
  assert.match(src, /reportRes\?\.success !== false && Array\.isArray\(reportRes\?\.reportCards\)/);
});

test("a failure keeps existing cards and shows a retry", () => {
  const branch = src.slice(src.indexOf("Array.isArray(reportRes?.reportCards)"), src.indexOf("if (!marksRes?.success)"));
  assert.match(branch, /else \{\s*setCardsFailed\(true\);\s*\}/);
  assert.doesNotMatch(branch.split("} else {")[1], /setCards\(/);
  assert.match(src, /cardsFailed \? \([\s\S]*<ErrorState[\s\S]*onRetry=\{\(\) => void load\(\)\}/);
  assert.match(src, /cardsFailed && cards\.length === 0 \? null : cards\.length === 0 \?/);
});
