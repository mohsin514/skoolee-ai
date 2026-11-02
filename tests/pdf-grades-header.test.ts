import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1646: final-grades PDF repeats its column headings on every page and never splits a row.
const source = readFileSync("src/lib/pdf.tsx", "utf8");
const body = source.slice(source.indexOf("generateClassGradesPdf"));

test("grade table heading is fixed so it repeats on later pages", () => {
  assert.match(body, /<View fixed style=\{\[styles\.row, styles\.th,/);
});

test("grade rows do not split across pages", () => {
  assert.match(body, /<View key=\{r\.studentId\} wrap=\{false\} style=/);
});
