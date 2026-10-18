import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resultGradeLabel } from "../../src/lib/locale/result-grade";
import { translateUi } from "../../src/lib/locale/ui-messages";

// SKO-496: the academic-result "Grade" and the school-level "Grade" are different words in Arabic and Urdu.
test("result grade uses the report-card wording, distinct from the school-level grade", () => {
  assert.equal(resultGradeLabel("en"), "Grade");
  assert.equal(resultGradeLabel("ar"), "التقدير");
  assert.equal(resultGradeLabel("ur"), "گریڈ");
  for (const lang of ["ar", "ur"] as const) assert.notEqual(resultGradeLabel(lang), translateUi("Grade", lang), `${lang}: result is not the school level`);
  assert.equal(translateUi("Grade", "ar"), "الصف", "school-level labels elsewhere are unchanged");
});

test("the class final-grades PDF labels its result column as a result", () => {
  const source = readFileSync("src/lib/pdf.tsx", "utf8");
  const fn = source.slice(source.indexOf("export async function generateClassGradesPdf"), source.indexOf("export", source.indexOf("export async function generateClassGradesPdf") + 10));
  assert.ok(fn.includes("resultGradeLabel(locale.language)"));
  assert.ok(!fn.includes('t("Grade")'), "no ambiguous catalog lookup for the result column");
});
