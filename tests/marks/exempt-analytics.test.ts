import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("SKAI-1433: exempt papers leave the marks averages like absent ones", () => {
  const source = readFileSync("src/app/api/marks/route.ts", "utf8");
  const loop = source.slice(source.indexOf("for (const mark of marks)"), source.indexOf("subjectTotal.obtained +="));
  assert.match(loop, /if \(mark\.isAbsent \|\| mark\.isExempt\) continue;/);
});
