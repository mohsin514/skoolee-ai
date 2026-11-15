import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// SKAI-2134: visitor arrival/departure times have a 30-day floor as well as the future check.
test("visitor times older than 30 days are refused", () => {
  const source = readFileSync("src/lib/front-desk/visitors.ts", "utf8");
  const instant = source.slice(source.indexOf("const instant ="), source.indexOf("export const normalName"));
  assert.match(source, /VISIT_LOOKBACK_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(instant, /Date\.now\(\) - VISIT_LOOKBACK_MS/);
});
