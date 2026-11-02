import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1553: Student Reports shows Arabic and Urdu remarks, not only remarksEn.
const src = readFileSync("src/app/student/reports/page.tsx", "utf8");

test("the remark is picked by report language with a fallback", () => {
  assert.match(src, /report\.language === "ar" \? report\.remarksAr : report\.language === "ur" \? report\.remarksUr : report\.remarksEn/);
  assert.match(src, /return own \|\| report\.remarksEn \|\| report\.remarksAr \|\| report\.remarksUr \|\| ""/);
  assert.doesNotMatch(src, /\{report\.remarksEn \?/);
});
