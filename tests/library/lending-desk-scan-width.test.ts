import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-2166: at phone width the scan field must keep a floor width so the buttons wrap instead of squeezing it.
test("lending desk scan field keeps a minimum width below sm", () => {
  const src = readFileSync("src/components/library/lending-desk.tsx", "utf8");
  const line = src.split("\n").find((l) => l.includes('name="desk-scan"'));
  assert.ok(line, "scan FormField present");
  assert.match(line, /className="[^"]*(?<![:\w-])min-w-\[12rem\]/);
  assert.doesNotMatch(line, /(?<![:\w-])min-w-0(?![\w-])/);
});
