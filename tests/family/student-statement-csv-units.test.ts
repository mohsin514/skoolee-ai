import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/student/fees/page.tsx", "utf8");

test("SKAI-2102: the student statement CSV converts minor units to major units", () => {
  const rows = source.slice(source.indexOf("rows.push(["), source.indexOf("// SKAI-1653"));
  assert.match(rows, /major\(invoice\.totalAmount, invoice\.currency\)/);
  assert.match(rows, /major\(invoice\.paid, invoice\.currency\)/);
  assert.match(rows, /major\(invoice\.balance, invoice\.currency\)/);
  assert.doesNotMatch(rows, /^\s*invoice\.(totalAmount|paid|balance),/m);
  assert.match(source, /paisaToRupees\(minor, currency\)\.toFixed\(minorUnits\(currency\)\)/);
});
